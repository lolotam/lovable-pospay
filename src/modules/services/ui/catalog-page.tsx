import { useRef, useState } from "react";
import { queryOptions, useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Plus, Pencil, Save } from "lucide-react";
import { CompanyScope } from "@/modules/staff";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { t } from "@/i18n";
import { getCatalogFn, saveServiceFn } from "../functions/catalog.functions";
import type { ServiceDto } from "../contracts";
function kwd(value: string) {
  const n = BigInt(value);
  return `${n / 1000n}.${(n % 1000n).toString().padStart(3, "0")}`;
}
const catalogQuery = (companyId: string) =>
  queryOptions({
    queryKey: ["catalog", companyId],
    queryFn: async () => {
      try {
        return await getCatalogFn({ data: { companyId } });
      } catch {
        return null;
      }
    },
  });
export function CatalogPage() {
  return <CompanyScope title="services.title">{(id) => <Catalog companyId={id} />}</CompanyScope>;
}
function useCatalog({ companyId }: { companyId: string }) {
  const { data, isFetching } = useSuspenseQuery(catalogQuery(companyId));
  const cache = useQueryClient();
  const save = useServerFn(saveServiceFn);
  const [edit, setEdit] = useState<ServiceDto | null>(null);
  const [form, setForm] = useState(false);
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [staffIds, setStaff] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const createRequest = useRef<string | null>(null);
  function open(s: ServiceDto | null) {
    createRequest.current = null;
    setEdit(s);
    setName(s?.name ?? "");
    setPrice(s ? kwd(s.priceMills) : "");
    setStaff(s?.staffIds ?? []);
    setForm(true);
    setMessage("");
  }
  async function submit() {
    if (busy || isFetching) return;
    setBusy(true);
    try {
      const result = await save({
        data: {
          companyId,
          name,
          price,
          staffIds,
          ...(edit
            ? { id: edit.id, version: edit.version }
            : { requestId: (createRequest.current ??= crypto.randomUUID()) }),
        },
      });
      setForm(false);
      setMessage(t("ops.saved"));
      try {
        await cache.invalidateQueries({ queryKey: ["catalog", companyId] });
        const fresh = await cache.fetchQuery(catalogQuery(companyId));
        if (!fresh?.services.some((s) => s.id === result.id && s.name === name.trim())) {
          setMessage(t("services.savedRefreshFailed"));
        }
      } catch {
        setMessage(t("services.savedRefreshFailed"));
      }
    } catch {
      setMessage(t("services.error"));
    } finally {
      setBusy(false);
    }
  }
  const fields = { name, setName, price, setPrice, staffIds, setStaff };
  return { data, edit, form, ...fields, busy, message, open, submit, setForm };
}
function Catalog({ companyId }: { companyId: string }) {
  const state = useCatalog({ companyId });
  const { data, busy, open, message } = state;
  if (!data) return <p role="alert">{t("ops.forbidden")}</p>;
  return (
    <div className="space-y-6">
      {data.canManage && (
        <Button onClick={() => open(null)} disabled={busy}>
          <Plus />
          {t("services.add")}
        </Button>
      )}
      <CatalogForm state={state} />
      <CatalogItems state={state} />
      {!data.services.length && <p>{t("ops.empty")}</p>}
      <p role="status">{message}</p>
    </div>
  );
}
type CatalogState = ReturnType<typeof useCatalog>;
function CatalogForm({ state }: { state: CatalogState }) {
  const { data, form, name, setName, price, setPrice, busy, submit, setForm } = state;
  if (!data) return null;
  return (
    <>
      {form && (
        <form
          className="max-w-xl space-y-4 border-b border-border pb-6"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <label className="block space-y-2">
            <span>{t("services.name")}</span>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={120}
            />
          </label>
          <label className="block space-y-2">
            <span>{t("services.price")}</span>
            <Input
              dir="ltr"
              inputMode="decimal"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              required
              pattern="[0-9]{1,12}(\.[0-9]{1,3})?"
            />
          </label>
          <AssignmentFields state={state} />
          <div className="flex gap-3">
            <Button disabled={busy}>
              <Save />
              {t("services.save")}
            </Button>
            <Button type="button" variant="outline" disabled={busy} onClick={() => setForm(false)}>
              {t("phone.cancel")}
            </Button>
          </div>
        </form>
      )}
    </>
  );
}
function CatalogItems({ state }: { state: CatalogState }) {
  const { data, busy, open } = state;
  if (!data) return null;
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {data.services.map((s) => (
        <article key={s.id} className="space-y-3 rounded-md border border-border bg-card p-4">
          <h2 className="font-semibold">{s.name}</h2>
          <p dir="ltr" className="text-start font-mono">
            {kwd(s.priceMills)} {t("ops.kwd")}
          </p>
          <p className="text-sm text-muted-foreground">
            {s.staffIds
              .map((id) => data.staff.find((v) => v.id === id)?.name)
              .filter(Boolean)
              .join(" · ") || t("services.unassigned")}
          </p>
          {data.canManage && (
            <Button variant="outline" disabled={busy} onClick={() => open(s)}>
              <Pencil />
              {t("services.edit")}
            </Button>
          )}
        </article>
      ))}
    </div>
  );
}

function AssignmentFields({ state }: { state: CatalogState }) {
  const { data, staffIds, setStaff } = state;
  if (!data) return null;
  return (
    <fieldset className="space-y-2">
      <legend>{t("services.assign")}</legend>
      {data.staff.map((s) => (
        <label key={s.id} className="flex min-h-11 items-center gap-3">
          <input
            type="checkbox"
            checked={staffIds.includes(s.id)}
            onChange={(e) =>
              setStaff(
                e.target.checked ? [...staffIds, s.id] : staffIds.filter((id) => id !== s.id),
              )
            }
          />
          {s.name}
        </label>
      ))}
    </fieldset>
  );
}
