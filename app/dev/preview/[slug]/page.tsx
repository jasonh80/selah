import { notFound } from "next/navigation";
import { AppShell } from "@/components/shell/AppShell";
import { ChapterView } from "@/components/ChapterView";
import { getDraftWorkup } from "@/lib/server/chapter-workups-repository";
import { devRoutesEnabled } from "@/lib/server/dev-guard";
import { getChapterImagePlan } from "@/lib/content/chapter-content";

// DEV ONLY: render a stored chapter at ANY status (incl. draft) so an admin can
// review it before publishing via /dev/publish. Reads stored content only —
// never generates.
export const dynamic = "force-dynamic";

export default async function DraftPreviewPage({
  params,
  searchParams,
}: {
  params: { slug: string };
  searchParams: { token?: string };
}) {
  // Accessible via the dev-routes flag OR the admin token (so the admin console
  // can preview drafts without touching Netlify env vars).
  const tokenOk = Boolean(process.env.DEV_ADMIN_TOKEN) && searchParams?.token === process.env.DEV_ADMIN_TOKEN;
  if (!devRoutesEnabled() && !tokenOk) notFound();
  const draft = await getDraftWorkup(params.slug);
  if (!draft) notFound();
  const imagePlan = getChapterImagePlan(params.slug);
  const storedKinds = new Set(draft.workup.images.filter((i) => /^https?:\/\//.test(i.src)).map((i) => i.kind));

  return (
    <AppShell>
      <div className="mx-auto max-w-[1180px] px-4 pt-3 lg:px-6">
        <div className="rounded-md border border-dashed bg-card-soft px-3 py-2 text-[12px] text-secondary">
          <span className="font-semibold text-accent-strong">DRAFT PREVIEW</span> · {params.slug} · status:{" "}
          <code>{draft.status}</code> · publish with <code>/dev/publish?slug={params.slug}&amp;confirm=yes</code>
        </div>
        {imagePlan && (
          <details className="mt-2 rounded-md border border-dashed bg-card-soft px-3 py-2 text-[12px] text-secondary">
            <summary className="cursor-pointer">
              <span className="font-semibold text-accent-strong">APPROVED IMAGE PLAN</span> · {imagePlan.length} concepts
              (admin-only; images generate in the Image Preview stage)
            </summary>
            <ol className="mt-2 space-y-2">
              {imagePlan.map((c, i) => (
                <li key={c.kind}>
                  <span className="font-semibold text-primary">
                    {i + 1}. {c.title}
                  </span>{" "}
                  <span className="text-accent-strong">[{c.role}]</span>{" "}
                  <span>{storedKinds.has(c.kind) ? "· generated ✓" : "· concept only"}</span>
                  <p className="mt-0.5 leading-relaxed">{c.description}</p>
                </li>
              ))}
            </ol>
          </details>
        )}
      </div>
      <ChapterView data={draft.workup} source="draft" />
    </AppShell>
  );
}
