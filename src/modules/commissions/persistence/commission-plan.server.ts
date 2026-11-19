import type pg from "pg";
import {
  CommissionError,
  isMonthStart,
  isValidPlanName,
  validatePlanVersion,
} from "../domain/plan";
import type { PlanRules, PlanTier, TierMode } from "../domain/plan";
import { periodStart } from "../domain/period";
import type { CommissionPlanRepository, ResolvedPlan } from "../ports/plan-repository";

type ResolvedPlanRow = {
  planId: string;
  planName: string;
  versionId: string;
  version: number;
  baseRateBp: string | null;
  tierMode: TierMode | null;
  tierRateBp: string | null;
  tierThresholdMills: string | null;
  tierSalaryMultipleMilli: string | null;
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
           company_id,plan_id,version,effective_month,base_rate_bp,tier_mode,tier_rate_bp,
           tier_threshold_mills,tier_salary_multiple_milli,created_by
         )
         select $1,$2,coalesce(max(v.version),0)+1,$3,$4,$5,$6,$7,$8,$9
         from public.commission_plan_versions v
         where v.company_id=$1 and v.plan_id=$2
         returning id,version`,
        [companyId, input.planId, input.effectiveMonth, ...versionParameters(input.rules), userId],
      );
      const row = rows[0]!;
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
      const { rows } = await db.query<ResolvedPlanRow>(
        `with latest_assignment as (
           select plan_id from public.staff_commission_plans
           where company_id=$1 and staff_id=$2 and effective_month <= $3::date
           order by effective_month desc,assigned_at desc limit 1
         )
         select p.id as "planId",p.name as "planName",v.id as "versionId",v.version,
           v.base_rate_bp::text as "baseRateBp",v.tier_mode as "tierMode",
           v.tier_rate_bp::text as "tierRateBp",v.tier_threshold_mills::text as "tierThresholdMills",
           v.tier_salary_multiple_milli::text as "tierSalaryMultipleMilli"
         from latest_assignment a
         join public.commission_plans p on p.company_id=$1 and p.id=a.plan_id
         join public.commission_plan_versions v on v.company_id=$1 and v.plan_id=a.plan_id
         where v.effective_month <= $3::date
         order by v.effective_month desc,v.version desc limit 1`,
        [resolveCompanyId, staffId, periodStart(period)],
      );
      return rows[0] ? mapResolvedPlan(rows[0]) : null;
    },
  };
}

function requireMonthStart(effectiveMonth: string): void {
  if (!isMonthStart(effectiveMonth)) throw new CommissionError("PLAN_INVALID");
}

function versionParameters(rules: PlanRules): (string | null)[] {
  const tier = rules.tier;
  return [
    rules.baseRateBp?.toString() ?? null,
    tier?.mode ?? null,
    tier?.rateBp.toString() ?? null,
    tier?.threshold.kind === "fixed" ? tier.threshold.mills.toString() : null,
    tier?.threshold.kind === "salary_multiple" ? tier.threshold.multipleMilli.toString() : null,
  ];
}

function mapResolvedPlan(row: ResolvedPlanRow): ResolvedPlan {
  return {
    planId: row.planId,
    planName: row.planName,
    versionId: row.versionId,
    version: row.version,
    rules: {
      baseRateBp: row.baseRateBp === null ? null : BigInt(row.baseRateBp),
      tier: mapTier(row),
    },
  };
}

function mapTier(row: ResolvedPlanRow): PlanTier | null {
  if (row.tierMode === null) return null;
  const threshold =
    row.tierThresholdMills === null
      ? { kind: "salary_multiple" as const, multipleMilli: BigInt(row.tierSalaryMultipleMilli!) }
      : { kind: "fixed" as const, mills: BigInt(row.tierThresholdMills) };
  return { mode: row.tierMode, rateBp: BigInt(row.tierRateBp!), threshold };
}
