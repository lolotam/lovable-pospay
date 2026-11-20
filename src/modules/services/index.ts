import { createServerOnlyFn } from "@tanstack/react-start";
import type pg from "pg";

export { getCatalogFn, saveServiceFn } from "./functions/catalog.functions";
export {
  getSessionFormFn,
  recordSessionFn,
  listEditableSessionsFn,
  editSessionFn,
  listSessionEditsFn,
  listClosedMonthsFn,
  closeMonthFn,
  getMonthCloseStatusFn,
} from "./functions/session.functions";
export {
  requestDiscountApprovalFn,
  getDiscountApprovalRequestFn,
  listPendingDiscountApprovalsFn,
  decideDiscountApprovalFn,
} from "./functions/approval.functions";
export type { SessionFormDto } from "./contracts";
export type { ServiceDto, ServiceCatalogDto } from "./contracts";
export type {
  BranchApproverDto,
  ApprovalUnavailableState,
  RecordSessionResult,
  EditableSessionDto,
  EditSessionResult,
  ClosedMonthDto,
  MonthCloseStatusDto,
  SessionEditHistoryDto,
  PendingDiscountApprovalDto,
  DiscountApprovalRequestDto,
  FailedPinAttemptDto,
  ManagerPinStatusDto,
} from "./contracts";

export type { SessionReportRow } from "./contracts";
export { serviceSessionRecordingAvailable } from "./domain/session-availability";

export const readServiceReport = createServerOnlyFn(
  async (db: pg.PoolClient, companyId: string, from: string, until: string, limit: number) => {
    const { loadSessionReport, readSessionReport } = await import("./index.server");
    return loadSessionReport(() => readSessionReport(db, companyId, from, until, limit));
  },
);
export {
  getDiscountSettingsFn,
  saveDiscountGrantFn,
  revokeDiscountGrantFn,
  setManagerPinFn,
  getManagerPinStatusFn,
  listFailedPinAttemptsFn,
} from "./functions/discount.functions";
