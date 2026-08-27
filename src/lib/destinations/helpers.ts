// =====================================================================
// POSTYAR — Destinations: helpers + masking
// =====================================================================
import { db } from "@/lib/db";
import { decryptString, encryptString } from "@/lib/security/crypto";
import { safeJsonParse } from "@/lib/server/auth";
import { getDestinationProvider, isValidProviderName } from "@/lib/providers/index";
import type { GlassButton } from "@/lib/types/glass-button";

export interface DestinationView {
  id: string;
  provider: string;
  label: string;
  chatId: string;
  status: string;
  lastError: string | null;
  lastCheckedAt: string | null;
  createdAt: string;
  updatedAt: string;
  config: Record<string, unknown>;
  /** Masked token preview (last 4 chars). NEVER the raw token. */
  tokenPreview: string;
}

const TOKEN_PREVIEW_VISIBLE = 4;

export function maskToken(token: string): string {
  if (!token) return "";
  if (token.length <= TOKEN_PREVIEW_VISIBLE) return "•".repeat(token.length);
  return (
    "•".repeat(Math.min(token.length - TOKEN_PREVIEW_VISIBLE, 24)) +
    token.slice(-TOKEN_PREVIEW_VISIBLE)
  );
}

export async function getDestinationToken(destinationId: string): Promise<string> {
  const d = await db.destination.findUnique({
    where: { id: destinationId },
    select: { botTokenEnc: true },
  });
  if (!d) return "";
  try { return decryptString(d.botTokenEnc); } catch { return ""; }
}

export async function reencryptDestinationToken(
  destinationId: string,
  newToken: string,
): Promise<void> {
  const enc = encryptString(newToken);
  await db.destination.update({
    where: { id: destinationId },
    data: { botTokenEnc: enc },
  });
}

export function toDestinationView(d: {
  id: string;
  provider: string;
  label: string;
  chatId: string;
  status: string;
  lastError: string | null;
  lastCheckedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  config: string;
  botTokenEnc: string;
}): DestinationView {
  let preview = "••••";
  try { preview = maskToken(decryptString(d.botTokenEnc)); } catch { preview = "••••"; }
  return {
    id: d.id,
    provider: d.provider,
    label: d.label,
    chatId: d.chatId,
    status: d.status,
    lastError: d.lastError,
    lastCheckedAt: d.lastCheckedAt ? d.lastCheckedAt.toISOString() : null,
    createdAt: d.createdAt.toISOString(),
    updatedAt: d.updatedAt.toISOString(),
    config: safeJsonParse(d.config, {} as Record<string, unknown>),
    tokenPreview: preview,
  };
}

export function toGlassButtonView(b: {
  id: string;
  destinationId: string;
  label: string;
  url: string | null;
  callbackData: string | null;
  rowOrder: number;
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}): GlassButton & { createdAt: string; updatedAt: string } {
  return {
    id: b.id,
    label: b.label,
    url: b.url,
    callbackData: b.callbackData,
    rowOrder: b.rowOrder,
    enabled: b.enabled,
    createdAt: b.createdAt.toISOString(),
    updatedAt: b.updatedAt.toISOString(),
  };
}

export async function assertOwnership(
  destinationId: string,
  ownerId: string,
): Promise<boolean> {
  const d = await db.destination.findUnique({
    where: { id: destinationId },
    select: { ownerId: true, status: true },
  });
  if (!d || d.ownerId !== ownerId) return false;
  return true;
}

/** Soft-deleted destinations remain in DB with `status = "deleted"`. */
export const DESTINATION_SOFT_DELETED = "deleted";

export { isValidProviderName, getDestinationProvider };
