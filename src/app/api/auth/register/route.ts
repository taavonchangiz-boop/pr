// POSTYAR registration API — all 7 fields required.
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { hashPassword, newReferralCode, clientIp, audit, createSession } from "@/lib/server/auth";
import { isValidEmail, isValidIranMobile, normalizeMobile } from "@/lib/persian";
import { rateLimit } from "@/lib/security/cache";

const Schema = z.object({
  firstName: z.string().min(2, "نام باید حداقل ۲ نویسه باشد.").max(60),
  lastName: z.string().min(2, "نام خانوادگی باید حداقل ۲ نویسه باشد.").max(80),
  email: z.string().email("ایمیل نامعتبر است."),
  mobile: z.string(),
  password: z.string().min(8, "رمز عبور باید حداقل ۸ نویسه باشد.").max(128),
  activityType: z.enum(["personal", "business", "marketer", "service", "media", "other"]),
  businessName: z.string().max(120).optional().default(""),
  referralCode: z.string().max(12).optional(),
});

export async function POST(req: Request) {
  const ip = clientIp(req);
  const rl = await rateLimit({ key: `register:${ip}`, limit: 5, windowMs: 60 * 60 * 1000 });
  if (!rl.ok) {
    return NextResponse.json({ errorFa: "تعداد تلاش‌ها بیش از حد مجاز بود. یک ساعت بعد امتحان کنید." }, { status: 429 });
  }
  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ errorFa: "بدنه درخواست نامعتبر است." }, { status: 400 });
  }
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ errorFa: parsed.error.issues[0]?.message ?? "ورودی نامعتبر است." }, { status: 400 });
  }
  const { firstName, lastName, email, mobile, password, activityType, businessName, referralCode } = parsed.data;
  const normMobile = normalizeMobile(mobile);
  if (!isValidIranMobile(normMobile)) {
    return NextResponse.json({ errorFa: "شماره موبایل ایرانی وارد کنید (۰۹XXXXXXXXX)." }, { status: 400 });
  }
  if (!isValidEmail(email)) {
    return NextResponse.json({ errorFa: "ایمیل نامعتبر است." }, { status: 400 });
  }
  const dupEmail = await db.user.findUnique({ where: { email: email.toLowerCase() }, select: { id: true } });
  if (dupEmail) return NextResponse.json({ errorFa: "این ایمیل قبلاً ثبت شده است." }, { status: 409 });
  const dupMobile = await db.user.findUnique({ where: { mobile: normMobile }, select: { id: true } });
  if (dupMobile) return NextResponse.json({ errorFa: "این موبایل قبلاً ثبت شده است." }, { status: 409 });

  let referredById: string | undefined;
  if (referralCode) {
    const ref = await db.user.findUnique({ where: { referralCode: referralCode.toUpperCase() }, select: { id: true } });
    if (!ref) return NextResponse.json({ errorFa: "کد معرف نامعتبر است." }, { status: 400 });
    if (ref.id !== referredById) referredById = ref.id;
  }

  const passwordHash = await hashPassword(password);
  const code = await newReferralCode();
  // FIRST-ADMIN RULE: the very first user to register is promoted to admin.
  // Every subsequent registrant is created as a regular user ("user").
  // This guarantees a single, deterministic bootstrap admin with no manual DB edit.
  const userCount = await db.user.count();
  const role = userCount === 0 ? "admin" : "user";
  const user = await db.user.create({
    data: {
      firstName, lastName,
      email: email.toLowerCase(),
      mobile: normMobile,
      passwordHash,
      activityType,
      businessName,
      referralCode: code,
      referredById: referredById ?? null,
      role,
    },
  });
  await db.profile.create({ data: { userId: user.id } });

  await audit({ actor: "user", action: userCount === 0 ? "register_first_admin" : "register", targetType: "user", targetId: user.id, ip, meta: { email, mobile: normMobile, role } });
  // Create a session so the freshly-registered user is immediately logged in.
  await createSession(user.id, ip, req.headers.get("user-agent"));
  return NextResponse.json({ ok: true, userId: user.id, user: { id: user.id, firstName, role: user.role } });
}
