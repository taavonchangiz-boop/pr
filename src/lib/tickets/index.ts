// =====================================================================
// POSTYAR — Tickets
// ---------------------------------------------------------------------
// Support tickets with replies. Owners reply; staff can reply to any;
// only owner/staff can close; only admins can assign.
// All ops are audited.
// =====================================================================
import { db } from "@/lib/db";
import { audit, AuthError } from "@/lib/server/auth";
import { formatJalaliDateTime } from "@/lib/persian";
import { notify } from "@/lib/notifications";

export type TicketCategory = "general" | "billing" | "technical" | "ai" | "gold" | "woo" | "bot" | "security";
export type TicketStatus = "open" | "answered" | "closed";
export type TicketPriority = "low" | "normal" | "high";

const CATEGORY_FA: Record<TicketCategory, string> = {
  general: "عمومی",
  billing: "مالی",
  technical: "فنی",
  ai: "هوش مصنوعی",
  gold: "طلا",
  woo: "ووکامرس",
  bot: "ربات",
  security: "امنیتی",
};

const PRIORITY_FA: Record<TicketPriority, string> = {
  low: "کم",
  normal: "عادی",
  high: "زیاد",
};

export function categoryFa(c: string): string {
  return CATEGORY_FA[c as TicketCategory] ?? c;
}
export function priorityFa(p: string): string {
  return PRIORITY_FA[p as TicketPriority] ?? p;
}

// ---------------------------------------------------------------------
// Public views
// ---------------------------------------------------------------------
export interface TicketView {
  id: string;
  subject: string;
  category: string;
  categoryFa: string;
  status: string;
  priority: string;
  priorityFa: string;
  ownerId: string;
  ownerNameFa: string;
  assignedToId: string | null;
  assignedToNameFa: string | null;
  createdAt: string;
  createdAtFa: string;
  updatedAt: string;
  updatedAtFa: string;
  replyCount: number;
}

export interface TicketReplyView {
  id: string;
  body: string;
  isStaff: boolean;
  authorNameFa: string;
  createdAt: string;
  createdAtFa: string;
}

// ---------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------
export async function createTicket(input: {
  userId: string;
  subject: string;
  category?: TicketCategory;
  priority?: TicketPriority;
  body: string;
  ip?: string;
}): Promise<{ ok: boolean; ticket?: TicketView; errorFa?: string }> {
  const subject = (input.subject ?? "").trim();
  const body = (input.body ?? "").trim();
  if (subject.length < 3) return { ok: false, errorFa: "موضوع تیکت حداقل باید ۳ نویسه باشد." };
  if (body.length < 3) return { ok: false, errorFa: "متن تیکت حداقل باید ۳ نویسه باشد." };

  const ticket = await db.ticket.create({
    data: {
      userId: input.userId,
      subject: subject.slice(0, 200),
      category: input.category ?? "general",
      priority: input.priority ?? "normal",
      status: "open",
      replies: {
        create: {
          userId: input.userId,
          body: body.slice(0, 8000),
          isStaff: false,
        },
      },
    },
    include: {
      user: { select: { id: true, firstName: true, lastName: true, businessName: true } },
      assignedTo: { select: { id: true, firstName: true, lastName: true } },
      replies: true,
    },
  });

  await audit({
    userId: input.userId,
    actor: "user",
    action: "ticket_created",
    targetType: "ticket",
    targetId: ticket.id,
    ip: input.ip,
    meta: { category: ticket.category, priority: ticket.priority },
  });

  return { ok: true, ticket: toView(ticket) };
}

// ---------------------------------------------------------------------
// Reply
// ---------------------------------------------------------------------
export async function replyTicket(input: {
  ticketId: string;
  userId: string;
  body: string;
  isStaff?: boolean;
  ip?: string;
}): Promise<{ ok: boolean; reply?: TicketReplyView; errorFa?: string }> {
  const body = (input.body ?? "").trim();
  if (body.length < 2) return { ok: false, errorFa: "متن پاسخ حداقل باید ۲ نویسه باشد." };

  const ticket = await db.ticket.findUnique({
    where: { id: input.ticketId },
    include: { user: { select: { id: true, email: true, mobile: true, firstName: true, lastName: true } } },
  });
  if (!ticket) return { ok: false, errorFa: "تیکت یافت نشد." };

  // Ownership enforcement: owner OR staff (role support/admin) can reply.
  if (input.isStaff !== true && ticket.userId !== input.userId) {
    return { ok: false, errorFa: "دسترسی غیرمجاز." };
  }
  if (ticket.status === "closed") {
    return { ok: false, errorFa: "تیکت بسته شده است." };
  }

  const reply = await db.ticketReply.create({
    data: {
      ticketId: input.ticketId,
      userId: input.userId,
      body: body.slice(0, 8000),
      isStaff: input.isStaff === true,
    },
    include: { user: { select: { firstName: true, lastName: true, role: true } } },
  });

  // Update ticket status
  const newStatus: TicketStatus = input.isStaff ? "answered" : "open";
  await db.ticket.update({
    where: { id: input.ticketId },
    data: { status: newStatus },
  });

  await audit({
    userId: input.userId,
    actor: input.isStaff ? "support" : "user",
    action: "ticket_reply",
    targetType: "ticket",
    targetId: input.ticketId,
    ip: input.ip,
    meta: { isStaff: input.isStaff === true },
  });

  // Notify the OTHER party
  const recipientId = input.isStaff ? ticket.userId : (ticket.assignedToId ?? null);
  if (recipientId && recipientId !== input.userId) {
    await notify({
      userId: recipientId,
      category: "ticket",
      titleFa: `پاسخ تیکت: ${ticket.subject}`,
      bodyFa: `یک پاسخ جدید روی تیکت «${ticket.subject}» ثبت شد.`,
      link: null,
      email: ticket.user?.email ? { to: ticket.user.email } : null,
    });
  }

  return {
    ok: true,
    reply: {
      id: reply.id,
      body: reply.body,
      isStaff: reply.isStaff,
      authorNameFa: userFullName(reply.user),
      createdAt: reply.createdAt.toISOString(),
      createdAtFa: formatJalaliDateTime(reply.createdAt, { withTime: true }),
    },
  };
}

// ---------------------------------------------------------------------
// Close (owner or staff)
// ---------------------------------------------------------------------
export async function closeTicket(input: {
  ticketId: string;
  userId: string;
  isStaff?: boolean;
  ip?: string;
}): Promise<{ ok: boolean; errorFa?: string }> {
  const ticket = await db.ticket.findUnique({ where: { id: input.ticketId } });
  if (!ticket) return { ok: false, errorFa: "تیکت یافت نشد." };
  if (input.isStaff !== true && ticket.userId !== input.userId) {
    return { ok: false, errorFa: "دسترسی غیرمجاز." };
  }
  if (ticket.status === "closed") return { ok: true };
  await db.ticket.update({
    where: { id: input.ticketId },
    data: { status: "closed" },
  });
  await audit({
    userId: input.userId,
    actor: input.isStaff ? "support" : "user",
    action: "ticket_closed",
    targetType: "ticket",
    targetId: input.ticketId,
    ip: input.ip,
  });
  return { ok: true };
}

// ---------------------------------------------------------------------
// Assign (admin only)
// ---------------------------------------------------------------------
export async function assignTicket(input: {
  ticketId: string;
  supportUserId: string;
  adminId: string;
  ip?: string;
}): Promise<{ ok: boolean; errorFa?: string }> {
  const ticket = await db.ticket.findUnique({ where: { id: input.ticketId } });
  if (!ticket) return { ok: false, errorFa: "تیکت یافت نشد." };
  const supporter = await db.user.findUnique({ where: { id: input.supportUserId } });
  if (!supporter) return { ok: false, errorFa: "کاربر پشتیبان یافت نشد." };
  if (supporter.role !== "support" && supporter.role !== "admin") {
    return { ok: false, errorFa: "فقط کاربران پشتیبان یا مدیر قابل اختصاص هستند." };
  }
  await db.ticket.update({
    where: { id: input.ticketId },
    data: { assignedToId: input.supportUserId },
  });
  await audit({
    userId: input.adminId,
    actor: "admin",
    action: "ticket_assigned",
    targetType: "ticket",
    targetId: input.ticketId,
    ip: input.ip,
    meta: { supportUserId: input.supportUserId },
  });
  // Notify the supporter
  await notify({
    userId: input.supportUserId,
    category: "ticket",
    titleFa: "تیکت جدید به شما اختصاص یافت",
    bodyFa: `تیکت «${ticket.subject}» به شما اختصاص یافت.`,
    link: null,
  });
  return { ok: true };
}

// ---------------------------------------------------------------------
// Listing
// ---------------------------------------------------------------------
export async function listMyTickets(
  userId: string,
  opts?: { limit?: number; offset?: number; status?: string },
): Promise<{ items: TicketView[]; total: number }> {
  const limit = Math.min(opts?.limit ?? 50, 100);
  const offset = opts?.offset ?? 0;
  const where = {
    userId,
    ...(opts?.status ? { status: opts.status } : {}),
  };
  const [rows, total] = await Promise.all([
    db.ticket.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      take: limit,
      skip: offset,
      include: {
        user: { select: { id: true, firstName: true, lastName: true, businessName: true } },
        assignedTo: { select: { id: true, firstName: true, lastName: true } },
        replies: { select: { id: true } },
      },
    }),
    db.ticket.count({ where }),
  ]);
  return { items: rows.map(toView), total };
}

export async function listAllTicketsForAdmin(
  opts?: { limit?: number; offset?: number; status?: string; assignedToId?: string | null },
): Promise<{ items: TicketView[]; total: number }> {
  const limit = Math.min(opts?.limit ?? 50, 200);
  const offset = opts?.offset ?? 0;
  const where: Record<string, unknown> = {};
  if (opts?.status) where.status = opts.status;
  if (opts?.assignedToId !== undefined) where.assignedToId = opts.assignedToId;
  const [rows, total] = await Promise.all([
    db.ticket.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      take: limit,
      skip: offset,
      include: {
        user: { select: { id: true, firstName: true, lastName: true, businessName: true } },
        assignedTo: { select: { id: true, firstName: true, lastName: true } },
        replies: { select: { id: true } },
      },
    }),
    db.ticket.count({ where }),
  ]);
  return { items: rows.map(toView), total };
}

export async function getTicket(
  ticketId: string,
  userId: string,
  isStaff: boolean,
): Promise<{ ok: boolean; ticket?: TicketView; replies?: TicketReplyView[]; errorFa?: string }> {
  const ticket = await db.ticket.findUnique({
    where: { id: ticketId },
    include: {
      user: { select: { id: true, firstName: true, lastName: true, businessName: true } },
      assignedTo: { select: { id: true, firstName: true, lastName: true } },
      replies: {
        orderBy: { createdAt: "asc" },
        include: { user: { select: { firstName: true, lastName: true, role: true } } },
      },
    },
  });
  if (!ticket) return { ok: false, errorFa: "تیکت یافت نشد." };
  if (!isStaff && ticket.userId !== userId) return { ok: false, errorFa: "دسترسی غیرمجاز." };
  return {
    ok: true,
    ticket: toView(ticket),
    replies: ticket.replies.map((r) => ({
      id: r.id,
      body: r.body,
      isStaff: r.isStaff,
      authorNameFa: userFullName(r.user),
      createdAt: r.createdAt.toISOString(),
      createdAtFa: formatJalaliDateTime(r.createdAt, { withTime: true }),
    })),
  };
}

// ---------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------
function userFullName(u?: { firstName: string; lastName: string; businessName?: string } | null): string {
  if (!u) return "ناشناخته";
  const full = `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim();
  if (full) return full;
  return u.businessName || "ناشناخته";
}

function toView(t: {
  id: string;
  subject: string;
  category: string;
  status: string;
  priority: string;
  userId: string;
  user?: { id: string; firstName: string; lastName: string; businessName?: string } | null;
  assignedToId: string | null;
  assignedTo?: { id: string; firstName: string; lastName: string } | null;
  createdAt: Date;
  updatedAt: Date;
  replies?: Array<{ id: string }> | Array<unknown>;
}): TicketView {
  const replyCount = Array.isArray(t.replies) ? t.replies.length : 0;
  return {
    id: t.id,
    subject: t.subject,
    category: t.category,
    categoryFa: categoryFa(t.category),
    status: t.status,
    priority: t.priority,
    priorityFa: priorityFa(t.priority),
    ownerId: t.userId,
    ownerNameFa: userFullName(t.user ?? null),
    assignedToId: t.assignedToId,
    assignedToNameFa: t.assignedTo ? userFullName(t.assignedTo) : null,
    createdAt: t.createdAt.toISOString(),
    createdAtFa: formatJalaliDateTime(t.createdAt, { withTime: true }),
    updatedAt: t.updatedAt.toISOString(),
    updatedAtFa: formatJalaliDateTime(t.updatedAt, { withTime: true }),
    replyCount,
  };
}

export { AuthError };
