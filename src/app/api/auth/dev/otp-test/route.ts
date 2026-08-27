// POSTYAR dev-only OTP preview (NEVER in production).
// Allows the developer (in their sandbox) to read the OTP that was sent.
// In production, OTP delivery is real (SMS provider) and this route is disabled.
import { NextResponse } from "next/server";
import { cache } from "@/lib/security/cache";
import { normalizeMobile } from "@/lib/persian";

export async function GET(req: Request) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "غیرفعال در محیط تولید" }, { status: 404 });
  }
  const url = new URL(req.url);
  const mobile = normalizeMobile(url.searchParams.get("mobile") ?? "");
  if (!mobile) return NextResponse.json({ error: "mobile required" }, { status: 400 });
  const code = await cache.get<string>(`dev:otp:${mobile}`);
  if (!code) return NextResponse.json({ otp: null, message: "کدی برای این شماره ثبت نشده یا منقضی شده است." }, { status: 404 });
  // One-time retrieval: delete after read
  await cache.del(`dev:otp:${mobile}`);
  return NextResponse.json({ otp: code, mobile });
}
