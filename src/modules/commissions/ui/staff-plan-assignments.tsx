import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { assignPlanFn } from "../functions/plans.functions";
import type { CommissionPlanDto, StaffPlanAssignmentDto } from "../contracts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { t } from "@/i18n";

const monthPattern = /^\d{4}-(0[1-9]|1[0-2])$/;
const selectClass = "h-10 w-full rounded-md border border-input bg-background px-3";
const monthStart = (month: string): string => `${month}-01`;

export interface StaffPlanAssignmentsProps {
  companyId: string;
  staff: StaffPlanAssignmentDto[];
  plans: CommissionPlanDto[];
}

/**
 * إسناد الخطط للموظفات من أول شهر مختار، مع شارة «بدون خطة» لغير المسندة (021 M7، Q8).
 */
export function StaffPlanAssignments({ companyId, staff, plans }: StaffPlanAssignmentsProps) {
  const assign = useServerFn(assignPlanFn);
  const cache = useQueryClient();
  const [staffId, setStaffId] = useState("");
  const [planId, setPlanId] = useState("");
  const [month, setMonth] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const canSubmit = staffId !== "" && planId !== "" && monthPattern.test(month) && !busy;
  async function submit() {
    setBusy(true);
    setMessage("");
    try {
      await assign({
        data: { companyId, staffId, planId, effectiveMonth: monthStart(month) },
      });
      setMessage(t("commissions.assigned"));
      await cache.invalidateQueries({ queryKey: ["commission-plans", companyId] });
    } catch (error) {
      const code = error instanceof Error ? error.message : "";
      setMessage(code === "FORBIDDEN" ? t("ops.denied") : t("ops.saveError"));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">{t("commissions.assignTitle")}</h2>
      <form
        className="grid gap-3 sm:grid-cols-[1fr_1fr_10rem_auto] sm:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <label className="block space-y-2">
          <span>{t("commissions.staff")}</span>
          <select
            className={selectClass}
            value={staffId}
            onChange={(e) => setStaffId(e.target.value)}
            required
          >
            <option value="">{t("sessions.choose")}</option>
            {staff.map((member) => (
              <option key={member.staffId} value={member.staffId}>
                {member.staffName}
              </option>
            ))}
          </select>
        </label>
        <label className="block space-y-2">
          <span>{t("commissions.plan")}</span>
          <select
            className={selectClass}
            value={planId}
            onChange={(e) => setPlanId(e.target.value)}
            required
          >
            <option value="">{t("sessions.choose")}</option>
            {plans.map((plan) => (
              <option key={plan.id} value={plan.id}>
                {plan.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block space-y-2">
          <span>{t("commissions.effectiveMonth")}</span>
          <Input
            dir="ltr"
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            required
          />
        </label>
        <Button disabled={!canSubmit}>{t("commissions.assign")}</Button>
      </form>
      {message && <p role="status">{message}</p>}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("commissions.staff")}</TableHead>
            <TableHead>{t("commissions.plan")}</TableHead>
            <TableHead>{t("commissions.effectiveMonth")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {staff.map((member) => (
            <TableRow key={member.staffId}>
              <TableCell>{member.staffName}</TableCell>
              <TableCell>
                {member.planId === null ? (
                  <Badge variant="outline">{t("commissions.noPlan")}</Badge>
                ) : (
                  member.planName
                )}
              </TableCell>
              <TableCell>
                <bdi dir="ltr">{member.effectiveMonth ?? "—"}</bdi>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </section>
  );
}
