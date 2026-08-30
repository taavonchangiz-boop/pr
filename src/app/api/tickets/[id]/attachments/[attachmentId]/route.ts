// =====================================================================
// POSTYAR — /api/tickets/[id]/attachments/[attachmentId]
// ---------------------------------------------------------------------
// GET — stream a single attachment file (image or zip) back to the
// requester. Authorization: ticket owner OR staff/admin. The MIME type
// is taken from the TicketAttachment row (validated at upload time).
//
// Responses are sent with:
//   Content-Type: <mime>
//   Content-Disposition: inline (images) / attachment (zip)
//   Cache-Control: private, no-store
//   X-Content-Type-Options: nosniff
//   X-Frame-Options: DENY
// =====================================================================
import { NextResponse } from "next/server";
import { requireUser, AuthError } from "@/lib/server/auth";
import { getAttachmentForDownload } from "@/lib/tickets";
import { readPrivateFile, STORAGE_ROOT } from "@/lib/storage";
import path from "node:path";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; attachmentId: string }> },
) {
  let user;
  try {
    user = await requireUser();
  } catch (e) {
    return NextResponse.json(
      { errorFa: (e as AuthError).message },
      { status: (e as AuthError).status },
    );
  }
  const { id: _ticketId, attachmentId } = await params;
  const isStaff = user.role === "admin" || user.role === "support";

  const r = await getAttachmentForDownload({
    attachmentId,
    userId: user.id,
    isStaff,
  });
  if (!r.ok) {
    return NextResponse.json(
      { errorFa: r.errorFa },
      { status: r.errorFa === "دسترسی غیرمجاز." ? 403 : 404 },
    );
  }

  // Defense-in-depth: storagePath is stored relative to STORAGE_ROOT; verify
  // the resolved absolute path stays within STORAGE_ROOT/tickets.
  const absolute = path.isAbsolute(r.storagePath)
    ? r.storagePath
    : path.join(STORAGE_ROOT, r.storagePath);
  const normalized = path.normalize(absolute);
  const allowedRoot = path.join(STORAGE_ROOT, "tickets");
  if (!normalized.startsWith(allowedRoot + path.sep) && normalized !== allowedRoot) {
    return NextResponse.json(
      { errorFa: "مسیر فایل خارج از محدوده مجاز است." },
      { status: 400 },
    );
  }

  let buf: Buffer;
  try {
    buf = await readPrivateFile(r.storagePath);
  } catch {
    return NextResponse.json(
      { errorFa: "فایل یافت نشد." },
      { status: 404 },
    );
  }

  const safeName = encodeURIComponent(r.fileName);
  const isImage = r.mime.startsWith("image/");
  const disposition = isImage ? "inline" : "attachment";
  return new Response(new Uint8Array(buf), {
    status: 200,
    headers: {
      "content-type": r.mime || "application/octet-stream",
      "content-length": String(buf.byteLength),
      "content-disposition": `${disposition}; filename="${safeName}"; filename*=UTF-8''${safeName}`,
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
      "x-frame-options": "DENY",
    },
  });
}
