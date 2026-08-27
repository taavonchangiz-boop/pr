// =====================================================================
// POSTYAR — Publishing state machine
// ---------------------------------------------------------------------
// Allowed transitions:
//   draft     → scheduled
//   draft     → queued
//   scheduled → queued
//   queued    → processing
//   processing→ delivered
//   processing→ failed
//   scheduled → cancelled
//   queued    → cancelled
//
// Any other transition throws an InvalidTransition error carrying the
// Persian reason. Pure functions, no side effects.
// =====================================================================
export type ContentStatus =
  | "draft"
  | "scheduled"
  | "queued"
  | "processing"
  | "delivered"
  | "failed"
  | "cancelled";

export class InvalidTransition extends Error {
  from: ContentStatus;
  to: ContentStatus;
  constructor(from: ContentStatus, to: ContentStatus) {
    super(`انتقال وضعیت نامعتبر: ${from} → ${to}`);
    this.name = "InvalidTransition";
    this.from = from;
    this.to = to;
  }
}

const ADJACENCY: Record<ContentStatus, ContentStatus[]> = {
  draft: ["scheduled", "queued", "cancelled"],
  scheduled: ["queued", "cancelled"],
  queued: ["processing", "cancelled"],
  processing: ["delivered", "failed"],
  delivered: [],
  failed: ["queued", "cancelled"],
  cancelled: [],
};

const TERMINAL: ReadonlySet<ContentStatus> = new Set<ContentStatus>(["delivered", "cancelled"]);

export function assertTransition(from: ContentStatus, to: ContentStatus): void {
  const allowed = ADJACENCY[from] ?? [];
  if (!allowed.includes(to)) {
    throw new InvalidTransition(from, to);
  }
}

export function nextStates(from: ContentStatus): ContentStatus[] {
  return [...(ADJACENCY[from] ?? [])];
}

export function isTerminal(s: ContentStatus): boolean {
  return TERMINAL.has(s);
}

export function isContentStatus(s: string): s is ContentStatus {
  return [
    "draft",
    "scheduled",
    "queued",
    "processing",
    "delivered",
    "failed",
    "cancelled",
  ].includes(s);
}
