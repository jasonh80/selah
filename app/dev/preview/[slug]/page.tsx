import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { AppShell } from "@/components/shell/AppShell";
import { ChapterView } from "@/components/ChapterView";
import { getDraftWorkup } from "@/lib/server/chapter-workups-repository";
import { devRoutesEnabled } from "@/lib/server/dev-guard";
import { getChapterImagePlan } from "@/lib/content/chapter-content";
import {
  STUDIO_PREVIEW_COOKIE,
  verifyStudioPreviewAccess,
} from "@/lib/server/studio-preview-access";

// DEV ONLY: render a stored chapter at ANY status (incl. draft) so an admin can
// review it before publishing via /dev/publish. Reads stored content only —
// never generates.
export const dynamic = "force-dynamic";

export default async function DraftPreviewPage({
  params,
}: {
  params: { slug: string };
}) {
  // Local dev may opt in explicitly. Everywhere else, Studio mints a short-lived,
  // slug-bound, read-only HttpOnly cookie; the permanent admin token stays out
  // of browser history, logs, referrers, and preview URLs.
  const previewAccess = verifyStudioPreviewAccess(
    cookies().get(STUDIO_PREVIEW_COOKIE)?.value,
    params.slug,
  );
  if (!devRoutesEnabled() && !previewAccess) notFound();
  const draft = await getDraftWorkup(params.slug);
  if (!draft) notFound();
  const imagePlan = getChapterImagePlan(params.slug);
  const storedKinds = new Set(draft.workup.images.filter((i) => /^https?:\/\//.test(i.src)).map((i) => i.kind));

  // Single-image redo candidate (board #29): show it IN PLACE with a clear
  // banner so the owner can judge it inside the real chapter. Display-only —
  // the stored draft is untouched until the owner clicks "Use this image".
  const raw = draft.workup as unknown as Record<string, unknown>;
  const redoCandidate =
    draft.status === "draft" &&
    raw.imageRedoState === "candidate" &&
    typeof raw.imageRedoKind === "string" &&
    typeof raw.imageRedoCandidateUrl === "string" &&
    /^https:\/\//.test(raw.imageRedoCandidateUrl)
      ? { kind: raw.imageRedoKind, url: raw.imageRedoCandidateUrl }
      : null;
  const displayWorkup = redoCandidate
    ? {
        ...draft.workup,
        images: draft.workup.images.map((image) =>
          image.kind === redoCandidate.kind ? { ...image, src: redoCandidate.url } : image,
        ),
      }
    : draft.workup;

  return (
    <AppShell>
      <div className="mx-auto max-w-[1180px] px-4 pt-3 lg:px-6">
        <div className="rounded-md border border-dashed bg-card-soft px-3 py-2 text-[12px] text-secondary">
          <span className="font-semibold text-accent-strong">DRAFT PREVIEW</span> · {params.slug} · status:{" "}
          <code>{draft.status}</code>
        </div>
        {redoCandidate && (
          <div className="mt-2 rounded-md border border-dashed bg-card-soft px-3 py-2 text-[12px] text-secondary">
            <span className="font-semibold text-accent-strong">REDO CANDIDATE SHOWN</span> · the{" "}
            <code>{redoCandidate.kind}</code> image below is the unapproved candidate. The stored draft is
            unchanged until you choose &ldquo;Use this image&rdquo; in Studio.
          </div>
        )}
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
      <ChapterView data={displayWorkup} source="draft" />
    </AppShell>
  );
}
