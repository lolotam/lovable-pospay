import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ThumbsDown, ThumbsUp } from "@phosphor-icons/react";
import { CompanyScope } from "@/modules/staff";
import { decideDiscountApprovalFn } from "../functions/approval.functions";
import type { PendingDiscountApprovalDto } from "../contracts";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { t, type MessageKey } from "@/i18n";
import { kwd } from "./session-format";
import { pendingApprovalsQuery } from "./approval-queries";

const decisionErrorKeys = ["APPROVER_NOT_ALLOWED", "APPROVAL_REQUEST_CLOSED"] as const;

export function ApprovalsPage() {
  return (
    <CompanyScope title="approvals.title">{(id) => <ApprovalsInbox companyId={id} />}</CompanyScope>
  );
}

function ApprovalsInbox({ companyId }: { companyId: string }) {
  const decide = useServerFn(decideDiscountApprovalFn);
  const cache = useQueryClient();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const { data, fetchStatus, isFetchedAfterMount } = useQuery(pendingApprovalsQuery(companyId));
  if (fetchStatus !== "idle" || !isFetchedAfterMount)
    return <p role="status">{t("phone.loading")}</p>;
  if (data === undefined || data === null) return <p role="alert">{t("ops.forbidden")}</p>;
  async function decideOn(requestId: string, approve: boolean) {
    setBusyId(requestId);
    setMessage("");
    try {
      await decide({ data: { companyId, requestId, approve } });
      setMessage(t("approvals.done"));
      await cache.invalidateQueries({ queryKey: ["pending-discount-approvals", companyId] });
    } catch (error) {
      const code = error instanceof Error ? error.message : "";
      setMessage(
        (decisionErrorKeys as readonly string[]).includes(code)
          ? t(`approvals.${code}` as MessageKey)
          : t("ops.saveError"),
      );
    } finally {
      setBusyId(null);
    }
  }
  return (
    <div className="space-y-4">
      <p className="text-muted-foreground">{t("approvals.listHint")}</p>
      {!data.length ? (
        <p role="status">{t("ops.empty")}</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("approvals.branch")}</TableHead>
              <TableHead>{t("approvals.service")}</TableHead>
              <TableHead>{t("approvals.listPrice")}</TableHead>
              <TableHead>{t("approvals.requestedPrice")}</TableHead>
              <TableHead>{t("approvals.reason")}</TableHead>
              <TableHead>{t("approvals.requester")}</TableHead>
              <TableHead>{t("approvals.timeLeft")}</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((request) => (
              <ApprovalRow
                key={request.id}
                request={request}
                busy={busyId === request.id}
                onDecide={decideOn}
              />
            ))}
          </TableBody>
        </Table>
      )}
      {message && <p role="status">{message}</p>}
    </div>
  );
}

function ApprovalRow({
  request,
  busy,
  onDecide,
}: {
  request: PendingDiscountApprovalDto;
  busy: boolean;
  onDecide: (requestId: string, approve: boolean) => void;
}) {
  const secondsLeft = Math.max(
    0,
    Math.ceil((new Date(request.expiresAt).getTime() - Date.now()) / 1000),
  );
  const minutes = Math.max(1, Math.ceil(secondsLeft / 60));
  return (
    <TableRow>
      <TableCell>{request.branchName}</TableCell>
      <TableCell>{request.serviceName}</TableCell>
      <TableCell>
        <bdi dir="ltr">{kwd(request.listPriceMills)}</bdi>
      </TableCell>
      <TableCell>
        <bdi dir="ltr">{kwd(request.requestedPriceMills)}</bdi>
      </TableCell>
      <TableCell>{request.discountReason}</TableCell>
      <TableCell>{request.requesterName}</TableCell>
      <TableCell>{t("approvals.minutes").replace("{n}", String(minutes))}</TableCell>
      <TableCell className="whitespace-nowrap">
        <Button variant="outline" disabled={busy} onClick={() => onDecide(request.id, true)}>
          <ThumbsUp aria-hidden />
          {t("approvals.approve")}
        </Button>{" "}
        <Button variant="destructive" disabled={busy} onClick={() => onDecide(request.id, false)}>
          <ThumbsDown aria-hidden />
          {t("approvals.reject")}
        </Button>
      </TableCell>
    </TableRow>
  );
}
