// TEMPORARY adversarial-verification demo (not part of the suite; delete after run).
// Reproduces the two claimed approve-path message defects end-to-end through the
// REAL admin route handler, using the same test seams verify-studio-safety.ts uses.
import { POST as adminPost } from "../app/api/admin/generation/route";
import { __setStoredSetupApprovalStoreForTesting, readStoredSetupApproval, connectedChapterReceiptAppliesIncludingStored } from "../lib/server/chapter-setup-approvals";
import { __setGenerationTestOverrides, type GenerationSettings } from "../lib/server/generation-settings";
import { buildMarkSprintSetupContract, markSprintStoredApprovalApplies } from "../lib/server/mark-sprint-setup-contracts";

process.env.DEV_ADMIN_TOKEN = "adversarial-demo-token";
const ADMIN = process.env.DEV_ADMIN_TOKEN;

const TEST_SETTINGS: GenerationSettings = {
  id: "global",
  text_generation_enabled: true,
  image_generation_enabled: true,
  allowed_slugs: ["exodus-27", "mark-8"],
  selected_text_model: "offline-test-model",
  selected_image_model: "offline-test-image-model",
  daily_budget_limit_usd: null,
  require_confirm: false,
  updated_at: "T0",
};

function adminReq(body: Record<string, unknown>): Request {
  return new Request("http://localhost:3000/api/admin/generation", {
    method: "POST",
    headers: { "content-type": "application/json", "x-admin-token": ADMIN },
    body: JSON.stringify(body),
  });
}

async function main() {
  const audit: Array<Record<string, unknown>> = [];
  __setGenerationTestOverrides({ settings: TEST_SETTINGS, captureAudit: audit });
  const contract = buildMarkSprintSetupContract("mark-9");
  const rows = new Map<string, Record<string, unknown>>();

  // ============ SCENARIO 1 ============
  // Write succeeds; the seeder's post-write re-read hits a transient Supabase
  // error. The production store (chapter-setup-approvals.ts:55-58) swallows ANY
  // read error into `return null`, so the fake store returns null from read()
  // while upsert() durably stores the row — exactly the production behavior.
  let failReads = false;
  __setStoredSetupApprovalStoreForTesting({
    async read(slug) {
      if (failReads) return null; // what production read() does on a Supabase error
      return rows.get(slug) ?? null;
    },
    async upsert(row) {
      rows.set(String(row.slug), row); // write SUCCEEDS (durable)
    },
  });
  failReads = true;
  const res1 = await adminPost(
    adminReq({ action: "prepare_chapter_approve", slug: "mark-9", confirm: true, setupDigest: contract.setupDigest }),
  );
  const body1 = (await res1.json()) as { error?: string };
  failReads = false;
  console.log("=== SCENARIO 1: transient read error after successful approval write ===");
  console.log("status:", res1.status);
  console.log("approval row durably stored:", rows.has("mark-9"));
  console.log("row receipt_digest === approved digest:", rows.get("mark-9")?.receipt_digest === contract.setupDigest);
  console.log("stored row IS the Mark 9 receipt once reads recover:", await connectedChapterReceiptAppliesIncludingStored("mark-9"));
  console.log("message shown to owner:", JSON.stringify(body1.error));
  console.log();

  // ============ SCENARIO 2 ============
  // Two tabs approve different packets concurrently. Tab A approves an EDITED
  // packet (digest dA); tab B's UNEDITED approval upsert (onConflict "slug",
  // last-writer-wins) lands between A's row write and A's seeder re-read.
  rows.clear();
  const packetNotes = contract.notes.map((note) => ({ id: note.guidanceId, text: note.text }));
  const editedNotes = packetNotes.map((note, i) =>
    i === 2 ? { ...note, text: `${note.text} Tab A owner emphasis.` } : note,
  );
  const preview = await adminPost(
    adminReq({ action: "prepare_chapter_preview", slug: "mark-9", notes: editedNotes }),
  );
  const editedDigest = ((await preview.json()) as { setupDigest?: string }).setupDigest ?? "";
  console.log("=== SCENARIO 2: concurrent-tab overwrite before the seeder re-read ===");
  console.log("tab A edited digest distinct from artifact digest:", editedDigest !== contract.setupDigest && editedDigest.length === 64);

  let interleaveTabB = true;
  __setStoredSetupApprovalStoreForTesting({
    async read(slug) { return rows.get(slug) ?? null; },
    async upsert(row) {
      rows.set(String(row.slug), row); // tab A's row lands...
      if (interleaveTabB) {
        interleaveTabB = false;
        // ...then tab B's concurrent unedited approval overwrites it
        // (production upsert is onConflict:"slug" = last-writer-wins).
        rows.set("mark-9", {
          slug: "mark-9",
          scope: contract.scope,
          approved_by: "Jason Hales (owner)",
          approved_at: new Date().toISOString(),
          evidence: "tab B: owner reviewed the unedited on-screen packet and approved it.",
          guidance_digest: contract.guidanceDigest,
          notes_digest: contract.notesDigest,
          receipt_digest: contract.setupDigest,
          packet_notes: null,
        });
      }
    },
  });
  const res2 = await adminPost(
    adminReq({ action: "prepare_chapter_approve", slug: "mark-9", confirm: true, setupDigest: editedDigest, notes: editedNotes }),
  );
  const body2 = (await res2.json()) as { error?: string };
  console.log("status:", res2.status);
  console.log("message shown to tab A owner:", JSON.stringify(body2.error));
  const stored = await readStoredSetupApproval("mark-9");
  console.log("recorded receipt_digest:", stored?.receipt_digest);
  console.log("tab A's approved digest:", editedDigest);
  console.log("recorded approval is tab A's packet:", stored?.receipt_digest === editedDigest);
  console.log("recorded approval is tab B's packet:", stored?.receipt_digest === contract.setupDigest);
  console.log("tab B row applies as the receipt:", markSprintStoredApprovalApplies("mark-9", stored));

  __setStoredSetupApprovalStoreForTesting(null);
  __setGenerationTestOverrides(null);
}

main().then(
  () => process.exit(0),
  (error) => {
    console.error(error);
    process.exit(1);
  },
);
