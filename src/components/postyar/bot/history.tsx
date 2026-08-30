"use client";
// =====================================================================
// POSTYAR — Bot History View
// ---------------------------------------------------------------------
// Two render modes:
//   • With a pre-selected bot (botId !== undefined) — existing flow.
//     Paginated history table for that bot. Filter by direction, text
//     search client-side.
//   • Without a pre-selected bot (botId === undefined) — "all bots"
//     mode: fetches ALL the user's bots, then the first page of each
//     bot's history in parallel, and renders a unified table with a
//     «بات» column. A bot filter Select narrows the view. If the user
//     has NO bots, an empty state with «ساخت بات» CTA is shown — the
//     view still renders and loads.
//
// The unified table is intentionally a "best-effort first-page per bot"
// view (page 1 of each bot's history). For full per-bot pagination, the
// user picks a bot from the filter (or navigates to the bot-scoped
// route `/dashboard/bot-history/<botId>`).
// =====================================================================
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowDownLeftIcon,
  ArrowUpRightIcon,
  BotIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  HistoryIcon,
  InboxIcon,
  Loader2Icon,
  RefreshCwIcon,
  SearchIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { api, type BotHistoryRow, type BotListRow } from "@/components/postyar/api";
import { formatJalaliDateTime, toPersianDigits } from "@/lib/persian";

const PAGE_SIZE = 25;

export interface BotHistoryViewProps {
  /** Optional — when omitted, the view loads the unified "all bots"
   *  history. When provided, filters to that bot only. */
  botId?: string;
  navigate: (to: string) => void;
}

interface UnifiedRow extends BotHistoryRow {
  botId: string;
  botName: string;
  botProvider: string;
}

export function BotHistoryView({ botId, navigate }: BotHistoryViewProps) {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [direction, setDirection] = useState<"all" | "inbound" | "outbound">("all");
  const [q, setQ] = useState("");
  const [botFilter, setBotFilter] = useState<string>("all");

  // ----- Bots list (only when no botId) -----
  const botsQ = useQuery({
    queryKey: ["bots", "list"],
    queryFn: () => api.getBotsFull(),
    staleTime: 15_000,
    enabled: !botId,
  });
  const bots: BotListRow[] = botsQ.data ?? [];

  // ----- Single-bot history (existing flow, only when botId) -----
  const singleQ = useQuery({
    queryKey: ["bot", "history", botId ?? "", page, direction] as const,
    queryFn: () =>
      api.getBotHistory(botId as string, {
        page,
        pageSize: PAGE_SIZE,
        direction: direction === "all" ? undefined : direction,
      }),
    staleTime: 10_000,
    enabled: !!botId,
  });

  // ----- Per-bot history (unified mode) -----
  // We fetch the first page of each bot's history in parallel, combine
  // them, then apply client-side filtering (bot filter + direction +
  // text search) and pagination on the combined set.
  const unifiedQ = useQuery({
    queryKey: ["bot", "history", "all", bots.map((b) => b.id).join(","), direction] as const,
    queryFn: async (): Promise<UnifiedRow[]> => {
      const results = await Promise.all(
        bots.map(async (b) => {
          try {
            const r = await api.getBotHistory(b.id, {
              page: 1,
              pageSize: 50, // grab up to 50 per bot
              direction: direction === "all" ? undefined : direction,
            });
            return r.items.map((it) => ({
              ...it,
              botId: b.id,
              botName: b.name,
              botProvider: b.provider,
            }));
          } catch { return []; }
        }),
      );
      return results.flat();
    },
    staleTime: 10_000,
    enabled: !botId && bots.length > 0,
  });

  useEffect(() => {
    if (singleQ.error) toast.error("بارگذاری تاریخچه ناموفق بود.");
    if (unifiedQ.error) toast.error("بارگذاری تاریخچه ناموفق بود.");
  }, [singleQ.error, unifiedQ.error]);

  // ----- Combined client-side filtering (unified mode) -----
  const filtered = useMemo(() => {
    if (botId) return singleQ.data?.items ?? [];
    const all = unifiedQ.data ?? [];
    return all
      .filter((r) => botFilter === "all" || r.botId === botFilter)
      .filter((r) => !q.trim() || (r.text ?? "").includes(q.trim()))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [botId, singleQ.data, unifiedQ.data, botFilter, q]);

  // Pagination on the filtered set (unified mode)
  const unifiedTotal = botId ? (singleQ.data?.total ?? 0) : filtered.length;
  const unifiedTotalPages = botId
    ? (singleQ.data?.totalPages ?? 1)
    : Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paged = botId ? filtered : filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const total = botId ? (singleQ.data?.total ?? 0) : unifiedTotal;
  const totalPages = botId ? (singleQ.data?.totalPages ?? 1) : unifiedTotalPages;

  const isLoading = botId ? singleQ.isLoading : (botsQ.isLoading || (unifiedQ.isLoading && bots.length > 0));
  const isError = botId ? !!singleQ.error : !!botsQ.error;

  function refetch() {
    if (botId) singleQ.refetch();
    else { botsQ.refetch(); unifiedQ.refetch(); }
    qc.invalidateQueries({ queryKey: ["bot", "history"] });
  }

  return (
    <div className="flex flex-col gap-4" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <HistoryIcon className="size-6" />
            تاریخچه پیام‌های ربات
            {!botId && (
              <Badge variant="outline" className="font-normal text-xs">همهٔ بات‌ها</Badge>
            )}
          </h1>
          <p className="text-sm text-muted-foreground">
            {botId
              ? "پیام‌های ورودی و خروجی ثبت‌شده در این ربات."
              : "پیام‌های ورودی و خروجی همهٔ بات‌هایتان در یک نمای واحد."}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          disabled={isLoading}
          className="cursor-pointer focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <RefreshCwIcon className="size-4" /> به‌روزرسانی
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex flex-wrap items-center gap-2">
            <span>تاریخچه ({toPersianDigits(total)} مورد)</span>
            {isLoading && <Loader2Icon className="size-4 animate-spin" />}
          </CardTitle>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2">
              <Label className="text-xs text-muted-foreground">جهت:</Label>
              <Select value={direction} onValueChange={(v) => { setDirection(v as typeof direction); setPage(1); }}>
                <SelectTrigger className="w-40 cursor-pointer focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">همه</SelectItem>
                  <SelectItem value="inbound">ورودی</SelectItem>
                  <SelectItem value="outbound">خروجی</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {!botId && bots.length > 0 && (
              <div className="flex items-center gap-2">
                <Label className="text-xs text-muted-foreground">بات:</Label>
                <Select value={botFilter} onValueChange={(v) => { setBotFilter(v); setPage(1); }}>
                  <SelectTrigger className="w-56 cursor-pointer focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">همهٔ بات‌ها</SelectItem>
                    {bots.map((b) => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.name} <span dir="ltr" className="text-[10px] text-muted-foreground">{b.provider}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="relative flex-1 min-w-48">
              <SearchIcon className="absolute right-2 top-2.5 size-4 text-muted-foreground" />
              <Input
                value={q}
                onChange={(e) => { setQ(e.target.value); setPage(1); }}
                placeholder="جستجو در متن پیام..."
                className="pr-8 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading && (
            <div className="flex flex-col gap-2 p-3">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          )}
          {isError && (
            <div className="p-4 text-sm text-destructive">بارگذاری تاریخچه ناموفق بود.</div>
          )}
          {!isLoading && !isError && bots.length === 0 && !botId && (
            <div className="flex flex-col items-center gap-2 py-10 text-center text-sm text-muted-foreground">
              <InboxIcon className="size-8 opacity-50" />
              <div>هنوز باتی نساخته‌اید — تاریخچه‌ای موجود نیست.</div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => navigate("/dashboard/bots")}
                className="cursor-pointer focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                <BotIcon className="size-4" /> ساخت بات
              </Button>
            </div>
          )}
          {!isLoading && !isError && (botId || bots.length > 0) && paged.length === 0 && (
            <div className="flex flex-col items-center gap-2 py-10 text-center text-sm text-muted-foreground">
              <HistoryIcon className="size-8 opacity-50" />
              <div>موردی یافت نشد.</div>
            </div>
          )}
          {paged.length > 0 && (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>جهت</TableHead>
                    {!botId && <TableHead>بات</TableHead>}
                    <TableHead>کاربر ربات</TableHead>
                    <TableHead>متن</TableHead>
                    <TableHead>زمان</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paged.map((r) => (
                    <TableRow key={(r as UnifiedRow).botId + ":" + r.id}>
                      <TableCell>
                        {r.direction === "inbound" ? (
                          <Badge variant="secondary"><ArrowDownLeftIcon className="size-3 ml-1" /> ورودی</Badge>
                        ) : (
                          <Badge variant="default"><ArrowUpRightIcon className="size-3 ml-1" /> خروجی</Badge>
                        )}
                      </TableCell>
                      {!botId && (
                        <TableCell>
                          <div className="flex items-center gap-1 text-xs">
                            <BotIcon className="size-3" />
                            <span>{(r as UnifiedRow).botName}</span>
                            <span dir="ltr" className="text-[10px] text-muted-foreground">{(r as UnifiedRow).botProvider}</span>
                          </div>
                        </TableCell>
                      )}
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
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="cursor-pointer focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                <ChevronRightIcon className="size-4" /> قبلی
              </Button>
              <span className="text-xs text-muted-foreground">
                صفحهٔ {toPersianDigits(page)} از {toPersianDigits(totalPages)}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="cursor-pointer focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                بعدی <ChevronLeftIcon className="size-4" />
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default BotHistoryView;
