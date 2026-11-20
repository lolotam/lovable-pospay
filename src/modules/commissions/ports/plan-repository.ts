import type { PlanRules } from "../domain/plan";
import type { CommissionPeriod } from "../domain/period";

/** مدخل إنشاء خطة عمولة جديدة داخل الشركة الحالية. */
export interface CreateCommissionPlanInput {
  name: string;
}

/** مدخل إضافة إصدار مصحح لخطة، مع شهر سريان يبدأ في اليوم الأول. */
export interface AddCommissionPlanVersionInput {
  planId: string;
  effectiveMonth: string;
  rules: PlanRules;
}

/** مدخل إسناد خطة لموظف بدءاً من أول شهر محدد. */
export interface AssignCommissionPlanInput {
  staffId: string;
  planId: string;
  effectiveMonth: string;
}

/** إصدار الخطة الذي يحكم فترة الموظف بعد تطبيق ترتيب السريان والتصحيح. */
export interface ResolvedPlan {
  planId: string;
  planName: string;
  versionId: string;
  version: number;
  rules: PlanRules;
}

/** خطة بإصداراتها لشاشة بانِي الخطط. */
export interface PlanWithVersions {
  id: string;
  name: string;
  versions: { id: string; version: number; effectiveMonth: string; rules: PlanRules }[];
}

/** موظفة وإسناندها الساري أو null لمن بلا خطة (021 Q8). */
export interface StaffAssignment {
  staffId: string;
  staffName: string;
  branchId: string;
  planId: string | null;
  planName: string | null;
  effectiveMonth: string | null;
}

/** مخزن خطط العمولات وإصداراتها وإسناداتها، وجميع تغييراته إضافة فقط. */
export interface CommissionPlanRepository {
  /** ينشئ خطة ويسجل تدقيقها في المعاملة نفسها ويعيد معرفها. */
  createPlan(input: CreateCommissionPlanInput): Promise<{ id: string }>;
  /** يضيف إصداراً متسلسلاً وشرائحه في المعاملة نفسها ويسجل تدقيقه. */
  addVersion(input: AddCommissionPlanVersionInput): Promise<{ id: string; version: number }>;
  /** يسند خطة لموظف ويسجل التدقيق في المعاملة نفسها ويعيد معرف الإسناد. */
  assign(input: AssignCommissionPlanInput): Promise<{ id: string }>;
  /** يعيد أحدث إسناد وإصدار ساريين للفترة، أو null عند غياب خطة محلولة. */
  resolve(
    companyId: string,
    staffId: string,
    period: CommissionPeriod,
  ): Promise<ResolvedPlan | null>;
  /** كل الخطط مع إصداراتها وشرائحها لشاشة البانِي (021 E). */
  listPlansWithLatestVersions(): Promise<PlanWithVersions[]>;
  /** كل الموظفات المؤهلات مع إسنادهن الساري أو null (021 Q8). */
  listStaffAssignments(period: CommissionPeriod): Promise<StaffAssignment[]>;
}
