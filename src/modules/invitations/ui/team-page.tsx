import { useState } from "react";
import { queryOptions, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CompanyScope } from "@/modules/staff";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { t, type MessageKey } from "@/i18n";
import { invitableRoles } from "../contracts";
import { createInviteFn, getTeamFn, revokeInviteFn } from "../functions/invitation.functions";

type Role = (typeof invitableRoles)[number];
const teamQuery = (companyId: string, userId: string) =>
  queryOptions({
    queryKey: ["team", userId, companyId],
    queryFn: async () => {
      try {
        return await getTeamFn({ data: { companyId } });
      } catch {
        return null;
      }
    },
  });
const selectClass = "h-10 w-full rounded-md border border-input bg-background px-3";
const roleLabel = (r: string) => t(`team.role.${r}` as MessageKey);

export function TeamPage() {
  return (
    <CompanyScope title="team.title">
      {(id, userId) => <Team companyId={id} userId={userId} />}
    </CompanyScope>
  );
}
function Team({ companyId, userId }: { companyId: string; userId: string }) {
  const { data } = useSuspenseQuery(teamQuery(companyId, userId));
  const qc = useQueryClient();
  const create = useServerFn(createInviteFn);
  const revoke = useServerFn(revokeInviteFn);
  const [f, setF] = useState<{ email: string; role: Role; branchId: string }>({
    email: "",
    role: "reception",
    branchId: "",
  });
  const [result, setResult] = useState<{ emailed: true } | null>(null);
  const [error, setError] = useState("");
  if (!data?.canInvite) return <p role="alert">{t("ops.forbidden")}</p>;
  const roles = invitableRoles.filter((r) => data.isOwner || r !== "branch_manager");
  const refresh = () => qc.invalidateQueries({ queryKey: ["team", userId, companyId] });
  async function submit() {
    setError("");
    setResult(null);
    try {
      setResult(
        await create({
          data: { companyId, email: f.email, role: f.role, branchId: f.branchId || null },
        }),
      );
      setF((p) => ({ ...p, email: "" }));
      await refresh();
    } catch {
      setError(t("team.error"));
    }
  }
  return (
    <section className="max-w-3xl space-y-6">
      <form
        className="grid gap-3 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <label className="block space-y-2 sm:col-span-2">
          <span>{t("team.email")}</span>
          <Input
            dir="ltr"
            type="email"
            required
            value={f.email}
            onChange={(e) => setF({ ...f, email: e.target.value })}
          />
        </label>
        <label className="block space-y-2">
          <span>{t("team.roleLabel")}</span>
          <select
            className={selectClass}
            value={f.role}
            onChange={(e) => setF({ ...f, role: e.target.value as Role })}
          >
            {roles.map((r) => (
              <option key={r} value={r}>
                {roleLabel(r)}
              </option>
            ))}
          </select>
        </label>
        <label className="block space-y-2">
          <span>{t("team.branch")}</span>
          <select
            className={selectClass}
            value={f.branchId}
            onChange={(e) => setF({ ...f, branchId: e.target.value })}
          >
            <option value="">{t("team.allBranches")}</option>
            {data.branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </label>
        <Button className="sm:col-span-2 sm:justify-self-start">{t("team.send")}</Button>
      </form>
      {error && (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      )}
      {result && (
        <div role="status" className="space-y-2 rounded-md border border-border bg-card p-3">
          <p>{t("team.emailed")}</p>
        </div>
      )}
      <ul className="space-y-2">
        {data.invites.map((i) => (
          <li
            key={i.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-card p-3"
          >
            <span dir="ltr">{i.email}</span>
            <span>
              {roleLabel(i.role)}
              {i.branch ? ` · ${i.branch}` : ""} · {t(`team.status.${i.status}` as MessageKey)}
            </span>
            {i.status === "pending" && (
              <Button
                variant="outline"
                onClick={async () => {
                  if (confirm(t("team.confirmRevoke"))) {
                    await revoke({ data: { companyId, id: i.id } });
                    await refresh();
                  }
                }}
              >
                {t("team.revoke")}
              </Button>
            )}
          </li>
        ))}
        {!data.invites.length && <li>{t("ops.empty")}</li>}
      </ul>
    </section>
  );
}
