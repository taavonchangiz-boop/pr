// POSTYAR — GET /api/media/[id] — auth-gated stream
// Verifies ownership (or admin role) before streaming the stored file.
// The file lives under /storage, NEVER in the public web root.
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser, AuthError } from "@/lib/server/auth";
import { readPrivateFile } from "@/lib/storage";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  let user;
  try { user = await requireUser(); } catch (e) {
    return NextResponse.json({ errorFa: (e as AuthError).message }, { status: (e as AuthError).status });
  }
  const { id } = await params;
  const media = await db.media.findUnique({ where: { id } });
  if (!media) {
    return NextResponse.json({ errorFa: "رسانه یافت نشد." }, { status: 404 });
  }
  // Owner or admin
  if (media.ownerId !== user.id && user.role !== "admin") {
    return NextResponse.json({ errorFa: "دسترسی غیرمجاز." }, { status: 403 });
  }
  try {
    const buf = await readPrivateFile(media.storagePath);
    const safeName = encodeURIComponent(media.publicId);
    return new Response(new Uint8Array(buf), {
      status: 200,
      headers: {
        "content-type": media.mime || "application/octet-stream",
        "content-length": String(buf.byteLength),
        "content-disposition": `inline; filename="${safeName}"; filename*=UTF-8''${safeName}`,
        "cache-control": "private, no-store",
        "x-content-type-options": "nosniff",
        "x-frame-options": "DENY",
      },
    });
  } catch {
    return NextResponse.json({ errorFa: "فایل یافت نشد." }, { status: 404 });
  }
}
