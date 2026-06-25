import { notFound } from "next/navigation";
import { AppShell } from "@/components/shell/AppShell";
import { CompareClient } from "@/components/admin/CompareClient";
import { devRoutesEnabled } from "@/lib/server/dev-guard";

// DEV ONLY: compare saved draft versions side by side and choose/merge. Gated by
// the dev-routes flag OR the admin token. Reads + writes drafts only — never
// publishes and never generates.
export const dynamic = "force-dynamic";

export default function CompareVersionsPage({
  params,
  searchParams,
}: {
  params: { slug: string };
  searchParams: { token?: string };
}) {
  const token = searchParams?.token ?? "";
  const tokenOk = Boolean(process.env.DEV_ADMIN_TOKEN) && token === process.env.DEV_ADMIN_TOKEN;
  if (!devRoutesEnabled() && !tokenOk) notFound();

  return (
    <AppShell>
      <CompareClient slug={params.slug} token={token} />
    </AppShell>
  );
}
