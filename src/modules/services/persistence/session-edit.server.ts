import type pg from "pg";
import type {
  ClosedMonthDto,
  EditableSessionDto,
  SessionEditHistoryDto,
  SessionEditPickersDto,
  SessionEditSnapshot,
} from "../contracts";
import { memberNames } from "./member-names.server";

/**
 * يقرأ شاشات المحرر من دالة قائمة المحررين الأمنية وجدول التعديلات،
 * فلا يحتاج القارئ صلاحية تقارير لرؤية جلسات فرعه القابلة للتعديل (020 D5).
 */
export async function listEditableSessions(
  db: pg.PoolClient,
  companyId: string,
  from: string,
  until: string,
  limit: number,
): Promise<EditableSessionDto[]> {
  const { rows } = await db.query<{
    id: string;
    service_id: string;
    service_name: string;
    staff_id: string;
    staff_name: string;
    branch_id: string;
    time_zone: string;
    client_name: string;
    client_phone_last3: string | null;
    occurred_at: Date;
    recorded_at: Date;
    list_price: string;
    price: string;
    discount_reason: string | null;
    approved_by: string | null;
    approver_name: string | null;
    month_closed: boolean;
    can_edit: boolean;
    edit_count: string;
  }>(
    `select id,service_id,service_name,staff_id,staff_name,branch_id,time_zone,client_name,
            client_phone_last3,occurred_at,recorded_at,
            list_price_mills::text as list_price,price_mills::text as price,
            discount_reason,approved_by,approver_name,month_closed,can_edit,
            edit_count::text as edit_count
     from public.list_editable_sessions($1,$2::date,$3::date,$4)
     order by occurred_at desc`,
    [companyId, from, until, limit],
  );
  return rows.map((row) => ({
    id: row.id,
    serviceId: row.service_id,
    serviceName: row.service_name,
    staffId: row.staff_id,
    staffName: row.staff_name,
    branchId: row.branch_id,
    timeZone: row.time_zone,
    clientName: row.client_name,
    clientPhoneLast3: row.client_phone_last3,
    occurredAt: row.occurred_at.toISOString(),
    recordedAt: row.recorded_at.toISOString(),
    listPriceMills: row.list_price,
    priceMills: row.price,
    discountReason: row.discount_reason,
    approvedBy: row.approved_by,
    approverName: row.approver_name,
    monthClosed: row.month_closed,
    canEdit: row.can_edit,
    editCount: Number(row.edit_count),
  }));
}

/**
 * خيارات نافذة التعديل: موظفات الفروع التي يحق للمستخدم تعديلها والخدمات
 * المسندة لهن؛ البوابة session_editor داخل SQL (020 D1).
 */
export async function listSessionEditPickers(
  db: pg.PoolClient,
  companyId: string,
): Promise<SessionEditPickersDto> {
  const { rows } = await db.query<{
    kind: "staff" | "service";
    id: string;
    name: string;
    staff_ids: string[] | null;
  }>(
    `select kind,id,name,staff_ids from public.list_session_edit_pickers($1)
     order by name,id`,
    [companyId],
  );
  return {
    staff: rows.filter((row) => row.kind === "staff").map(({ id, name }) => ({ id, name })),
    services: rows
      .filter((row) => row.kind === "service")
      .map((row) => ({ id: row.id, name: row.name, staffIds: row.staff_ids ?? [] })),
  };
}

/** يقرأ تاريخ تعديلات جلسة واحدة؛ RLS يخفيها عن غير المصرح لهم. */
export async function readSessionEdits(
  db: pg.PoolClient,
  companyId: string,
  sessionId: string,
  limit: number,
): Promise<SessionEditHistoryDto[]> {
  const { rows } = await db.query<{
    id: string;
    sessionId: string;
    editedBy: string;
    editedAt: Date;
    editReason: string;
    before: Record<string, unknown>;
    after: Record<string, unknown>;
  }>(
    `select e.id,e.session_id as "sessionId",e.edited_by as "editedBy",
            e.edited_at as "editedAt",e.edit_reason as "editReason",
            e.before_snapshot as "before",e.after_snapshot as "after"
     from public.service_session_edits e
     where e.company_id=$1 and e.session_id=$2
     order by e.edited_at desc limit $3`,
    [companyId, sessionId, limit],
  );
  const names = await memberNames(db, companyId);
  return rows.map((row) => ({
    id: row.id,
    sessionId: row.sessionId,
    editedBy: row.editedBy,
    editorName: names.get(row.editedBy) ?? null,
    editedAt: row.editedAt.toISOString(),
    editReason: row.editReason,
    before: mapSnapshot(row.before),
    after: mapSnapshot(row.after),
  }));
}

/** يحول لقطة jsonb إلى شكل يعرفه العرض؛ لا تحمل رقم الهاتف الكامل أبداً. */
function mapSnapshot(raw: Record<string, unknown>): SessionEditSnapshot {
  return {
    sessionId: String(raw["sessionId"] ?? ""),
    serviceId: String(raw["serviceId"] ?? ""),
    serviceName: String(raw["serviceName"] ?? ""),
    staffId: String(raw["staffId"] ?? ""),
    branchId: String(raw["branchId"] ?? ""),
    clientId: String(raw["clientId"] ?? ""),
    clientName: String(raw["clientName"] ?? ""),
    clientPhoneLast3: String(raw["clientPhoneLast3"] ?? ""),
    occurredAt: new Date(raw["occurredAt"] as string).toISOString(),
    listPriceMills: String(raw["listPriceMills"] ?? "0"),
    priceMills: String(raw["priceMills"] ?? "0"),
    discountReason: (raw["discountReason"] as string | null) ?? null,
    approvedBy: (raw["approvedBy"] as string | null) ?? null,
  };
}

/** أشهر العمولات المغلقة للعرض فقط؛ لا يمكن إعادة فتحها (020 D2). */
export async function readClosedMonths(
  db: pg.PoolClient,
  companyId: string,
): Promise<ClosedMonthDto[]> {
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
    closedAt: row.closed_at.toISOString(),
    note: row.note,
  }));
}
