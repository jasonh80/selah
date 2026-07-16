// Shared (client + server) shaping for the read-only Studio spend history
// (issue #29 cost-ledger groundwork). Pure: no network, storage, or
// environment access.
//
// The server shaping is the privacy boundary: cost_events.metadata can hold
// error text, digests, and job ids, so ONLY the allowlisted fields below ever
// reach the browser — from metadata, nothing but a well-formed slug.

export interface StudioCostEvent {
  createdAt: string;
  requestType: string;
  model: string;
  imageCount: number | null;
  estimatedCostUsd: number | null;
  actualCostUsd: number | null;
  slug: string | null;
}

export interface StudioCostHistory {
  events: StudioCostEvent[];
  /** Sum preferring each event's actual cost, falling back to its estimate. */
  totalUsd: number;
}

const SAFE_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const ISO_PREFIX = /^\d{4}-\d{2}-\d{2}T/u;

interface CostHistorySourceRow {
  request_type: string;
  model: string;
  image_count: number | null;
  estimated_cost_usd: number | null;
  actual_cost_usd: number | null;
  created_at: string;
  metadata: Record<string, unknown> | null;
}

function safeCost(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

/** Server-side: shape repository rows into the browser-safe payload. */
export function shapeStudioCostHistory(rows: readonly CostHistorySourceRow[]): StudioCostEvent[] {
  return rows.map((row) => {
    const metaSlug = row.metadata?.slug;
    return {
      createdAt: typeof row.created_at === "string" ? row.created_at : "",
      requestType: typeof row.request_type === "string" ? row.request_type : "unknown",
      model: typeof row.model === "string" ? row.model : "unknown",
      imageCount:
        typeof row.image_count === "number" && Number.isSafeInteger(row.image_count) && row.image_count >= 0
          ? row.image_count
          : null,
      estimatedCostUsd: safeCost(row.estimated_cost_usd),
      actualCostUsd: safeCost(row.actual_cost_usd),
      slug: typeof metaSlug === "string" && SAFE_SLUG.test(metaSlug) ? metaSlug : null,
    };
  });
}

/** Client-side strict parse of the cost_history response. */
export function readStudioCostHistory(value: unknown): StudioCostHistory | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (row.ok !== true || !Array.isArray(row.events)) return null;

  const events: StudioCostEvent[] = [];
  for (const item of row.events) {
    if (!item || typeof item !== "object" || Array.isArray(item)) return null;
    const event = item as Record<string, unknown>;
    if (typeof event.createdAt !== "string" || !ISO_PREFIX.test(event.createdAt)) return null;
    if (typeof event.requestType !== "string" || event.requestType === "") return null;
    if (typeof event.model !== "string" || event.model === "") return null;
    const imageCount =
      typeof event.imageCount === "number" &&
      Number.isSafeInteger(event.imageCount) &&
      event.imageCount >= 0
        ? event.imageCount
        : null;
    const estimatedCostUsd = safeCost(event.estimatedCostUsd);
    const actualCostUsd = safeCost(event.actualCostUsd);
    const slug =
      typeof event.slug === "string" && SAFE_SLUG.test(event.slug) ? event.slug : null;
    events.push({
      createdAt: event.createdAt,
      requestType: event.requestType,
      model: event.model,
      imageCount,
      estimatedCostUsd,
      actualCostUsd,
      slug,
    });
  }

  const totalUsd =
    Math.round(
      events.reduce((sum, e) => sum + (e.actualCostUsd ?? e.estimatedCostUsd ?? 0), 0) * 10000,
    ) / 10000;
  return { events, totalUsd };
}
