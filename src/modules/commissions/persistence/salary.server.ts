import type pg from "pg";
import type { Mills } from "@/shared/kernel/money";
import type { RecordSalaryInput, SalaryRepository, StoredSalary } from "../ports/salary-repository";

/** هل يدير المستخدم الحالي راتب هذه الموظفة (مالك أو مدير فرعها)؟ */
export async function assertSalaryManager(
  db: pg.PoolClient,
  companyId: string,
  staffId: string | null,
): Promise<void> {
  if (staffId === null) {
    const { rows } = await db.query<{ ok: boolean }>(
      "select public.has_company_role($1,'owner') as ok",
      [companyId],
    );
    if (!rows[0]?.ok) throw new Error("FORBIDDEN");
    return;
  }
  const { rows } = await db.query<{ ok: boolean }>("select public.salary_manager($1,$2) as ok", [
    companyId,
    staffId,
  ]);
  if (!rows[0]?.ok) throw new Error("FORBIDDEN");
}

/** موظفة كما تحتاجها شاشة الرواتب. */
export interface SalaryScreenStaff {
  staffId: string;
  staffName: string;
  branchId: string;
}

/** يقرأ موظفات فروع المستخدم لشاشة الرواتب. */
export async function listSalaryStaff(
  db: pg.PoolClient,
  companyId: string,
): Promise<SalaryScreenStaff[]> {
  const { rows } = await db.query<SalaryScreenStaff>(
    `select s.id as "staffId",s.display_name as "staffName",s.branch_id as "branchId"
     from public.staff_members s
     where s.company_id=$1 and public.salary_manager($1,s.id)
     order by s.display_name,s.id`,
    [companyId],
  );
  return rows;
}

/**
 * ينفذ منفذ الرواتب الفعالة بالتاريخ؛ القراءة والكتابة كلاهما بفرع
 * المستخدم عبر RLS، وسجل الرواتب إضافة فقط والتدقيق مؤشر قاعدة البيانات
 * (staff_salary.recorded) فلا يكتبه التطبيق (021 Q2، S1، S3، S4).
 */
export function pgSalaryRepository(
  db: pg.PoolClient,
  userId: string,
  companyId: string,
): SalaryRepository {
  return {
    async recordSalary(input: RecordSalaryInput) {
      const open = await db.query<{ ok: boolean }>(
        "select public.salary_date_open($1,$2::date) as ok",
        [companyId, input.effectiveDate],
      );
      if (!open.rows[0]?.ok) throw new Error("SALARY_MONTH_CLOSED");
      const { rows } = await db.query<{ id: string }>(
        `insert into public.staff_salaries(company_id,staff_id,salary_mills,effective_date,recorded_by)
         values($1,$2,$3,$4,$5) returning id`,
        [companyId, input.staffId, input.salaryMills.toString(), input.effectiveDate, userId],
      );
      return { id: rows[0]!.id };
    },
    async listStaffSalaries() {
      const { rows } = await db.query<{
        id: string;
        staffId: string;
        salaryMills: string;
        effectiveDate: string;
        recordedAt: Date;
      }>(
        `select id,staff_id as "staffId",salary_mills::text as "salaryMills",
                effective_date::text as "effectiveDate",recorded_at as "recordedAt"
         from public.staff_salaries
         where company_id=$1
         order by staff_id,effective_date,recorded_at`,
        [companyId],
      );
      return rows.map((row) => ({
        id: row.id,
        staffId: row.staffId,
        salaryMills: BigInt(row.salaryMills),
        effectiveDate: row.effectiveDate,
        recordedAt: row.recordedAt,
      })) satisfies StoredSalary[];
    },
    async salaryOn(salaryCompanyId, staffId, date): Promise<Mills | null> {
      const { rows } = await db.query<{ salaryMills: string }>(
        `select salary_mills::text as "salaryMills"
         from public.staff_salaries
         where company_id=$1 and staff_id=$2 and effective_date <= $3::date
         order by effective_date desc,recorded_at desc limit 1`,
        [salaryCompanyId, staffId, date],
      );
      return rows[0] ? BigInt(rows[0].salaryMills) : null;
    },
  };
}
