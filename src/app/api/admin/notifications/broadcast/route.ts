// POSTYAR — POST /api/admin/notifications/broadcast (admin only)
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole, clientIp, AuthError } from "@/lib/server/auth";
import { adminBroadcast } from "@/lib/notifications";

const Schema = z.object({
  filter: z.enum(["all", "role:user"]).or(z.string().regex(/^plan:.+$/, "فیلتر باید all، role:user یا plan:code باشد.")),
  titleFa: z.string().min(1, "عنوان الزامی است.").max(200),
  bodyFa: z.string().min(1, "متن الزامی است.").max(2000),
  link: z.string().url("لینک نامعتبر است.").optional().or(z.literal("")),
});

export async function POST(req: Request) {
  let user;
  try { user = await requireRole(["admin"]); } catch (e) {
    return NextResponse.json({ errorFa: (e as AuthError).message }, { status: (e as AuthError).status });
  }
  const ip = clientIp(req);
  void ip;
  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ errorFa: "بدنه درخواست نامعتبر است." }, { status: 400 });
  }
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { errorFa: parsed.error.issues[0]?.message ?? "ورودی نامعتبر است." },
      { status: 400 },
    );
  }
  const r = await adminBroadcast({
    filter: parsed.data.filter as "all" | "plan:xxx" | "role:user",
    titleFa: parsed.data.titleFa,
    bodyFa: parsed.data.bodyFa,
    link: parsed.data.link || null,
    adminId: user.id,
  });
  return NextResponse.json({ ok: true, sent: r.sent });
}
