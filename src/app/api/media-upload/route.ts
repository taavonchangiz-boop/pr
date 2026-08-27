// POSTYAR — POST /api/media-upload  (multipart/form-data)
// Accepts a `file` field and a `kind` field (`image` | `video`).
// Routes through processImageUpload / processVideoUpload based on kind.
// Persists a Media row with ownerId. Returns metadata + UI max sizes.
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser, clientIp, audit, AuthError } from "@/lib/server/auth";
import { rateLimit } from "@/lib/security/cache";
import {
  processImageUpload,
  processVideoUpload,
  MAX_IMAGE_BYTES,
  MAX_VIDEO_BYTES,
  detectMime,
} from "@/lib/storage";

export async function POST(req: Request) {
  let user;
  try { user = await requireUser(); } catch (e) {
    return NextResponse.json({ errorFa: (e as AuthError).message }, { status: (e as AuthError).status });
  }
  const ip = clientIp(req);

  const rl = await rateLimit({
    key: `media:up:${user.id}`,
    limit: 30,
    windowMs: 60 * 1000,
  });
  if (!rl.ok) {
    return NextResponse.json({ errorFa: "تعداد بارگذاری بیش از حد مجاز است." }, { status: 429 });
  }

  const form = await req.formData();
  const file = form.get("file");
  const kind = (form.get("kind") as string | null) ?? "image";
  if (!(file instanceof File)) {
    return NextResponse.json({ errorFa: "فایلی ارسال نشده است." }, { status: 400 });
  }
  if (kind !== "image" && kind !== "video") {
    return NextResponse.json({ errorFa: "نوع رسانه باید image یا video باشد." }, { status: 400 });
  }

  // 5 MB safety net before we even read the whole buffer into memory.
  if (kind === "image" && file.size > MAX_IMAGE_BYTES) {
    return NextResponse.json(
      { errorFa: "حجم تصویر بیشتر از ۵ مگابایت است.", maxSize: { image: MAX_IMAGE_BYTES, video: MAX_VIDEO_BYTES } },
      { status: 413 },
    );
  }
  if (kind === "video" && file.size > MAX_VIDEO_BYTES) {
    return NextResponse.json(
      {
        errorFa: `حجم ویدئو بیشتر از حد مجاز (${Math.round(MAX_VIDEO_BYTES / 1024 / 1024)} مگابایت) است.`,
        maxSize: { image: MAX_IMAGE_BYTES, video: MAX_VIDEO_BYTES },
      },
      { status: 413 },
    );
  }

  const buf = Buffer.from(await file.arrayBuffer());
  const declaredMime = file.type || "application/octet-stream";

  let mediaId: string;
  let publicId: string;
  let storagePath: string;
  let mimeOut: string;
  let sizeBytes: number;
  let width: number | null = null;
  let height: number | null = null;

  try {
    if (kind === "image") {
      // Magic-byte detect: reject anything that doesn't smell like an image
      const detected = detectMime(buf);
      if (!detected) {
        throw new Error("فایل تصویر معتبر نیست یا آسیب دیده است.");
      }
      const r = await processImageUpload(buf, declaredMime);
      publicId = r.publicId;
      storagePath = r.storagePath;
      mimeOut = r.mime;
      sizeBytes = r.sizeBytes;
      width = r.width;
      height = r.height;
    } else {
      const detected = detectMime(buf);
      if (!detected) {
        throw new Error("فایل ویدئو معتبر نیست یا آسیب دیده است.");
      }
      const r = await processVideoUpload(buf, declaredMime);
      publicId = r.publicId;
      storagePath = r.storagePath;
      mimeOut = r.mime;
      sizeBytes = r.sizeBytes;
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "بارگذاری ناموفق بود.";
    return NextResponse.json(
      { errorFa: msg, maxSize: { image: MAX_IMAGE_BYTES, video: MAX_VIDEO_BYTES } },
      { status: 400 },
    );
  }

  const created = await db.media.create({
    data: {
      ownerId: user.id,
      kind,
      storagePath,
      publicId,
      mime: mimeOut,
      sizeBytes,
      width,
      height,
    },
  });
  await audit({
    userId: user.id,
    actor: "user",
    action: "media_upload",
    targetType: "media",
    targetId: created.id,
    ip,
    meta: { kind, mime: mimeOut, sizeBytes },
  });
  return NextResponse.json(
    {
      id: created.id,
      publicId: created.publicId,
      kind,
      mime: mimeOut,
      sizeBytes,
      width,
      height,
      maxSize: { image: MAX_IMAGE_BYTES, video: MAX_VIDEO_BYTES },
    },
    { status: 201 },
  );
}
