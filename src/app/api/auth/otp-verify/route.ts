// POSTYAR OTP verify API. On login success, creates a session.
// On register, returns a verification token to complete account creation.
// On reset, returns a verification token to set a new password.
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { verifyOtp, createSession, clientIp, audit } from "@/lib/server/auth";
import { randomToken, hashToken } from "@/lib/security/crypto";

const Schema = z.object({
  mobile: z.string(),
  code: z.string(),
  purpose: z.enum(["login", "register", "reset"]).default("login"),
});

export async function POST(req: Request) {
  const ip = clientIp(req);
  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ errorFa: "بدنه درخواست نامعتبر است." }, { status: 400 });
  }
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ errorFa: parsed.error.issues[0]?.message ?? "ورودی نامعتبر است." }, { status: 400 });
  }
  const { mobile, code, purpose } = parsed.data;
  const r = await verifyOtp(mobile, code, purpose, ip);
  if (!r.ok) {
    return NextResponse.json({ errorFa: r.errorFa }, { status: 400 });
  }

  if (purpose === "login") {
    if (!r.userId) return NextResponse.json({ errorFa: "حساب کاربری یافت نشد. ابتدا ثبت‌نام کنید." }, { status: 404 });
    const user = await db.user.findUnique({ where: { id: r.userId } });
    if (!user) return NextResponse.json({ errorFa: "حساب کاربری یافت نشد." }, { status: 404 });
    if (user.status === "suspended") return NextResponse.json({ errorFa: "حساب شما معلق شده است." }, { status: 403 });
    await createSession(user.id, ip, req.headers.get("user-agent"));
    await audit({ userId: user.id, actor: "user", action: "login_otp", targetType: "user", targetId: user.id, ip });
    return NextResponse.json({ ok: true, purpose: "login", user: { id: user.id, firstName: user.firstName, role: user.role } });
  }

  // register/reset: issue short-lived verification token (5 minutes)
  const verifyToken = randomToken(32);
  // store hash in cache keyed by mobile+purpose
  const { cache } = await import("@/lib/security/cache");
  await cache.set(`verify:${purpose}:${mobile}`, hashToken(verifyToken), 5 * 60 * 1000);
  return NextResponse.json({ ok: true, purpose, verifyToken, mobile });
}
