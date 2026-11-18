import { useEffect, useLayoutEffect, useReducer, useRef, useState } from "react";
import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Plus, Pencil, Save } from "lucide-react";
import { CompanyScope } from "@/modules/staff";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { t } from "@/i18n";
import { saveServiceFn } from "../functions/catalog.functions";
import { catalogQuery } from "./catalog-query";
import { saveServiceInput, type SaveServiceInput, type ServiceDto } from "../contracts";
function kwd(value: string) {
  const n = BigInt(value);
  return `${n / 1000n}.${(n % 1000n).toString().padStart(3, "0")}`;
}
type PendingCreate = SaveServiceInput & { confirmedId?: string };
type PendingCreates = { byScope: Map<string, PendingCreate>; notify: () => void };

export function CatalogPage() {
  const pendingCreates = useRef(new Map<string, PendingCreate>());
  const [, notify] = useReducer((version: number) => version + 1, 0);
  const [switchLocked, setSwitchLocked] = useState(false);
  return (
    <CompanyScope title="services.title" switchLocked={switchLocked}>
      {(id, userId) => (
        <Catalog
          companyId={id}
          userId={userId}
          pendingCreates={{ byScope: pendingCreates.current, notify }}
          onSwitchLockChange={setSwitchLocked}
        />
      )}
    </CompanyScope>
  );
}
function usePendingCreate({ byScope, notify }: PendingCreates, key: string) {
  const pendingCreate = byScope.get(key);
  const mounted = useRef(false);
  useLayoutEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, [key]);
  function remember(data: SaveServiceInput) {
    const previous = byScope.get(key);
    if (previous && previous.requestId !== data.requestId) return false;
    byScope.set(key, data);
    notify();
    return true;
  }
  function confirm(request: SaveServiceInput, confirmedId: string) {
    if (byScope.get(key)?.requestId !== request.requestId) return;
    byScope.set(key, { ...request, confirmedId });
    notify();
  }
  function complete(requestId: string | undefined) {
    if (!requestId || !mounted.current || byScope.get(key)?.requestId !== requestId) return;
    byScope.delete(key);
    notify();
  }
  return { pendingCreate, remember, complete, confirm };
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
) {
  const options = catalogQuery(companyId, userId);
  try {
    await cache.invalidateQueries({ queryKey: options.queryKey });
    const refreshed = await cache.fetchQuery(options);
    const saved = refreshed?.services.find((service) => service.id === id);
    if (saved?.name === name) return;
  } catch {
    // The mutation already succeeded. Report only the refresh failure.
  }
  return "services.savedRefreshFailed" as const;
}

function useCatalog(companyId: string, userId: string, drafts: PendingCreates) {
  const query = useQuery(catalogQuery(companyId, userId));
  const cache = useQueryClient();
  const save = useServerFn(saveServiceFn);
  const scope = JSON.stringify([userId, companyId]);
  const { pendingCreate, remember, complete, confirm } = usePendingCreate(drafts, scope);
  const state = useCatalogForm(pendingCreate);
  const { edit, name, price, staffIds, busy, setBusy, setForm, setMessage } = state;
  async function submit() {
    if (busy || query.fetchStatus !== "idle" || pendingCreate?.confirmedId) return;
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
      if (result.status === "denied") void query.refetch();
      if (result.status === "denied" || result.status === "unverified")
        throw new Error("Catalog write not authorized");
      if (result.status === "saved" && pendingCreate) {
        confirm(data, result.id);
        await query.refetch();
        return;
      }
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
      const message = await refreshSavedService(cache, companyId, userId, result.id, data.name);
      if (message) setMessage(t(message));
    } catch {
      setMessage(t(data.id ? "services.error" : "services.createUnconfirmed"));
    } finally {
      setBusy(false);
    }
  }
  return { ...state, query, data: query.data, pendingCreate, complete, submit };
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
  const { data, busy, open, setForm, message, pendingCreate, complete, query } = state;
  const checking = !query.isFetchedAfterMount || query.fetchStatus !== "idle";
  const canRecover = !checking && !query.isError && data?.canManage === true;
  const readOnly = !checking && !query.isError && data?.canManage === false;
  const confirmed = data?.services.find((service) => service.id === pendingCreate?.confirmedId);
  useEffect(() => {
    if (!confirmed || checking || query.isError) return;
    complete(pendingCreate?.requestId);
    if (data?.canManage) open(confirmed);
    else setForm(false);
  }, [
    checking,
    complete,
    confirmed,
    data?.canManage,
    open,
    pendingCreate?.requestId,
    query.isError,
    setForm,
  ]);
  useEffect(() => {
    onSwitchLockChange(busy || (!!pendingCreate && canRecover));
    return () => onSwitchLockChange(false);
  }, [busy, pendingCreate, canRecover, onSwitchLockChange]);
  if (checking || data === null || query.isError || pendingCreate?.confirmedId) {
    return <CatalogReadStatus query={query} confirmed={!!pendingCreate?.confirmedId} />;
  }
  if (!data) return null;
  return (
    <div className="space-y-6">
      {data.canManage && (
        <Button onClick={() => open(null)} disabled={busy || !!pendingCreate}>
          <Plus />
          {t("services.add")}
        </Button>
      )}
      {data.canManage && <CatalogForm state={state} />}
      {readOnly && pendingCreate && <CatalogRecoveryAccess retry={() => void query.refetch()} />}
      <CatalogItems state={state} />
      {!data.services.length && <p>{t("ops.empty")}</p>}
      <p role="status">{message}</p>
    </div>
  );
}
type CatalogState = ReturnType<typeof useCatalog>;

function CatalogRecoveryAccess({ retry }: { retry: () => void }) {
  return (
    <div className="space-y-2">
      <p role="status">{t("services.createManageAccessNeeded")}</p>
      <Button type="button" onClick={retry}>
        {t("ops.retryLoad")}
      </Button>
    </div>
  );
}

function CatalogReadStatus({
  query,
  confirmed,
}: {
  query: CatalogState["query"];
  confirmed: boolean;
}) {
  if (query.isFetching) return <p role="status">{t("phone.loading")}</p>;
  const denied = !query.isError && query.data === null && query.isFetchedAfterMount;
  const message = denied
    ? "ops.denied"
    : confirmed
      ? "services.savedRefreshFailed"
      : "ops.forbidden";
  return (
    <div className="space-y-2">
      <p role="alert">{t(message)}</p>
      <Button type="button" onClick={() => void query.refetch()}>
        {t("ops.retryLoad")}
      </Button>
    </div>
  );
}

function CatalogForm({ state }: { state: CatalogState }) {
  const { data, form, name, setName, price, setPrice, submit, setForm, pendingCreate } = state;
  const busy = state.busy || state.query.isFetching;
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
  const { data, open, pendingCreate } = state;
  const busy = state.busy || state.query.isFetching;
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
