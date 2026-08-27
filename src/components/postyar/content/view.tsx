"use client";
// =====================================================================
// POSTYAR — Content Manager View
// ---------------------------------------------------------------------
// Tabs: پیش‌نویس‌ها / زمان‌بندی‌شده / منتشرشده / ناموفق
// Toolbar: «محتوای جدید» (opens the editor)
// Paginated table: عنوان، وضعیت، زمان انتشار، مقصد، عملیات
// Row actions: ویرایش، حذف (soft), انتشار
// Persian empty states. Latin digits forbidden (toPersianDigits).
// =====================================================================
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlertCircleIcon,
  FilePlus2Icon,
  PencilIcon,
  RocketIcon,
  SendIcon,
  Trash2Icon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  api,
  type ContentRow,
  type DestinationRow,
} from "@/components/postyar/api";
import {
  formatJalaliDateTime,
  toPersianDigits,
} from "@/lib/persian";
import { cn } from "@/lib/utils";

export interface ContentManagerViewProps {
  navigate: (to: string) => void;
}

type StatusTab = "draft" | "scheduled" | "delivered" | "failed";

const TAB_DEFS: Array<{ key: StatusTab; label: string; statuses: string[] }> = [
  { key: "draft", label: "پیش‌نویس‌ها", statuses: ["draft"] },
  { key: "scheduled", label: "زمان‌بندی‌شده", statuses: ["scheduled", "queued", "processing"] },
  { key: "delivered", label: "منتشرشده", statuses: ["delivered"] },
  { key: "failed", label: "ناموفق", statuses: ["failed", "cancelled"] },
];

function statusBadge(status: string) {
  switch (status) {
    case "draft":
      return <Badge variant="secondary">پیش‌نویس</Badge>;
    case "scheduled":
      return <Badge className="bg-accent text-accent-foreground">زمان‌بندی‌شده</Badge>;
    case "queued":
      return <Badge variant="outline">در صف</Badge>;
    case "processing":
      return <Badge variant="outline">در حال پردازش</Badge>;
    case "delivered":
      return <Badge variant="default">منتشرشده</Badge>;
    case "failed":
      return <Badge variant="destructive">ناموفق</Badge>;
    case "cancelled":
      return <Badge variant="secondary">لغوشده</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

function destinationCell(content: ContentRow, destsById: Map<string, DestinationRow>): React.ReactNode {
  if (!content.destinationIds.length) {
    return <span className="text-muted-foreground text-xs">—</span>;
  }
  const labels: string[] = [];
  for (const id of content.destinationIds.slice(0, 2)) {
    const d = destsById.get(id);
    if (d) labels.push(d.label);
  }
  const more = content.destinationIds.length - labels.length;
  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap gap-1">
        {labels.map((l, i) => (
          <Badge key={i} variant="outline" className="font-normal">
            {l}
          </Badge>
        ))}
        {more > 0 && (
          <Badge variant="outline" className="font-normal">
            +{toPersianDigits(more)}
          </Badge>
        )}
      </div>
    </div>
  );
}

function publishTime(content: ContentRow): React.ReactNode {
  if (content.publishedAt) {
    return (
      <div className="flex flex-col">
        <span className="text-xs">{formatJalaliDateTime(content.publishedAt, { withTime: true })}</span>
        <span className="text-[0.65rem] text-muted-foreground">زمان انتشار</span>
      </div>
    );
  }
  if (content.scheduledAt) {
    return (
      <div className="flex flex-col">
        <span className="text-xs">{formatJalaliDateTime(content.scheduledAt, { withTime: true })}</span>
        <span className="text-[0.65rem] text-muted-foreground">زمان‌بندی</span>
      </div>
    );
  }
  return <span className="text-muted-foreground text-xs">—</span>;
}

function EmptyState({ tab }: { tab: StatusTab }) {
  const messages: Record<StatusTab, { title: string; desc: string }> = {
    draft: {
      title: "هیچ پیش‌نویسی موجود نیست",
      desc: "برای شروع، روی «محتوای جدید» بزنید و نخستین محتوای خود را بسازید.",
    },
    scheduled: {
      title: "هیچ محتوای زمان‌بندی‌شده‌ای موجود نیست",
      desc: "پس از ساخت پیش‌نویس، می‌توانید آن را برای انتشار در آینده برنامه‌ریزی کنید.",
    },
    delivered: {
      title: "هنوز محتوایی منتشر نشده است",
      desc: "محتواهای منتشرشده پس از موفقیت‌آمیز بودن ارسال، اینجا نمایش داده می‌شوند.",
    },
    failed: {
      title: "هیچ محتوای ناموفقی موجود نیست",
      desc: "اگر ارسال محتوا شکست بخورد، اینجا نمایش داده می‌شود تا مجدداً تلاش کنید.",
    },
  };
  const m = messages[tab];
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-10 text-center" dir="rtl">
      <div className="rounded-full bg-muted p-3">
        <AlertCircleIcon className="size-6 text-muted-foreground" />
      </div>
      <div className="text-sm font-medium">{m.title}</div>
      <div className="max-w-md text-xs text-muted-foreground">{m.desc}</div>
    </div>
  );
}

export function ContentManagerView({ navigate }: ContentManagerViewProps) {
  const [tab, setTab] = useState<StatusTab>("draft");
  const [page, setPage] = useState(1);
  const pageSize = 10;
  const [pendingDelete, setPendingDelete] = useState<ContentRow | null>(null);
  const qc = useQueryClient();

  const tabDef = useMemo(() => TAB_DEFS.find((t) => t.key === tab)!, [tab]);

  // Use the first status in the tab's list as the filter — the list endpoint
  // supports a single `status` value. (Other statuses are surfaced via the
  // other tabs in the UI.)
  const statusFilter = tabDef.statuses[0];

  const contentQ = useQuery({
    queryKey: ["content", "list", statusFilter, page, pageSize] as const,
    queryFn: () => api.listContent({ status: statusFilter, page, pageSize }),
    staleTime: 5_000,
  });

  // Fetch destinations in parallel so we can label the destination column.
  const destsQ = useQuery({
    queryKey: ["destinations", "list"] as const,
    queryFn: () => api.getDestinations(),
    staleTime: 30_000,
  });

  const destsById = useMemo(() => {
    const m = new Map<string, DestinationRow>();
    for (const d of destsQ.data ?? []) m.set(d.id, d);
    return m;
  }, [destsQ.data]);

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.deleteContent(id),
    onSuccess: () => {
      toast.success("محتوا حذف شد.");
      void qc.invalidateQueries({ queryKey: ["content"] });
      void qc.invalidateQueries({ queryKey: ["destinations"] });
    },
    onError: (e: Error) => toast.error(e.message ?? "حذف ناموفق بود."),
  });

  const rows = contentQ.data?.items ?? [];
  const total = contentQ.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  function onNew() {
    navigate("/dashboard/content-editor");
  }
  function onEdit(c: ContentRow) {
    navigate(`/dashboard/content-editor/${c.id}`);
  }
  function onPublish(c: ContentRow) {
    navigate(`/dashboard/content-editor/${c.id}?action=publish`);
  }
  function confirmDelete() {
    if (!pendingDelete) return;
    deleteMut.mutate(pendingDelete.id);
    setPendingDelete(null);
  }

  return (
    <div className="flex flex-col gap-4" dir="rtl">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <div className="flex flex-col gap-1">
            <CardTitle>مدیریت محتوا</CardTitle>
            <p className="text-xs text-muted-foreground">
              فهرست محتوا بر اساس وضعیت: پیش‌نویس، زمان‌بندی‌شده، منتشرشده و ناموفق.
            </p>
          </div>
          <Button onClick={onNew} className="gap-2">
            <FilePlus2Icon className="size-4" />
            محتوای جدید
          </Button>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Tabs value={tab} onValueChange={(v) => { setTab(v as StatusTab); setPage(1); }}>
            <TabsList>
              {TAB_DEFS.map((t) => (
                <TabsTrigger key={t.key} value={t.key}>{t.label}</TabsTrigger>
              ))}
            </TabsList>
          </Tabs>

          {/* Table */}
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[12rem]">عنوان</TableHead>
                  <TableHead>وضعیت</TableHead>
                  <TableHead className="min-w-[12rem]">زمان انتشار</TableHead>
                  <TableHead className="min-w-[10rem]">مقصد</TableHead>
                  <TableHead className="text-left">عملیات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {contentQ.isLoading ? (
                  Array.from({ length: 3 }).map((_, i) => (
                    <TableRow key={`skeleton-${i}`}>
                      <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-16" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-28" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-20" /></TableCell>
                      <TableCell><Skeleton className="h-7 w-20" /></TableCell>
                    </TableRow>
                  ))
                ) : rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="p-0">
                      <EmptyState tab={tab} />
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="max-w-[20rem]">
                        <div className="flex flex-col">
                          <span className="truncate font-medium">{c.title}</span>
                          {c.failureReason && (
                            <span className="text-[0.7rem] text-destructive">{c.failureReason}</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>{statusBadge(c.status)}</TableCell>
                      <TableCell>{publishTime(c)}</TableCell>
                      <TableCell>{destinationCell(c, destsById)}</TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm" className="gap-2">
                              <span>عملیات</span>
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onSelect={() => onEdit(c)}>
                              <PencilIcon className="size-4" />
                              ویرایش
                            </DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => onPublish(c)} disabled={c.status === "delivered"}>
                              <RocketIcon className="size-4" />
                              انتشار
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onSelect={() => setPendingDelete(c)}
                              className="text-destructive focus:text-destructive"
                            >
                              <Trash2Icon className="size-4" />
                              حذف
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between text-xs">
            <div className="text-muted-foreground">
              {total > 0 ? (
                <>
                  نمایش {toPersianDigits((page - 1) * pageSize + 1)} تا{" "}
                  {toPersianDigits(Math.min(page * pageSize, total))} از {toPersianDigits(total)} محتوا
                </>
              ) : (
                "بدون محتوا"
              )}
            </div>
            <div className="flex gap-1">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                قبلی
              </Button>
              <span className="px-2 py-1.5 text-xs">
                صفحه {toPersianDigits(page)} از {toPersianDigits(totalPages)}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                بعدی
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={!!pendingDelete} onOpenChange={(o) => { if (!o) setPendingDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>حذف محتوا</AlertDialogTitle>
            <AlertDialogDescription>
              آیا از حذف «{pendingDelete?.title}» مطمئن هستید؟ این عملیات قابل بازگشت نیست و وضعیت محتوا به «لغوشده» تغییر می‌کند.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>انصراف</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className={cn("bg-destructive text-white hover:bg-destructive/90")}
              disabled={deleteMut.isPending}
            >
              {deleteMut.isPending ? "در حال حذف…" : "حذف"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Sonner Toaster — mounted locally so toasts surface from this view. */}
      <PublishHintBanner navigate={navigate} />
    </div>
  );
}

function PublishHintBanner({ navigate }: { navigate: (to: string) => void }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border bg-muted/40 p-3 text-xs" dir="rtl">
      <div className="flex items-start gap-2">
        <SendIcon className="mt-0.5 size-4 text-muted-foreground" />
        <div>
          <div className="font-medium">می‌خواهید برای مقصد ارسال کنید؟</div>
          <div className="text-muted-foreground">
            برای ساخت یا ویرایش مقصد، به بخش مقاصد بروید.
          </div>
        </div>
      </div>
      <Button variant="outline" size="sm" onClick={() => navigate("/dashboard/destinations")}>
        مدیریت مقاصد
      </Button>
    </div>
  );
}

export default ContentManagerView;
