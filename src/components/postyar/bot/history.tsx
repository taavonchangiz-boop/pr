"use client";
// =====================================================================
// POSTYAR — Bot History View
// ---------------------------------------------------------------------
// Paginated table of BotHistory: direction badge, provider, masked
// providerUserId, text preview (truncated), Jalali timestamp.
// Filter by direction. Search by text (client-side, since the backend
// doesn't expose text search; we filter what's already loaded).
// =====================================================================
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowDownLeftIcon,
  ArrowUpRightIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  HistoryIcon,
  Loader2Icon,
  RefreshCwIcon,
  SearchIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { api } from "@/components/postyar/api";
import { formatJalaliDateTime, toPersianDigits } from "@/lib/persian";

const PAGE_SIZE = 25;

export interface BotHistoryViewProps {
  botId: string;
  navigate: (to: string) => void;
}

export function BotHistoryView({ botId, navigate: _navigate }: BotHistoryViewProps) {
  const [page, setPage] = useState(1);
  const [direction, setDirection] = useState<"all" | "inbound" | "outbound">("all");
  const [q, setQ] = useState("");

  const qhist = useQuery({
    queryKey: ["bot", "history", botId, page, direction],
    queryFn: () =>
      api.getBotHistory(botId, {
        page,
        pageSize: PAGE_SIZE,
        direction: direction === "all" ? undefined : direction,
      }),
    staleTime: 10_000,
  });

  const filtered = useMemo(() => {
    const items = qhist.data?.items ?? [];
    if (!q.trim()) return items;
    const needle = q.trim();
    return items.filter((r) => (r.text ?? "").includes(needle));
  }, [qhist.data, q]);

  const total = qhist.data?.total ?? 0;
  const totalPages = qhist.data?.totalPages ?? 1;

  return (
    <div className="flex flex-col gap-4" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <HistoryIcon className="size-6" />
            تاریخچه پیام‌های ربات
          </h1>
          <p className="text-sm text-muted-foreground">
            پیام‌های ورودی و خروجی ثبت‌شده در ربات.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => qhist.refetch()}>
          <RefreshCwIcon className="size-4" /> به‌روزرسانی
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex flex-wrap items-center gap-2">
            <span>تاریخچه ({toPersianDigits(total)} مورد)</span>
            {qhist.isFetching && <Loader2Icon className="size-4 animate-spin" />}
          </CardTitle>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2">
              <Label className="text-xs text-muted-foreground">جهت:</Label>
              <Select value={direction} onValueChange={(v) => { setDirection(v as typeof direction); setPage(1); }}>
                <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">همه</SelectItem>
                  <SelectItem value="inbound">ورودی</SelectItem>
                  <SelectItem value="outbound">خروجی</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="relative flex-1 min-w-48">
              <SearchIcon className="absolute right-2 top-2.5 size-4 text-muted-foreground" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="جستجو در متن پیام..."
                className="pr-8"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {qhist.isLoading && (
            <div className="flex flex-col gap-2 p-3">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          )}
          {qhist.error && (
            <div className="p-4 text-sm text-destructive">بارگذاری تاریخچه ناموفق بود.</div>
          )}
          {!qhist.isLoading && filtered.length === 0 && (
            <div className="flex flex-col items-center gap-2 py-10 text-center text-sm text-muted-foreground">
              <HistoryIcon className="size-8 opacity-50" />
              <div>موردی یافت نشد.</div>
            </div>
          )}
          {filtered.length > 0 && (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>جهت</TableHead>
                    <TableHead>کاربر ربات</TableHead>
                    <TableHead>متن</TableHead>
                    <TableHead>زمان</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell>
                        {r.direction === "inbound" ? (
                          <Badge variant="secondary"><ArrowDownLeftIcon className="size-3 ml-1" /> ورودی</Badge>
                        ) : (
                          <Badge variant="default"><ArrowUpRightIcon className="size-3 ml-1" /> خروجی</Badge>
                        )}
                      </TableCell>
                      <TableCell dir="ltr" className="font-mono text-xs">{r.providerUserId ?? "—"}</TableCell>
                      <TableCell className="max-w-[420px] truncate text-xs">{r.text ?? "—"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {formatJalaliDateTime(r.createdAt, { withTime: true })}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t p-3">
              <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>
                <ChevronRightIcon className="size-4" /> قبلی
              </Button>
              <span className="text-xs text-muted-foreground">
                صفحهٔ {toPersianDigits(page)} از {toPersianDigits(totalPages)}
              </span>
              <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>
                بعدی <ChevronLeftIcon className="size-4" />
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Label({ className, children }: { className?: string; children: React.ReactNode }) {
  return <span className={className}>{children}</span>;
}

export default BotHistoryView;
