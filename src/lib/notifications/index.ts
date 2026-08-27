// =====================================================================
// POSTYAR — Notifications
// ---------------------------------------------------------------------
// `notify` persists a Notification row. If user prefs allow email,
// calls `sendEmail` from `@/lib/providers/email`. If prefs allow SMS
// for non-critical, calls `dispatchGeneric`. Critical security
// notifications (category="security") ignore user prefs.
//
// `adminBroadcast` is admin-only and writes one Notification row per
// matching user.
// =====================================================================
import { db } from "@/lib/db";
import { audit } from "@/lib/server/auth";
import { safeJsonParse } from "@/lib/server/auth";
import { formatJalaliDateTime } from "@/lib/persian";

export type NotificationCategory =
  | "publish"
  | "payment"
  | "subscription"
  | "referral"
  | "ad"
  | "ticket"
  | "gold"
  | "woo"
  | "security"
  | "system";

export interface NotifyInput {
  userId: string;
  category: NotificationCategory;
  titleFa: string;
  bodyFa: string;
  link?: string | null;
  email?: { to: string; subjectFa?: string; htmlFa?: string } | null;
  sms?: { mobile: string } | null;
}

export interface NotifyResult {
  ok: boolean;
  notificationId: string;
  emailSent?: boolean;
  smsSent?: boolean;
  errorFa?: string;
}

interface UserNotifyPrefs {
  email?: boolean; // default true
  sms?: boolean; // default false (only security notifications by SMS)
  push?: boolean; // default true — in-app notification row always written
}

function defaultPrefs(category: NotificationCategory): UserNotifyPrefs {
  // Security alerts bypass prefs entirely (handled in `notify` itself).
  if (category === "security") return { email: true, sms: true, push: true };
  if (category === "ticket") return { email: true, sms: false, push: true };
  if (category === "payment" || category === "subscription") return { email: true, sms: false, push: true };
  return { email: true, sms: false, push: true };
}

export async function notify(input: NotifyInput): Promise<NotifyResult> {
  if (!input.userId) return { ok: false, notificationId: "", errorFa: "شناسه کاربر الزامی است." };
  if (!input.titleFa || !input.bodyFa) return { ok: false, notificationId: "", errorFa: "عنوان و متن اعلان الزامی است." };

  // Persist the notification row — always, regardless of prefs (so the
  // user can see security alerts even if push was disabled).
  const notif = await db.notification.create({
    data: {
      userId: input.userId,
      category: input.category,
      titleFa: input.titleFa.slice(0, 200),
      bodyFa: input.bodyFa.slice(0, 2000),
      link: input.link ?? null,
    },
  });

  // Look up the user's preferences from Profile.notifyPrefs (JSON).
  const profile = await db.profile.findUnique({ where: { userId: input.userId } });
  const prefs = safeJsonParse<UserNotifyPrefs>(profile?.notifyPrefs ?? "{}", {});
  const defaults = defaultPrefs(input.category);

  const emailEnabled = input.category === "security" ? true : prefs.email ?? defaults.email ?? true;
  const smsEnabled = input.category === "security" ? true : prefs.sms ?? defaults.sms ?? false;

  let emailSent = false;
  let smsSent = false;

  // Email
  if (emailEnabled && input.email?.to) {
    try {
      const { sendEmail } = await import("@/lib/providers/email");
      const r = await sendEmail({
        to: input.email.to,
        subjectFa: input.email.subjectFa ?? input.titleFa,
        htmlFa: input.email.htmlFa ?? `<div dir="rtl" style="font-family:Vazirmatn,sans-serif;line-height:1.7"><h3>${escapeHtml(input.titleFa)}</h3><p>${escapeHtml(input.bodyFa)}</p><p style="color:#888">${formatJalaliDateTime(notif.createdAt, { withTime: true })}</p>${input.link ? `<p><a href="${input.link}">${escapeHtml(input.link)}</a></p>` : ""}</div>`,
      });
      emailSent = r.ok;
    } catch {
      emailSent = false;
    }
  }

  // SMS (security only by default; otherwise must be enabled in prefs).
  if (smsEnabled && input.sms?.mobile) {
    try {
      const { dispatchGeneric } = await import("@/lib/providers/sms");
      const r = await dispatchGeneric(input.sms.mobile, `${input.titleFa}\n${input.bodyFa}`.slice(0, 480));
      smsSent = r.ok;
    } catch {
      smsSent = false;
    }
  }

  return { ok: true, notificationId: notif.id, emailSent, smsSent };
}

// ---------------------------------------------------------------------
// List / mark read
// ---------------------------------------------------------------------
export async function listUnread(userId: string, opts?: { limit?: number }): Promise<{
  items: Array<NotificationView>;
}> {
  const limit = Math.min(opts?.limit ?? 20, 100);
  const rows = await db.notification.findMany({
    where: { userId, readAt: null },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  return { items: rows.map(toView) };
}

export async function listAll(
  userId: string,
  opts?: { limit?: number; offset?: number; category?: string; unreadOnly?: boolean },
): Promise<{ items: NotificationView[]; total: number }> {
  const limit = Math.min(opts?.limit ?? 50, 100);
  const offset = opts?.offset ?? 0;
  const where = {
    userId,
    ...(opts?.category ? { category: opts.category } : {}),
    ...(opts?.unreadOnly ? { readAt: null } : {}),
  };
  const [rows, total] = await Promise.all([
    db.notification.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
    }),
    db.notification.count({ where }),
  ]);
  return { items: rows.map(toView), total };
}

export async function markRead(notificationId: string, userId: string): Promise<{ ok: boolean; errorFa?: string }> {
  // Ownership-enforced
  const notif = await db.notification.findUnique({ where: { id: notificationId } });
  if (!notif) return { ok: false, errorFa: "اعلان یافت نشد." };
  if (notif.userId !== userId) return { ok: false, errorFa: "دسترسی غیرمجاز." };
  if (notif.readAt) return { ok: true };
  await db.notification.update({
    where: { id: notificationId },
    data: { readAt: new Date() },
  });
  return { ok: true };
}

export async function markAllRead(userId: string): Promise<{ updated: number }> {
  const r = await db.notification.updateMany({
    where: { userId, readAt: null },
    data: { readAt: new Date() },
  });
  return { updated: r.count };
}

export async function getUnreadCount(userId: string): Promise<number> {
  return db.notification.count({ where: { userId, readAt: null } });
}

// ---------------------------------------------------------------------
// Admin broadcast
// ---------------------------------------------------------------------
export interface AdminBroadcastInput {
  filter: "all" | "plan:xxx" | "role:user";
  titleFa: string;
  bodyFa: string;
  link?: string | null;
  adminId: string;
}

export async function adminBroadcast(input: AdminBroadcastInput): Promise<{ sent: number }> {
  // Build the where clause based on filter
  let where: Record<string, unknown> = {};
  if (input.filter === "all") {
    where = { status: "active" };
  } else if (input.filter === "role:user") {
    where = { status: "active", role: "user" };
  } else if (input.filter.startsWith("plan:")) {
    const planCode = input.filter.slice(5);
    // Match users who have an active subscription to this plan code.
    const plan = await db.plan.findUnique({ where: { code: planCode } });
    if (!plan) return { sent: 0 };
    const subs = await db.subscription.findMany({
      where: { planId: plan.id, status: "active", endsAt: { gt: new Date() } },
      select: { userId: true },
    });
    const userIds = subs.map((s) => s.userId);
    if (userIds.length === 0) return { sent: 0 };
    where = { id: { in: userIds }, status: "active" };
  } else {
    return { sent: 0 };
  }

  const users = await db.user.findMany({
    where,
    select: { id: true },
    take: 10_000, // hard ceiling — for very large broadcasts, chunk later
  });
  if (users.length === 0) return { sent: 0 };

  // Create notifications in batches of 200 to avoid query-size limits.
  const batch = 200;
  for (let i = 0; i < users.length; i += batch) {
    const slice = users.slice(i, i + batch);
    await db.notification.createMany({
      data: slice.map((u) => ({
        userId: u.id,
        category: "system",
        titleFa: input.titleFa.slice(0, 200),
        bodyFa: input.bodyFa.slice(0, 2000),
        link: input.link ?? null,
      })),
    });
  }

  await audit({
    userId: input.adminId,
    actor: "admin",
    action: "broadcast_sent",
    targetType: "notification",
    meta: { filter: input.filter, recipients: users.length, titleFa: input.titleFa },
  });

  return { sent: users.length };
}

// ---------------------------------------------------------------------
// View shape
// ---------------------------------------------------------------------
export interface NotificationView {
  id: string;
  category: string;
  titleFa: string;
  bodyFa: string;
  link: string | null;
  readAt: string | null;
  createdAt: string;
  createdAtFa: string;
}

function toView(n: { id: string; category: string; titleFa: string; bodyFa: string; link: string | null; readAt: Date | null; createdAt: Date }): NotificationView {
  return {
    id: n.id,
    category: n.category,
    titleFa: n.titleFa,
    bodyFa: n.bodyFa,
    link: n.link,
    readAt: n.readAt?.toISOString() ?? null,
    createdAt: n.createdAt.toISOString(),
    createdAtFa: formatJalaliDateTime(n.createdAt, { withTime: true }),
  };
}

// ---------------------------------------------------------------------
// HTML escape helper for email body
// ---------------------------------------------------------------------
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
