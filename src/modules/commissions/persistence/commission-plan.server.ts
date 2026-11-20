import type pg from "pg";
import {
  CommissionError,
  isMonthStart,
  isValidPlanName,
  validatePlanVersion,
} from "../domain/plan";
import type { PlanRules, TierSchedule } from "../domain/plan";
import { periodStart } from "../domain/period";
import type { CommissionPeriod } from "../domain/period";
import type {
  CommissionPlanRepository,
  PlanWithVersions,
  ResolvedPlan,
  StaffAssignment,
} from "../ports/plan-repository";

/** صف إصدار كما تقرأه قاعدة البيانات قبل التحويل إلى قواعد المجال. */
type VersionRow = {
  planId: string;
  planName: string;
  versionId: string;
  version: number;
  effectiveMonth: string;
  baseRateBp: string | null;
  baseFixedMills: string | null;
  tierMode: "excess" | "all_after" | null;
  tierAccumulator: "sales_amount" | "session_count" | null;
  legacyRateBp: string | null;
  legacyThresholdMills: string | null;
  legacySalaryMultipleMilli: string | null;
};

/** صف شريحة كما تقرأه قاعدة البيانات. */
type TierRow = {
  tierOrder: number;
  rateBp: string | null;
  fixedMills: string | null;
  thresholdMills: string | null;
  thresholdSalaryMultipleMilli: string | null;
  thresholdSessionCount: number | null;
};

export function pgCommissionPlanRepository(
  db: pg.PoolClient,
  userId: string,
  companyId: string,
): CommissionPlanRepository {
  const audit = async (
    action: string,
    entity: string,
    entityId: string,
    details: Record<string, string | number>,
  ) => {
    await db.query(
      `insert into public.audit_log(company_id,actor_user_id,action,entity,entity_id,details)
       values($1,$2,$3,$4,$5,$6)`,
      [companyId, userId, action, entity, entityId, JSON.stringify(details)],
    );
  };
  return {
    async createPlan(input) {
      if (!isValidPlanName(input.name)) throw new CommissionError("PLAN_INVALID");
      const { rows } = await db.query<{ id: string }>(
        `insert into public.commission_plans(company_id,name,created_by)
         values($1,$2,$3) returning id`,
        [companyId, input.name.trim(), userId],
      );
      const id = rows[0]!.id;
      await audit("commission_plan.created", "commission_plan", id, { name: input.name.trim() });
      return { id };
    },
    async addVersion(input) {
      requireMonthStart(input.effectiveMonth);
      const validation = validatePlanVersion(input.rules);
      if (validation) throw new CommissionError(validation);
      await db.query("select pg_advisory_xact_lock(hashtextextended($1, 0))", [
        `commission_plan:${input.planId}`,
      ]);
      const { rows } = await db.query<{ id: string; version: number }>(
        `insert into public.commission_plan_versions(
           company_id,plan_id,version,effective_month,base_rate_bp,base_fixed_mills,
           tier_mode,tier_accumulator,created_by
         )
         select $1,$2,coalesce(max(v.version),0)+1,$3,$4,$5,$6,$7,$8
         from public.commission_plan_versions v
         where v.company_id=$1 and v.plan_id=$2
         returning id,version`,
        [companyId, input.planId, input.effectiveMonth, ...versionParameters(input.rules), userId],
      );
      const row = rows[0]!;
      await insertTiers(db, companyId, row.id, input.rules.tierSchedule);
      await audit("commission_plan.version_added", "commission_plan_version", row.id, {
        planId: input.planId,
        effectiveMonth: input.effectiveMonth,
        version: row.version,
      });
      return { id: row.id, version: row.version };
    },
    async assign(input) {
      requireMonthStart(input.effectiveMonth);
      const { rows } = await db.query<{ id: string }>(
        `insert into public.staff_commission_plans(
           company_id,staff_id,plan_id,effective_month,assigned_by
         ) values($1,$2,$3,$4,$5) returning id`,
        [companyId, input.staffId, input.planId, input.effectiveMonth, userId],
      );
      const id = rows[0]!.id;
      await audit("commission_plan.assigned", "staff_commission_plan", id, {
        staffId: input.staffId,
        planId: input.planId,
        effectiveMonth: input.effectiveMonth,
      });
      return { id };
    },
    async resolve(resolveCompanyId, staffId, period) {
      const { rows } = await db.query<VersionRow>(
        `with latest_assignment as (
           select plan_id from public.staff_commission_plans
           where company_id=$1 and staff_id=$2 and effective_month <= $3::date
           order by effective_month desc,assigned_at desc limit 1
         )
         select p.id as "planId",p.name as "planName",v.id as "versionId",v.version,
           v.effective_month::text as "effectiveMonth",
           v.base_rate_bp::text as "baseRateBp",v.base_fixed_mills::text as "baseFixedMills",
           v.tier_mode as "tierMode",v.tier_accumulator as "tierAccumulator",
           v.tier_rate_bp::text as "legacyRateBp",v.tier_threshold_mills::text as "legacyThresholdMills",
           v.tier_salary_multiple_milli::text as "legacySalaryMultipleMilli"
         from latest_assignment a
         join public.commission_plans p on p.company_id=$1 and p.id=a.plan_id
         join public.commission_plan_versions v on v.company_id=$1 and v.plan_id=a.plan_id
         where v.effective_month <= $3::date
         order by v.effective_month desc,v.version desc limit 1`,
        [resolveCompanyId, staffId, periodStart(period)],
      );
      const row = rows[0];
      if (!row) return null;
      const rules = await mapRules(db, companyId, row);
      return {
        planId: row.planId,
        planName: row.planName,
        versionId: row.versionId,
        version: row.version,
        rules,
      };
    },
    async listPlansWithLatestVersions() {
      const { rows } = await db.query<VersionRow & { planOrder: number }>(
        `select p.id as "planId",p.name as "planName",v.id as "versionId",v.version,
           v.effective_month::text as "effectiveMonth",
           v.base_rate_bp::text as "baseRateBp",v.base_fixed_mills::text as "baseFixedMills",
           v.tier_mode as "tierMode",v.tier_accumulator as "tierAccumulator",
           v.tier_rate_bp::text as "legacyRateBp",v.tier_threshold_mills::text as "legacyThresholdMills",
           v.tier_salary_multiple_milli::text as "legacySalaryMultipleMilli",
           row_number() over (order by p.created_at,p.id) as "planOrder"
         from public.commission_plans p
         join public.commission_plan_versions v on v.company_id=p.company_id and v.plan_id=p.id
         where p.company_id=$1
         order by "planOrder",v.effective_month desc,v.version desc`,
        [companyId],
      );
      const plans = new Map<string, PlanWithVersions>();
      for (const row of rows) {
        const plan = plans.get(row.planId) ?? { id: row.planId, name: row.planName, versions: [] };
        plan.versions.push({
          id: row.versionId,
          version: row.version,
          effectiveMonth: row.effectiveMonth,
          rules: await mapRules(db, companyId, row),
        });
        plans.set(row.planId, plan);
      }
      return [...plans.values()];
    },
    async listStaffAssignments(period) {
      const { rows } = await db.query<{
        staffId: string;
        staffName: string;
        branchId: string;
        planId: string | null;
        planName: string | null;
        effectiveMonth: string | null;
      }>(
        `select s.id as "staffId",s.display_name as "staffName",s.branch_id as "branchId",
           a.plan_id as "planId",p.name as "planName",a.effective_month::text as "effectiveMonth"
         from public.staff_members s
         left join lateral (
           select plan_id,effective_month from public.staff_commission_plans c
           where c.company_id=$1 and c.staff_id=s.id and c.effective_month <= $2::date
           order by c.effective_month desc,c.assigned_at desc limit 1
         ) a on true
         left join public.commission_plans p on p.company_id=$1 and p.id=a.plan_id
         where s.company_id=$1
         order by s.display_name,s.id`,
        [companyId, periodStart(period)],
      );
      return rows.map((row) => ({ ...row })) satisfies StaffAssignment[];
    },
  };
}

function requireMonthStart(effectiveMonth: string): void {
  if (!isMonthStart(effectiveMonth)) throw new CommissionError("PLAN_INVALID");
}

/** بارامترات إصدار الخطة: القاعدة النسبية والثابتة ونمط الشرائح ومجمعها. */
function versionParameters(rules: PlanRules): (string | null)[] {
  const schedule = rules.tierSchedule;
  return [
    rules.baseRateBp?.toString() ?? null,
    rules.baseFixedMills?.toString() ?? null,
    schedule ? schedule.mode : null,
    schedule ? schedule.accumulator : null,
  ];
}

/** يدرج شرائح الإصدار داخل معاملة إنشاء الإصدار نفسها (021 Schema). */
async function insertTiers(
  db: pg.PoolClient,
  companyId: string,
  versionId: string,
  schedule: TierSchedule | null,
): Promise<void> {
  if (!schedule) return;
  if (schedule.accumulator === "sales_amount") {
    let order = 0;
    for (const tier of schedule.tiers) {
      order++;
      await db.query(
        `insert into public.commission_plan_tiers(
           company_id,version_id,tier_order,rate_bp,threshold_mills,threshold_salary_multiple_milli
         ) values($1,$2,$3,$4,$5,$6)`,
        [
          companyId,
          versionId,
          order,
          tier.rateBp.toString(),
          tier.threshold.kind === "fixed" ? tier.threshold.mills.toString() : null,
          tier.threshold.kind === "salary_multiple"
            ? tier.threshold.multipleMilli.toString()
            : null,
        ],
      );
    }
    return;
  }
  let order = 0;
  for (const tier of schedule.tiers) {
    order++;
    await db.query(
      `insert into public.commission_plan_tiers(
         company_id,version_id,tier_order,rate_bp,fixed_mills,threshold_session_count
       ) values($1,$2,$3,$4,$5,$6)`,
      [
        companyId,
        versionId,
        order,
        tier.reward.kind === "rate_bp" ? tier.reward.rateBp.toString() : null,
        tier.reward.kind === "fixed_mills" ? tier.reward.mills.toString() : null,
        tier.afterSessions,
      ],
    );
  }
}

/** يبني قواعد المجال من صف الإصدار وشرائحه مع الرجوع لأعمدة 0024 القديمة. */
async function mapRules(db: pg.PoolClient, companyId: string, row: VersionRow): Promise<PlanRules> {
  const base = {
    baseRateBp: row.baseRateBp === null ? null : BigInt(row.baseRateBp),
    baseFixedMills: row.baseFixedMills === null ? null : BigInt(row.baseFixedMills),
  };
  if (row.tierMode === null) return { ...base, tierSchedule: null };
  const tiers = await readTiers(db, companyId, row.versionId);
  if (tiers.length === 0) return { ...base, tierSchedule: legacySchedule(row) };
  if (row.tierAccumulator === "session_count") {
    return {
      ...base,
      tierSchedule: {
        accumulator: "session_count",
        mode: "excess",
        tiers: tiers.map((tier) => ({
          afterSessions: tier.thresholdSessionCount!,
          reward:
            tier.fixedMills !== null
              ? { kind: "fixed_mills" as const, mills: BigInt(tier.fixedMills) }
              : { kind: "rate_bp" as const, rateBp: BigInt(tier.rateBp!) },
        })),
      },
    };
  }
  return {
    ...base,
    tierSchedule: {
      accumulator: "sales_amount",
      mode: row.tierMode,
      thresholdKind: tiers[0]!.thresholdMills !== null ? "fixed" : "salary_multiple",
      tiers: tiers.map((tier) => ({
        rateBp: BigInt(tier.rateBp!),
        threshold:
          tier.thresholdMills !== null
            ? { kind: "fixed" as const, mills: BigInt(tier.thresholdMills) }
            : {
                kind: "salary_multiple" as const,
                multipleMilli: BigInt(tier.thresholdSalaryMultipleMilli!),
              },
      })),
    },
  };
}

/** يقرأ شرائح الإصدار بترتيبها؛ التطبيق يعتمد الترتيب الصاعد. */
async function readTiers(
  db: pg.PoolClient,
  companyId: string,
  versionId: string,
): Promise<TierRow[]> {
  const { rows } = await db.query<TierRow>(
    `select tier_order as "tierOrder",rate_bp::text as "rateBp",fixed_mills::text as "fixedMills",
            threshold_mills::text as "thresholdMills",
            threshold_salary_multiple_milli::text as "thresholdSalaryMultipleMilli",
            threshold_session_count as "thresholdSessionCount"
     from public.commission_plan_tiers
     where company_id=$1 and version_id=$2
     order by tier_order`,
    [companyId, versionId],
  );
  return rows;
}

/** يحول أعمدة 0024 القديمة إلى شريحة واحدة لصفوف ما قبل الترحيل. */
function legacySchedule(row: VersionRow): TierSchedule {
  const threshold =
    row.legacyThresholdMills !== null
      ? { kind: "fixed" as const, mills: BigInt(row.legacyThresholdMills) }
      : { kind: "salary_multiple" as const, multipleMilli: BigInt(row.legacySalaryMultipleMilli!) };
  return {
    accumulator: "sales_amount",
    mode: row.tierMode!,
    thresholdKind: threshold.kind,
    tiers: [{ rateBp: BigInt(row.legacyRateBp!), threshold }],
  };
}
