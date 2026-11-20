import type pg from "pg";
import type {
  ClosedMonthRecord,
  NewSession,
  PinVerification,
  SessionEdit,
  SessionForEdit,
  SessionFormRecord,
  SessionRepository,
} from "../ports/session-repository";
/**
 * ينفذ منفذ الجلسات على PostgreSQL داخل معاملة withUser؛ كل القراءات
 * والكتابات تمر عبر دوال RLS أو دوال security definer المعتمدة (020 B5، D4).
 * userAgent هو ترويسة الطلب تُمرر إلى تدقيق محاولات PIN الفاشلة (020 B3).
 */
export function pgSessionRepository(
  db: pg.PoolClient,
  userId: string,
  companyId: string,
  userAgent: string | null = null,
): SessionRepository {
  return {
    assignedService: (serviceId, staffId) => assignedService(db, companyId, serviceId, staffId),
    async canWrite(branchId) {
      const r = await db.query(`select public.session_writer($1,$2) as ok`, [companyId, branchId]);
      return Boolean(r.rows[0]?.ok);
    },
    async discountCap() {
      const { rows } = await db.query<{ cap: number }>("select public.discount_cap($1) as cap", [
        companyId,
      ]);
      return rows[0]?.cap ?? 0;
    },
    async resolveTime(local, timeZone) {
      const r = await db.query<{ occurred_at: Date; round_trip: string }>(
        `select $1::timestamp at time zone $2 as occurred_at,
          to_char(($1::timestamp at time zone $2) at time zone $2, 'YYYY-MM-DD"T"HH24:MI') as round_trip`,
        [local, timeZone],
      );
      const row = r.rows[0];
      if (!row || row.round_trip !== local) throw new Error("INVALID_SESSION_TIME");
      return row.occurred_at;
    },
    async claimRequest(id, payload) {
      await db.query("select pg_advisory_xact_lock(hashtextextended($1, 0))", [
        `service-session:${companyId.toLowerCase()}:${id.toLowerCase()}`,
      ]);
      const { rows } = await db.query<{ state: "new" | "replay" | "conflict" }>(
        "select public.recorded_session_replay($1,$2,$3) as state",
        [companyId, id, payload],
      );
      return rows[0]?.state ?? "conflict";
    },
    async upsertClient(branchId, name, phone) {
      const r = await db.query("select public.upsert_session_client($1,$2,$3,$4) as id", [
        companyId,
        branchId,
        name,
        phone,
      ]);
      return r.rows[0].id;
    },
    insertSession: (session) => insertSession(db, companyId, userId, session),
    async audit(id, details) {
      await db.query(
        `insert into public.audit_log(company_id,actor_user_id,action,entity,entity_id,details) values($1,$2,'session.recorded','service_session',$3,$4)`,
        [companyId, userId, id, JSON.stringify(details)],
      );
    },
    async isMonthClosed(branchId, at) {
      const { rows } = await db.query<{ closed: boolean }>(
        "select public.is_month_closed($1,$2,$3) as closed",
        [companyId, branchId, at],
      );
      return Boolean(rows[0]?.closed);
    },
    async hasSimilarSession(input) {
      const { rows } = await db.query<{ similar: boolean }>(
        "select public.has_similar_session($1,$2,$3,$4,$5,$6,$7) as similar",
        [
          companyId,
          input.branchId,
          input.serviceId,
          input.staffId,
          input.clientPhone,
          input.occurredAt,
          input.excludeId ?? null,
        ],
      );
      return Boolean(rows[0]?.similar);
    },
    async listBranchApprovers(branchId) {
      const { rows } = await db.query<{ user_id: string; name: string }>(
        "select user_id,name from public.list_branch_approvers($1,$2)",
        [companyId, branchId],
      );
      return rows.map((row) => ({ userId: row.user_id, name: row.name }));
    },
    async verifyManagerPin(input) {
      const { rows } = await db.query<{ status: string; approvalId: string | null }>(
        `select status,approval_id as "approvalId"
         from public.verify_manager_pin_approval($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [
          companyId,
          input.branchId,
          input.sessionId,
          input.serviceId,
          input.listPriceMills.toString(),
          input.priceMills.toString(),
          input.approverUserId,
          input.pin,
          userAgent,
        ],
      );
      return mapPinVerification(rows[0]);
    },
    async consumeApproval(approvalId) {
      await db.query("select public.consume_discount_approval($1,$2)", [companyId, approvalId]);
    },
    getSessionForEdit: (sessionId, hint) => getSessionForEdit(db, companyId, sessionId, hint),
    async canEditSession(branchId) {
      const { rows } = await db.query<{ ok: boolean }>(
        "select public.session_editor($1,$2) as ok",
        [companyId, branchId],
      );
      return Boolean(rows[0]?.ok);
    },
    updateSession: (edit) => updateSession(db, companyId, edit),
    async closeMonth(periodMonth, note) {
      await db.query(
        `insert into public.closed_commission_months(company_id,period_month,closed_by,note)
         values($1,$2,$3,$4)`,
        [companyId, periodMonth, userId, note],
      );
      await db.query(
        `insert into public.audit_log(company_id,actor_user_id,action,entity,entity_id,details)
         values($1,$2,'commission_month.closed','closed_commission_months',$3,$4)`,
        [companyId, userId, periodMonth, JSON.stringify({ periodMonth, note })],
      );
    },
    async listClosedMonths() {
      const { rows } = await db.query<{
        period_month: string;
        closed_by: string;
        closed_at: Date;
        note: string | null;
      }>(
        `select period_month::text as period_month,closed_by,closed_at,note
         from public.closed_commission_months where company_id=$1 order by period_month desc`,
        [companyId],
      );
      return rows.map((row) => ({
        periodMonth: row.period_month,
        closedBy: row.closed_by,
        closedAt: row.closed_at,
        note: row.note,
      })) satisfies ClosedMonthRecord[];
    },
    async monthCloseStatus(periodMonth) {
      const { rows } = await db.query<{ days: number }>(
        "select public.month_close_status($1,$2::date) as days",
        [companyId, periodMonth],
      );
      return rows[0]?.days ?? 0;
    },
  };
}

function mapPinVerification(
  row: { status: string; approvalId: string | null } | undefined,
): PinVerification {
  if (row?.status === "approved" && row.approvalId)
    return { status: "approved", approvalId: row.approvalId };
  return { status: "invalid" };
}

async function assignedService(
  db: pg.PoolClient,
  companyId: string,
  serviceId: string,
  staffId: string,
) {
  const r = await db.query(
    `select c.name,c.price_mills::text as price,s.branch_id,b.timezone from public.service_assignments a
     join public.service_catalog c on c.company_id=a.company_id and c.id=a.service_id
     join public.staff_members s on s.company_id=a.company_id and s.id=a.staff_id
     join public.branches b on b.company_id=s.company_id and b.id=s.branch_id
     where a.company_id=$1 and a.service_id=$2 and a.staff_id=$3 and a.active`,
    [companyId, serviceId, staffId],
  );
  const row = r.rows[0];
  return row
    ? {
        serviceName: row.name,
        priceMills: BigInt(row.price),
        branchId: row.branch_id,
        timeZone: row.timezone,
      }
    : null;
}

async function insertSession(
  db: pg.PoolClient,
  companyId: string,
  userId: string,
  session: NewSession,
) {
  await db.query(
    `insert into public.service_sessions(company_id,id,service_id,staff_id,branch_id,client_id,occurred_at,service_name,price_mills,recorded_by,list_price_mills,discount_reason,request_fingerprint,approved_by,approval_id,approved_at)
     values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,public.session_request_fingerprint($13),$14,$15,
       (select a.created_at from public.discount_approvals a where a.company_id=$1 and a.id=$15))`,
    [
      companyId,
      session.id,
      session.serviceId,
      session.staffId,
      session.branchId,
      session.clientId,
      session.occurredAt,
      session.serviceName,
      session.priceMills.toString(),
      userId,
      session.listPriceMills.toString(),
      session.discountReason,
      session.requestPayload,
      session.approvedBy,
      session.approvalId,
    ],
  );
}

/**
 * يقرأ الجلسة المراد تعديلها من دالة قائمة المحررين الأمنية، لأن سياسات
 * القراءات العادية لا تسمح لمحرر ليس قارئ تقارير برؤية صفوف الجلسات (020 D5).
 * وقت القائمة من قاموس الجلسة نفسه لتحديد نطاق البحث حول الجلسة المطلوبة.
 */
async function getSessionForEdit(
  db: pg.PoolClient,
  companyId: string,
  sessionId: string,
  hint: string,
): Promise<SessionForEdit | null> {
  const { rows } = await db.query<EditableRow>(
    `select id,service_id,service_name,staff_id,branch_id,time_zone,client_name,occurred_at,
            list_price_mills::text as list_price,price_mills::text as price,discount_reason,
            approved_by,month_closed,can_edit
     from public.list_editable_sessions(
       $1,
       ($2::timestamp at time zone 'UTC') - interval '2 days',
       ($2::timestamp at time zone 'UTC') + interval '2 days',
       500)
     where id = $3`,
    [companyId, hint, sessionId],
  );
  return rows[0] ? mapEditableRow(rows[0]) : null;
}

/** صف قائمة المحررين كما تعيده الدالة الأمنية قبل التحويل. */
type EditableRow = {
  id: string;
  service_id: string;
  service_name: string;
  staff_id: string;
  branch_id: string;
  time_zone: string;
  client_name: string;
  occurred_at: Date;
  list_price: string;
  price: string;
  discount_reason: string | null;
  approved_by: string | null;
  month_closed: boolean;
  can_edit: boolean;
};

/** يحول صف قائمة المحررين إلى جلسة التعديل بمبالغ bigint. */
function mapEditableRow(row: EditableRow): SessionForEdit {
  return {
    id: row.id,
    serviceId: row.service_id,
    serviceName: row.service_name,
    staffId: row.staff_id,
    branchId: row.branch_id,
    timeZone: row.time_zone,
    clientName: row.client_name,
    occurredAt: row.occurred_at,
    listPriceMills: BigInt(row.list_price),
    priceMills: BigInt(row.price),
    discountReason: row.discount_reason,
    approvedBy: row.approved_by,
    monthClosed: row.month_closed,
    canEdit: row.can_edit,
  };
}

/** ينفذ التعديل الذري المدقق داخل قاعدة البيانات (020 D4). */
async function updateSession(db: pg.PoolClient, companyId: string, edit: SessionEdit) {
  await db.query(`select public.update_recorded_session($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`, [
    companyId,
    edit.sessionId,
    edit.serviceId,
    edit.staffId,
    edit.clientName,
    edit.clientPhone,
    edit.occurredAt,
    edit.priceMills.toString(),
    edit.discountReason,
    edit.approvalId,
    edit.editReason,
  ]);
}

/** يقرأ خيارات تسجيل الجلسة المصرح بها للمستخدم. */
export async function readSessionForm(
  db: pg.PoolClient,
  companyId: string,
): Promise<SessionFormRecord> {
  const { rows } = await db.query<{
    canRecord: boolean;
    discountCap: number;
    services: (Omit<SessionFormRecord["services"][number], "priceMills"> & {
      priceMills: string;
    })[];
    staff: SessionFormRecord["staff"];
  }>(
    `with eligible_staff as (
       select s.id, s.display_name as name, b.timezone as "timeZone"
       from public.staff_members s
       join public.branches b on b.company_id=s.company_id and b.id=s.branch_id
       where s.company_id=$1 and public.session_writer(s.company_id,s.branch_id)
     ), eligible_services as (
       select c.id, c.name, c.price_mills::text as "priceMills",
         json_agg(s.id order by s.id) as "staffIds"
       from public.service_catalog c
       join public.service_assignments a on a.company_id=c.company_id and a.service_id=c.id
       join eligible_staff s on s.id=a.staff_id
       where c.company_id=$1 and a.active
       group by c.id, c.name, c.price_mills
     )
     select public.session_writer_any($1) as "canRecord",
       public.discount_cap($1) as "discountCap",
       coalesce((select json_agg(c order by c.name, c.id) from eligible_services c), '[]') as services,
       coalesce((select json_agg(s order by s.name, s.id) from eligible_staff s), '[]') as staff`,
    [companyId],
  );
  const options = rows[0];
  if (!options?.canRecord) return { canRecord: false, discountCap: 0, services: [], staff: [] };
  return {
    ...options,
    services: options.services.map((service) => ({
      ...service,
      priceMills: BigInt(service.priceMills),
    })),
  };
}
