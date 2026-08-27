"use client";
// =====================================================================
// POSTYAR — Notifications View
// ---------------------------------------------------------------------
// Paginated list of notifications. Each: icon per category, title, body,
// Jalali relative time, unread indicator, link. «علامت‌گذاری همه به‌عنوان
// خوانده‌شده» button.
// =====================================================================
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  BellIcon,
  CheckCheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  Loader2Icon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { api, type NotificationView } from "@/components/postyar/api";
import { formatRelative, toPersianDigits } from "@/lib/persian";

const PAGE_SIZE = 20;

const CATEGORY_META: Record<
  string,
  { label: string; icon: React.ComponentType<{ className?: string }> }
> = {
  publish: { label: "انتشار", icon: BellIcon },
  payment: { label: "مالی", icon: BellIcon },
  subscription: { label: "اشتراک", icon: BellIcon },
  referral: { label: "معرفی", icon: BellIcon },
  ad: { label: "تبلیغ", icon: BellIcon },
  ticket: { label: "تیکت", icon: BellIcon },
  gold: { label: "طلا", icon: BellIcon },
  woo: { label: "ووکامرس", icon: BellIcon },
  security: { label: "امنتی", icon: BellIcon },
  system: { label: "سیستم", icon: BellIcon },
};

function categoryMeta(category: string) {
  return CATEGORY_META[category] ?? { label: category, icon: BellIcon };
}

export interface NotificationsViewProps {
  navigate: (to: string) => void;
}

export function NotificationsView({ navigate }: NotificationsViewProps) {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);

  const q = useQuery({
    queryKey: ["notifications", "list", page],
    queryFn: () => api.getNotifications(page, PAGE_SIZE),
    staleTime: 5_000,
  });

  const markOne = useMutation({
    mutationFn: (id: string) => api.markRead(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notifications"] });
      qc.invalidateQueries({ queryKey: ["notifications", "unread"] });
    },
  });

  const markAll = useMutation({
    mutationFn: () => api.markAllNotificationsRead(),
    onSuccess: (data) => {
      toast.success(`${toPersianDigits(data.updated)} اعلان به‌عنوان خوانده‌شده علامت‌گذاری شد.`);
      qc.invalidateQueries({ queryKey: ["notifications"] });
      qc.invalidateQueries({ queryKey: ["notifications", "unread"] });
    },
    onError: () => toast.error("عملیات ناموفق بود."),
  });

  const items = q.data?.items ?? [];
  const total = q.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function onMarkOne(n: NotificationView) {
    if (n.readAt) return;
    markOne.mutate(n.id);
  }

  function onClick(n: NotificationView) {
    onMarkOne(n);
    if (n.link) {
      // External or hash-route link
      if (n.link.startsWith("#")) {
        navigate(n.link.slice(1));
      } else if (n.link.startsWith("/")) {
        navigate(n.link);
      } else {
        // Hash-route form like /dashboard/foo
        navigate(n.link);
      }
    }
  }

  return (
    <div className="flex flex-col gap-4" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <BellIcon className="size-6" />
            اعلان‌ها
          </h1>
          <p className="text-sm text-muted-foreground">
            مجموع: {toPersianDigits(total)} اعلان — صفحهٔ {toPersianDigits(page)} از {toPersianDigits(totalPages)}.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => markAll.mutate()}
          disabled={markAll.isPending}
        >
          {markAll.isPending ? <Loader2Icon className="size-4 animate-spin" /> : <CheckCheckIcon className="size-4" />}
          علامت‌گذاری همه به‌عنوان خوانده‌شده
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">آخرین اعلان‌ها</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {q.isLoading && (
            <div className="flex flex-col gap-2 p-3">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          )}
          {q.error && (
            <div className="p-4 text-sm text-destructive">بارگذاری اعلان‌ها ناموفق بود.</div>
          )}
          {!q.isLoading && items.length === 0 && (
            <div className="flex flex-col items-center gap-2 py-10 text-center text-sm text-muted-foreground">
              <BellIcon className="size-8 opacity-50" />
              <div>هیچ اعلانی موجود نیست.</div>
            </div>
          )}
          {items.length > 0 && (
            <ul className="divide-y">
              {items.map((n) => {
                const meta = categoryMeta(n.category);
                const Icon = meta.icon;
                return (
                  <li key={n.id}>
                    <button
                      onClick={() => onClick(n)}
                      className={cn(
                        "flex w-full items-start gap-3 p-3 text-right transition-colors",
                        n.readAt ? "hover:bg-muted/30" : "bg-primary/5 hover:bg-primary/10",
                      )}
                    >
                      <div className={cn(
                        "mt-0.5 rounded-md p-2",
                        n.readAt ? "bg-muted text-muted-foreground" : "bg-primary/15 text-primary",
                      )}>
                        <Icon className="size-4" />
                      </div>
                      <div className="flex flex-1 flex-col gap-1">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{n.titleFa}</span>
                            <Badge variant="outline" className="text-[10px]">{meta.label}</Badge>
                            {!n.readAt && (
                              <span className="size-2 rounded-full bg-primary" aria-label="خوانده‌نشده" />
                            )}
                          </div>
                          <span className="text-xs text-muted-foreground">
                            {formatRelative(n.createdAt)}
                          </span>
                        </div>
                        <p className="line-clamp-2 text-sm text-muted-foreground">{n.bodyFa}</p>
                        {n.link && (
                          <span className="text-xs text-primary">مشاهده</span>
                        )}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {totalPages > 1 && (
            <div className="flex items-center justify-between gap-2 border-t p-3">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
              >
                <ChevronRightIcon className="size-4" />
                قبلی
              </Button>
              <span className="text-xs text-muted-foreground">
                {toPersianDigits(page)} / {toPersianDigits(totalPages)}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
              >
                بعدی
                <ChevronLeftIcon className="size-4" />
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default NotificationsView;
