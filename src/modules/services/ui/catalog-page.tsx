import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  queryOptions,
  useSuspenseQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Plus, Pencil, Save } from "lucide-react";
import { CompanyScope } from "@/modules/staff";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { t } from "@/i18n";
import { getCatalogFn, saveServiceFn } from "../functions/catalog.functions";
import { saveServiceInput, type SaveServiceInput, type ServiceDto } from "../contracts";
function kwd(value: string) {
  const n = BigInt(value);
  return `${n / 1000n}.${(n % 1000n).toString().padStart(3, "0")}`;
}
const catalogQuery = (companyId: string, userId: string) =>
  queryOptions({
    queryKey: ["catalog", userId, companyId],
    queryFn: async () => {
      try {
        return await getCatalogFn({ data: { companyId, expectedUserId: userId } });
      } catch {
        return null;
      }
    },
  });
type PendingCreates = Map<string, SaveServiceInput>;

export function CatalogPage() {
  const pendingCreates = useRef<PendingCreates>(new Map());
  const [switchLocked, setSwitchLocked] = useState(false);
  return (
    <CompanyScope title="services.title" switchLocked={switchLocked}>
      {(id, userId) => (
        <Catalog
          companyId={id}
          userId={userId}
          pendingCreates={pendingCreates.current}
          onSwitchLockChange={setSwitchLocked}
        />
      )}
    </CompanyScope>
  );
}
function usePendingCreate(drafts: PendingCreates, companyId: string, userId: string) {
  const key = JSON.stringify([userId, companyId]);
  const [pendingCreate, setPending] = useState(() => drafts.get(key));
  const mounted = useRef(false);
  useLayoutEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, [key]);
  function remember(data: SaveServiceInput) {
    const previous = drafts.get(key);
    if (previous && previous.requestId !== data.requestId) return false;
    drafts.set(key, data);
    setPending(data);
    return true;
  }
  function complete(requestId: string | undefined) {
    if (!requestId || !mounted.current || drafts.get(key)?.requestId !== requestId) return;
    drafts.delete(key);
    setPending(undefined);
  }
  return { pendingCreate, remember, complete };
}

function useCatalogForm(pendingCreate: SaveServiceInput | undefined) {
  const [edit, setEdit] = useState<ServiceDto | null>(null);
  const [form, setForm] = useState(!!pendingCreate);
  const [name, setName] = useState(pendingCreate?.name ?? "");
  const [price, setPrice] = useState(pendingCreate?.price ?? "");
  const [staffIds, setStaff] = useState<string[]>(pendingCreate?.staffIds ?? []);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(pendingCreate ? t("services.createUnconfirmed") : "");
  function open(s: ServiceDto | null) {
    setEdit(s);
    setName(s?.name ?? "");
    setPrice(s ? kwd(s.priceMills) : "");
    setStaff(s?.staffIds ?? []);
    setForm(true);
    setMessage("");
  }
  return {
    edit,
    form,
    setForm,
    name,
    setName,
    price,
    setPrice,
    staffIds,
    setStaff,
    busy,
    setBusy,
    message,
    setMessage,
    open,
  };
}

async function refreshSavedService(
  cache: QueryClient,
  companyId: string,
  userId: string,
  id: string,
  name: string,
  recovering: boolean,
  open: (service: ServiceDto) => void,
) {
  const options = catalogQuery(companyId, userId);
  try {
    await cache.invalidateQueries({ queryKey: options.queryKey });
    const refreshed = await cache.fetchQuery(options);
    const saved = refreshed?.services.find((service) => service.id === id);
    if (recovering && saved) open(saved);
    if (saved && (recovering || saved.name === name)) return;
  } catch {
    // The mutation already succeeded. Report only the refresh failure.
  }
  return "services.savedRefreshFailed" as const;
}

function useCatalog(companyId: string, userId: string, drafts: PendingCreates) {
  const { data, isFetching } = useSuspenseQuery(catalogQuery(companyId, userId));
  const cache = useQueryClient();
  const save = useServerFn(saveServiceFn);
  const { pendingCreate, remember, complete } = usePendingCreate(drafts, companyId, userId);
  const state = useCatalogForm(pendingCreate);
  const { edit, name, price, staffIds, busy, setBusy, setForm, setMessage, open } = state;
  async function submit() {
    if (busy || isFetching) return;
    const recovering = !!pendingCreate;
    const parsed = saveServiceInput.safeParse(
      pendingCreate ?? {
        companyId,
        name,
        price,
        staffIds,
        ...(edit ? { id: edit.id, version: edit.version } : { requestId: crypto.randomUUID() }),
      },
    );
    if (!parsed.success) {
      setMessage(t("services.error"));
      return;
    }
    const data = parsed.data;
    if (!data.id && !remember(data)) return;
    setBusy(true);
    try {
      const result = await save({ data: { ...data, expectedUserId: userId } });
      if (result.status === "unverified") throw new Error("Account changed during save");
      complete(data.requestId);
      if (result.status === "rejected") {
        setMessage(t("services.error"));
        return;
      }
      if (result.status === "stale") {
        setForm(false);
        await cache.invalidateQueries({ queryKey: catalogQuery(companyId, userId).queryKey });
        setMessage(t("services.staleEdit"));
        return;
      }
      setForm(false);
      setMessage(t("ops.saved"));
      const message = await refreshSavedService(
        cache,
        companyId,
        userId,
        result.id,
        data.name,
        recovering,
        open,
      );
      if (message) setMessage(t(message));
    } catch {
      setMessage(t(data.id ? "services.error" : "services.createUnconfirmed"));
    } finally {
      setBusy(false);
    }
  }
  return { ...state, data, pendingCreate, submit };
}
function Catalog({
  companyId,
  userId,
  pendingCreates,
  onSwitchLockChange,
}: {
  companyId: string;
  userId: string;
  pendingCreates: PendingCreates;
  onSwitchLockChange: (locked: boolean) => void;
}) {
  const state = useCatalog(companyId, userId, pendingCreates);
  const { data, busy, open, message, pendingCreate } = state;
  useEffect(() => {
    onSwitchLockChange(busy || !!pendingCreate);
    return () => onSwitchLockChange(false);
  }, [busy, pendingCreate, onSwitchLockChange]);
  if (!data) return <p role="alert">{t("ops.forbidden")}</p>;
  return (
    <div className="space-y-6">
      {data.canManage && (
        <Button onClick={() => open(null)} disabled={busy || !!pendingCreate}>
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
  const { data, form, name, setName, price, setPrice, busy, submit, setForm, pendingCreate } =
    state;
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
              disabled={busy || !!pendingCreate}
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={120}
            />
          </label>
          <label className="block space-y-2">
            <span>{t("services.price")}</span>
            <Input
              disabled={busy || !!pendingCreate}
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
              {t(pendingCreate ? "services.retryCreate" : "services.save")}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={busy || !!pendingCreate}
              onClick={() => setForm(false)}
            >
              {t("phone.cancel")}
            </Button>
          </div>
        </form>
      )}
    </>
  );
}
function CatalogItems({ state }: { state: CatalogState }) {
  const { data, busy, open, pendingCreate } = state;
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
            <Button variant="outline" disabled={busy || !!pendingCreate} onClick={() => open(s)}>
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
  const { data, staffIds, setStaff, busy, pendingCreate } = state;
  if (!data) return null;
  return (
    <fieldset disabled={busy || !!pendingCreate} className="space-y-2">
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
