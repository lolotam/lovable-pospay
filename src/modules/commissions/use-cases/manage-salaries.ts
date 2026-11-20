import type { StaffSalariesScreenDto } from "../contracts";
import { parseKwdToMills } from "../domain/parse";
import type { RecordSalaryInput, SalaryRepository } from "../ports/salary-repository";

/** مدخل تسجيل راتب كما يأتي من الشاشة بالمبلغ النصي. */
export interface RecordStaffSalaryInput {
  staffId: string;
  salaryKwd: string;
  effectiveDate: string;
}

/**
 * يسجل راتباً فعالاً بالتاريخ بعد تحويل المبلغ النصي إلى ملّيم بلا أرقام
 * عائمة؛ التدقيق يكتبه مؤشر قاعدة البيانات نفسها (021 S1، S4).
 */
export async function recordSalary(
  repository: SalaryRepository,
  input: RecordStaffSalaryInput,
): Promise<{ id: string }> {
  const salaryMills = parseKwdToMills(input.salaryKwd);
  if (salaryMills <= 0n) throw new Error("INVALID_SALARY");
  const record: RecordSalaryInput = {
    staffId: input.staffId,
    salaryMills,
    effectiveDate: input.effectiveDate,
  };
  return repository.recordSalary(record);
}

/** يجهز شاشة الرواتب: كل موظفة براتبها الساري وسجلها الكامل (021 E). */
export async function loadSalariesScreen(
  repository: SalaryRepository,
  staff: { staffId: string; staffName: string; branchId: string }[],
): Promise<StaffSalariesScreenDto> {
  const salaries = await repository.listStaffSalaries();
  return {
    staff: staff.map((member) => {
      const history = salaries
        .filter((salary) => salary.staffId === member.staffId)
        .sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate));
      const current = history[history.length - 1] ?? null;
      return {
        staffId: member.staffId,
        staffName: member.staffName,
        branchId: member.branchId,
        currentSalaryMills: current?.salaryMills.toString() ?? null,
        currentEffectiveDate: current?.effectiveDate ?? null,
        history: history.map((salary) => ({
          id: salary.id,
          staffId: salary.staffId,
          staffName: member.staffName,
          branchId: member.branchId,
          salaryMills: salary.salaryMills.toString(),
          effectiveDate: salary.effectiveDate,
          recordedAt: salary.recordedAt.toISOString(),
        })),
      };
    }),
  };
}
