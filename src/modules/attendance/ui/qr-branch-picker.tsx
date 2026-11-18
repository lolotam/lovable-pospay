import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { listQrBranchesFn } from "../functions/attendance.functions";
import { ReceptionQr } from "./reception-qr";
import { t } from "@/i18n";

/** يعرض QR الفرع الوحيد مباشرة، أو قائمة فروع الشركة النشطة لاختيار واحد منها. */
export function QrBranchPicker({ companyId }: { companyId: string }) {
  const listBranches = useServerFn(listQrBranchesFn);
  const { data, isError, isPending } = useQuery({
    queryKey: ["qr-branches", companyId],
    queryFn: () => listBranches({ data: { companyId } }),
  });
  if (isPending) return <p role="status">{t("qr.loadingBranches")}</p>;
  if (isError) return <p role="alert">{t("qr.failed")}</p>;
  const [only] = data;
  if (data.length === 1 && only) return <ReceptionQr branchId={only.id} />;
  if (!data.length) return <p>{t("qr.noBranches")}</p>;
  return (
    <nav className="w-full max-w-sm space-y-3">
      <h1 className="text-2xl font-bold">{t("qr.chooseBranch")}</h1>
      {data.map((branch) => (
        <Link
          key={branch.id}
          to="/pos/qr"
          search={{ branch: branch.id }}
          className="block rounded-md border border-input px-4 py-3 hover:bg-accent"
        >
          {branch.name}
        </Link>
      ))}
    </nav>
  );
}
