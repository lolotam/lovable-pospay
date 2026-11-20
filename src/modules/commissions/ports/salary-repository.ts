import type { SalarySource } from "./salary-source";

/** راتب مخزّن كما يُعرض في شاشة الرواتب. */
export interface StoredSalary {
  id: string;
  staffId: string;
  salaryMills: bigint;
  effectiveDate: string;
  recordedAt: Date;
}

/** مدخل تسجيل راتب بتاريخ سريان؛ التدقيق يكتبه مؤشر قاعدة البيانات (021 S4). */
export interface RecordSalaryInput {
  staffId: string;
  salaryMills: bigint;
  effectiveDate: string;
}

/**
 * منفذ الرواتب الفعالة بالتاريخ؛ القراءة والكتابة كلاهما محصوران بفروع
 * المستخدم عبر RLS، والتاريخ إضافة فقط بلا تعديل أو حذف (021 Q2، S3).
 */
export interface SalaryRepository extends SalarySource {
  /** يسجل راتباً جديداً بتاريخ سريان ويسجل التدقيق في المعاملة نفسها. */
  recordSalary(input: RecordSalaryInput): Promise<{ id: string }>;
  /** رواتب الموظفات في فروع المستخدم مع أسمائهن، مرتبة بالسريان. */
  listStaffSalaries(): Promise<StoredSalary[]>;
}
