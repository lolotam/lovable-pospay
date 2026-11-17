// Public API of the attendance module. Other modules import only from this file.
export { scanAttendanceFn, getBranchQrFn } from "./functions/attendance.functions";
export type { ScanResultDto, BranchQrDto } from "./contracts";
