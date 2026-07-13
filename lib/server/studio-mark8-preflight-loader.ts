// SERVER-ONLY. Production loader for Studio's read-only Mark 8 preparation.
import { getSupabaseAdmin } from "./supabase";
import {
  createSupabaseMarkSprintRuntimeReadPorts,
  prepareMarkSprintRuntimePreview,
  type MarkSprintRuntimePreview,
} from "./mark-sprint-runtime";
import { MARK_8_STUDIO_SLUG } from "../studio-mark8-preflight";

type Mark8PreviewLoader = () => Promise<MarkSprintRuntimePreview>;
let mark8PreviewLoaderForTesting: Mark8PreviewLoader | null = null;

// TEST SEAM (offline route verification only). Production always uses the
// server-only Supabase read adapter + ESV key below.
export function __setMark8PreviewLoaderForTesting(
  loader: Mark8PreviewLoader | null,
): void {
  mark8PreviewLoaderForTesting = loader;
}

export async function loadMark8RuntimePreview(): Promise<MarkSprintRuntimePreview> {
  if (mark8PreviewLoaderForTesting) return mark8PreviewLoaderForTesting();

  const db = getSupabaseAdmin();
  const apiKey = process.env.ESV_API_KEY?.trim();
  if (!db || !apiKey) throw new Error("Mark 8 preflight unavailable");

  return prepareMarkSprintRuntimePreview({
    slug: MARK_8_STUDIO_SLUG,
    apiKey,
    ports: createSupabaseMarkSprintRuntimeReadPorts(db),
  });
}
