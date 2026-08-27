// POSTYAR — /api/bots/[id]/workflows
// POST: create a workflow, GET: list workflows for a bot.
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  requireUser,
  clientIp,
  audit,
  AuthError,
  safeJsonParse,
} from "@/lib/server/auth";
import { validateWorkflowDef } from "@/lib/bots/workflow";

const CreateSchema = z.object({
  name: z.string().min(2, "نام گردالشکار حداقل ۲ نویسه باشد.").max(120),
  enabled: z.boolean().optional(),
  steps: z.array(z.unknown()),
  triggerKind: z.enum(["message", "command", "callback"]).optional(),
  triggerValue: z.string().max(200).nullable().optional(),
});

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  let user;
  try { user = await requireUser(); } catch (e) {
    return NextResponse.json({ errorFa: (e as AuthError).message }, { status: (e as AuthError).status });
  }
  const { id } = await params;
  const bot = await db.bot.findFirst({ where: { id, ownerId: user.id }, select: { id: true } });
  if (!bot) {
    return NextResponse.json({ errorFa: "ربات یافت نشد." }, { status: 404 });
  }
  const rows = await db.botWorkflow.findMany({
    where: { botId: id },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  const items = rows.map((r) => ({
    id: r.id,
    name: r.name,
    enabled: r.enabled,
    steps: safeJsonParse<unknown>(r.steps, []),
    triggerKind: r.triggerKind,
    triggerValue: r.triggerValue,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  }));
  return NextResponse.json({ items });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  let user;
  try { user = await requireUser(); } catch (e) {
    return NextResponse.json({ errorFa: (e as AuthError).message }, { status: (e as AuthError).status });
  }
  const ip = clientIp(req);
  const { id } = await params;
  const bot = await db.bot.findFirst({ where: { id, ownerId: user.id }, select: { id: true, provider: true, name: true } });
  if (!bot) {
    return NextResponse.json({ errorFa: "ربات یافت نشد." }, { status: 404 });
  }
  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ errorFa: "بدنه درخواست نامعتبر است." }, { status: 400 });
  }
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { errorFa: parsed.error.issues[0]?.message ?? "ورودی نامعتبر است." },
      { status: 400 },
    );
  }
  const wfValidation = validateWorkflowDef(parsed.data.steps);
  if (!wfValidation.ok || !wfValidation.def) {
    return NextResponse.json(
      { errorFa: wfValidation.errorFa ?? "تعریف گردالشکار نامعتبر است." },
      { status: 400 },
    );
  }
  const created = await db.botWorkflow.create({
    data: {
      botId: id,
      name: parsed.data.name,
      enabled: parsed.data.enabled ?? true,
      steps: JSON.stringify(wfValidation.def.steps),
      triggerKind: parsed.data.triggerKind ?? "message",
      triggerValue: parsed.data.triggerValue ?? null,
    },
    select: {
      id: true,
      name: true,
      enabled: true,
      triggerKind: true,
      triggerValue: true,
      createdAt: true,
    },
  });
  await audit({
    userId: user.id,
    actor: "user",
    action: "bot_workflow_created",
    targetType: "bot_workflow",
    targetId: created.id,
    ip,
    meta: { botId: id, name: parsed.data.name },
  });
  return NextResponse.json({ ok: true, workflow: created }, { status: 201 });
}
