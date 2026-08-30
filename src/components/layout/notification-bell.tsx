"use client";
// POSTYAR notification bell — polls /api/notifications/unread-count, shows a
// destructive unread badge, and opens a popover with the latest notifications.
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

  if (!user) return null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "relative inline-flex size-9 items-center justify-center rounded-md text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
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
              <a
                key={n.id}
                href={n.link ?? "#"}
                className="block border-b px-3 py-2 transition-colors hover:bg-muted/60"
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
              </a>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export default NotificationBell;
