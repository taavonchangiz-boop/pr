"use client";
// POSTYAR notification bell — polls /api/notifications/unread-count, shows a
// destructive unread badge, and opens a popover with the latest notifications.
// Clicking a notification navigates via the SPA hash-router (NOT a hard <a>
// reload) to the action link stored on the notification. Falls back to the
// notifications list view when the link is empty.
import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useSession } from "@/components/layout/session-provider";
import { toPersianDigits, formatRelative } from "@/lib/persian";
import { cn } from "@/lib/utils";

type Notif = {
  id: string;
  titleFa: string;
  bodyFa?: string | null;
  link?: string | null;
  readAt?: string | null;
  createdAt: string;
  category?: string | null;
};

/** Hash-route navigate helper (mirrors postyar-app's navigate). Accepts both
 *  "/dashboard/foo" and "dashboard/foo" forms + "#/dashboard/foo". When the
 *  link is missing/empty, falls back to the notifications list view. */
function navToAction(link: string | null | undefined) {
  const target = (link ?? "").trim();
  if (!target) {
    window.location.hash = "/dashboard/notifications";
    return;
  }
  // strip leading "#"
  const clean = target.replace(/^#/, "");
  // strip leading slash — window.location.hash expects a path WITHOUT leading /
  window.location.hash = clean.startsWith("/") ? clean : `/${clean}`;
}

export function NotificationBell({ className }: { className?: string }) {
  const { user } = useSession();
  const [unread, setUnread] = useState(0);
  const [items, setItems] = useState<Notif[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!user) return;
    let active = true;
    const tick = async () => {
      try {
        const r = await fetch("/api/notifications/unread-count", { credentials: "same-origin" });
        if (r.ok) {
          const d = await r.json().catch(() => ({}));
          if (active) setUnread(Number(d?.count ?? 0));
        }
      } catch {
        /* best-effort */
      }
    };
    void tick();
    const iv = setInterval(tick, 30000);
    return () => {
      active = false;
      clearInterval(iv);
    };
  }, [user]);

  async function loadItems() {
    try {
      const r = await fetch("/api/notifications?limit=10&offset=0", { credentials: "same-origin" });
      if (r.ok) {
        const d = await r.json().catch(() => null);
        const list: Notif[] = Array.isArray(d) ? d : Array.isArray(d?.items) ? d.items : [];
        setItems(list);
      }
    } catch {
      /* best-effort */
    }
  }

  useEffect(() => {
    if (open) void loadItems();
  }, [open]);

  // Mark a notification as read when clicked (best-effort — no error toast on failure).
  async function markRead(id: string) {
    try {
      await fetch("/api/notifications", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notificationId: id }),
      });
      // Optimistically decrement the badge so the user gets instant feedback.
      setUnread((u) => Math.max(0, u - 1));
    } catch {
      /* silent */
    }
  }

  function onClick(n: Notif, e: React.MouseEvent) {
    e.preventDefault();
    void markRead(n.id);
    // Optimistically mark read in the local list too.
    setItems((cur) => cur.map((it) => (it.id === n.id ? { ...it, readAt: it.readAt ?? new Date().toISOString() } : it)));
    setOpen(false);
    navToAction(n.link);
  }

  if (!user) return null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "relative inline-flex size-9 items-center justify-center rounded-md text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer",
            className,
          )}
          aria-label={`اعلان‌ها${unread > 0 ? `، ${toPersianDigits(unread)} خوانده‌نشده` : ""}`}
        >
          <Bell className="size-5" />
          {unread > 0 && (
            <span className="absolute -right-0.5 -top-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold leading-none text-destructive-foreground">
              {toPersianDigits(unread > 99 ? "۹۹+" : unread)}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0" dir="rtl">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <span className="text-sm font-semibold">اعلان‌ها</span>
          <span className="text-xs text-muted-foreground">{toPersianDigits(items.length)} مورد اخیر</span>
        </div>
        <div className="max-h-80 overflow-y-auto scrollbar-thin">
          {items.length === 0 ? (
            <div className="px-6 py-8 text-center text-xs text-muted-foreground">
              اعلان جدیدی وجود ندارد.
            </div>
          ) : (
            items.map((n) => (
              <button
                key={n.id}
                type="button"
                onClick={(e) => onClick(n, e)}
                className="block w-full cursor-pointer border-b px-3 py-2 text-right transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
              >
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      "size-1.5 shrink-0 rounded-full",
                      n.readAt ? "bg-muted-foreground/40" : "bg-primary",
                    )}
                  />
                  <span className="text-[11px] text-muted-foreground">{formatRelative(n.createdAt)}</span>
                  {n.category && (
                    <span className="rounded bg-muted px-1.5 text-[10px] text-muted-foreground">{n.category}</span>
                  )}
                </div>
                <div className="mt-1 text-sm font-medium">{n.titleFa}</div>
                {n.bodyFa && (
                  <div className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{n.bodyFa}</div>
                )}
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export default NotificationBell;
