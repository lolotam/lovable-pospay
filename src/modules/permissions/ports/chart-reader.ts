import type { AttendanceDay, CompanyChartsDto, GrowthDto } from "../contracts";
/** قراءات الرسوم داخل معاملة المستخدم الحالية. */
export interface ChartReader {
  company(
    company: string,
    branch: string | null,
    range: 7 | 14 | 30,
    recording: boolean,
  ): Promise<CompanyChartsDto>;
  own(company: string): Promise<AttendanceDay[]>;
  platform(): Promise<GrowthDto>;
}
