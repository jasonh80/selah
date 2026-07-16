// TEMPORARY adversarial-verification repro (deleted after run).
// Demonstrates: prepare_chapter_status always re-proposes the ARTIFACT packet,
// so a re-approval of what the screen shows silently reverts stored owner edits.
process.env.DEV_ADMIN_TOKEN = "repro-offline-token";

import {
  __setGenerationTestOverrides,
  type GenerationSettings,
} from "../lib/server/generation-settings";
import { buildMarkSprintSetupContract } from "../lib/server/mark-sprint-setup-contracts";
import { __setStoredSetupApprovalStoreForTesting } from "../lib/server/chapter-setup-approvals";
import { POST as adminPost } from "../app/api/admin/generation/route";
import { decidePrepareChapterStatus } from "../lib/studio-prepare-chapter";

const ADMIN = process.env.DEV_ADMIN_TOKEN!;
const req = (body: Record<string, unknown>) =>
  new Request("http://localhost:3000/api/admin/generation", {
    method: "POST",
    headers: { "content-type": "application/json", "x-admin-token": ADMIN },
    body: JSON.stringify(body),
  });

const audit: Array<Record<string, unknown>> = [];
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
__setGenerationTestOverrides({ settings: TEST_SETTINGS, captureAudit: audit });

const rows = new Map<string, Record<string, unknown>>();
__setStoredSetupApprovalStoreForTesting({
  async read(slug) {
    return rows.get(slug) ?? null;
  },
  async upsert(row) {
    rows.set(String(row.slug), row);
  },
});

async function main() {
  const contract = buildMarkSprintSetupContract("mark-9");
  const artifactNotes = contract.notes.map((n) => ({ id: n.guidanceId, text: n.text }));

  // ---- Step 1: owner edits note 3 to remove/replace a bad instruction, approves.
  const editedNotes = artifactNotes.map((n, i) =>
    i === 2 ? { ...n, text: "OWNER-CORRECTED replacement text (bad instruction removed)." } : n,
  );
  const preview = await adminPost(
    req({ action: "prepare_chapter_preview", slug: "mark-9", notes: editedNotes }),
  );
  const editedDigest = ((await preview.json()) as { setupDigest?: string }).setupDigest ?? "";
  console.log("[1] preview status:", preview.status, "| edited digest != artifact:", editedDigest !== contract.setupDigest);

  const approve1 = await adminPost(
    req({ action: "prepare_chapter_approve", slug: "mark-9", confirm: true, setupDigest: editedDigest, notes: editedNotes }),
  );
  const approve1Body = (await approve1.json()) as { error?: string };
  console.log("[1] approve status:", approve1.status, "| message:", approve1Body.error ?? "(prepared)");
  const row1 = rows.get("mark-9") as { packet_notes: Array<{ text: string }>; receipt_digest: string };
  console.log("[1] stored packet_notes[2].text:", JSON.stringify(row1.packet_notes[2].text));
  console.log("[1] stored receipt_digest == edited digest:", row1.receipt_digest === editedDigest);

  // ---- Step 2: owner reopens the Prepare screen later (seeding incomplete /
  // transient setup-status failure -> setupComplete=false; receipt still valid).
  const status = await adminPost(req({ action: "prepare_chapter_status", slug: "mark-9" }));
  const statusJson = (await status.json()) as {
    prepare: { approved: boolean; setupComplete: boolean; setupDigest: string; notes: Array<{ id: string; text: string }> };
  };
  console.log("[2] status:", status.status, "| approved:", statusJson.prepare.approved, "| setupComplete:", statusJson.prepare.setupComplete);
  console.log("[2] on-screen notes[2].text:", JSON.stringify(statusJson.prepare.notes[2].text.slice(0, 60)) + "...");
  console.log("[2] screen shows the stored OWNER-CORRECTED text?", statusJson.prepare.notes[2].text.includes("OWNER-CORRECTED"));
  console.log("[2] response carries stored packet ANYWHERE?", JSON.stringify(statusJson).includes("OWNER-CORRECTED"));
  console.log("[2] on-screen digest == ARTIFACT digest:", statusJson.prepare.setupDigest === contract.setupDigest);

  // What the actual client does with this response:
  const decision = decidePrepareChapterStatus("mark-9", { ok: true, prepare: statusJson.prepare });
  console.log("[2] client decision kind:", decision.kind, "(proposal => editable screen reopens)");

  // ---- Step 3: owner re-approves EXACTLY what the screen shows (no on-screen
  // edits => client sends proposal.setupDigest + artifact notes verbatim).
  const approve2 = await adminPost(
    req({
      action: "prepare_chapter_approve",
      slug: "mark-9",
      confirm: true,
      setupDigest: statusJson.prepare.setupDigest,
      notes: statusJson.prepare.notes.map((n) => ({ id: n.id, text: n.text })),
    }),
  );
  console.log("[3] re-approve status:", approve2.status);
  const row2 = rows.get("mark-9") as { packet_notes: unknown; receipt_digest: string };
  console.log("[3] stored packet_notes after re-approval:", JSON.stringify(row2.packet_notes));
  console.log("[3] stored receipt_digest now == ARTIFACT digest:", row2.receipt_digest === contract.setupDigest);
  console.log(
    "[RESULT] owner edit silently reverted (packet_notes null, artifact digest bound):",
    row2.packet_notes === null && row2.receipt_digest === contract.setupDigest,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
