"use client";
// =====================================================================
// POSTYAR — Bot Broadcast View
// ---------------------------------------------------------------------
// Two render modes:
//   • With a pre-selected bot (botId !== undefined) — existing flow.
//     Sends a message to a bot's audience (providerUserIds who have
//     spoken to the bot). POSTs to /api/bots/[id]/broadcast.
//   • Without a pre-selected bot (botId === undefined) — "destination"
//     broadcast mode: the user picks destinations (channels) directly.
//     POSTs to /api/destinations/broadcast with { message,
//     destinationIds }.
//
// Both modes share the same message + result UI. The "audience" picker
// differs: bot-scoped shows a free-text list of providerUserIds;
// destination-scoped shows a multi-select of destinations.
// =====================================================================
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlertTriangleIcon,
  CheckIcon,
  Loader2Icon,
  PlusCircleIcon,
  RadioIcon,
  SendIcon,
  UsersIcon,
  XIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { api, type BroadcastResult, type DestinationRow } from "@/components/postyar/api";
import { toPersianDigits } from "@/lib/persian";

export interface BotBroadcastViewProps {
  /** Optional — when omitted, the view broadcasts to destinations. */
  botId?: string;
  navigate: (to: string) => void;
}

function providerLabel(p: string): string {
  switch (p) {
    case "telegram": return "تلگرام";
    case "bale": return "بله";
    case "rubika": return "روبیکا";
    default: return p;
  }
}

function toFa(n: number): string {
  return n.toString().replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[Number(d)]);
}

export function BotBroadcastView({ botId, navigate }: BotBroadcastViewProps) {
  const qc = useQueryClient();
  const [message, setMessage] = useState("");
  const [audience, setAudience] = useState(""); // bot-scoped: comma-separated providerUserIds
  const [result, setResult] = useState<BroadcastResult | null>(null);
  const [selectedDestinationIds, setSelectedDestinationIds] = useState<string[]>([]);

  // ----- Destinations list (only when no botId) -----
  const destsQ = useQuery({
    queryKey: ["destinations", "list"] as const,
    queryFn: () => api.getDestinations(),
    staleTime: 15_000,
    enabled: !botId,
  });
  const destinations: DestinationRow[] = useMemo(() => destsQ.data ?? [], [destsQ.data]);

  function toggleDestination(id: string) {
    setSelectedDestinationIds((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  }

  // ----- Send (bot-scoped) -----
  const sendBotMut = useMutation({
    mutationFn: () => {
      const list = audience
        .split(/[\s,،]+/)
        .map((s) => s.trim())
        .filter(Boolean);
      return api.broadcastBot(botId as string, {
        message: message.trim(),
        audienceProviderUserIds: list.length > 0 ? list : undefined,
      });
    },
    onSuccess: (data) => {
      setResult(data);
      qc.invalidateQueries({ queryKey: ["bot", "history", botId ?? ""] });
      toast.success(`پیام به ${toFa(data.sent)} گیرنده ارسال شد.`);
    },
    onError: (e: Error) => toast.error(e.message ?? "ارسال ناموفق بود."),
  });

  // ----- Send (destination-scoped) -----
  const sendDestMut = useMutation({
    mutationFn: async (): Promise<BroadcastResult> => {
      const r = await fetch("/api/destinations/broadcast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: message.trim(),
          destinationIds: selectedDestinationIds,
        }),
        credentials: "same-origin",
      });
      const data = (await r.json().catch(() => ({}))) as Partial<BroadcastResult> & { errorFa?: string };
      if (!r.ok || !data.ok) {
        throw new Error(data.errorFa ?? `ارسال ناموفق بود (کد ${r.status}).`);
      }
      return {
        ok: true,
        sent: typeof data.sent === "number" ? data.sent : 0,
        failed: typeof data.failed === "number" ? data.failed : 0,
        failures: Array.isArray(data.failures) ? data.failures : [],
      };
    },
    onSuccess: (data) => {
      setResult(data);
      qc.invalidateQueries({ queryKey: ["destinations", "list"] });
      toast.success(`پیام به ${toFa(data.sent)} مقصد ارسال شد.`);
    },
    onError: (e: Error) => toast.error(e.message ?? "ارسال ناموفق بود."),
  });

  const isDestinationMode = !botId;
  const canSubmit = isDestinationMode
    ? selectedDestinationIds.length > 0 && message.trim().length >= 1
    : message.trim().length >= 1;
  const pending = isDestinationMode ? sendDestMut.isPending : sendBotMut.isPending;

  function handleSubmit() {
    if (isDestinationMode) sendDestMut.mutate();
    else sendBotMut.mutate();
  }

  return (
    <div className="flex flex-col gap-4" dir="rtl">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <SendIcon className="size-6" />
          پیام گروهی (Broadcast)
          {isDestinationMode && (
            <Badge variant="outline" className="font-normal text-xs">مقاصد</Badge>
          )}
        </h1>
        <p className="text-sm text-muted-foreground">
          {isDestinationMode
            ? "ارسال پیام به یک یا چند مقصد (کانال/گروه). مقاصد را انتخاب کنید و پیام را بنویسید."
            : "ارسال پیام به همهٔ کاربرانی که تاکنون با ربات شما گفتگو کرده‌اند یا فهرستی مشخص از گیرندگان."}
        </p>
      </div>

      <Alert>
        <AlertTriangleIcon className="size-4" />
        <AlertTitle>هشدار سرعت ارسال</AlertTitle>
        <AlertDescription>
          {isDestinationMode
            ? "نرخ ارسال نهایتاً ۵ پیام در ثانیه است تا با محدودیت‌های پروایدر هماهنگ بماند. برای فهرست‌های بزرگ ارسال ممکن است چند دقیقه طول بکشد."
            : "نرخ ارسال نهایتاً ۱۰ پیام در ثانیه است تا با محدودیت‌های پروایدر هماهمان باشد. برای فهرست‌های بزرگ ارسال ممکن است چند دقیقه طول بکشد."}
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">
            {isDestinationMode ? "فرم ارسال به مقاصد" : "فرم ارسال پیام گروهی"}
          </CardTitle>
          <CardDescription>
            {isDestinationMode
              ? "مقاصد را انتخاب و متن را وارد کنید."
              : "متن را وارد کنید و در صورت تمایل فهرست گیرندگان را محدود کنید."}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {isDestinationMode ? (
            <div className="flex flex-col gap-2">
              <Label className="flex items-center gap-1">
                <RadioIcon className="size-3.5" />
                انتخاب مقاصد
              </Label>
              {destsQ.isLoading ? (
                <div className="flex flex-col gap-2">
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                </div>
              ) : destsQ.error ? (
                <div className="text-xs text-destructive">بارگذاری مقاصد ناموفق بود.</div>
              ) : destinations.length === 0 ? (
                <div
                  dir="rtl"
                  className="flex flex-col items-center gap-3 rounded-md border border-dashed p-5 text-center cursor-pointer transition-colors hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  role="button"
                  tabIndex={0}
                  onClick={() => navigate("/dashboard/destinations")}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      navigate("/dashboard/destinations");
                    }
                  }}
                >
                  <PlusCircleIcon className="size-7 text-muted-foreground" />
                  <div className="text-sm text-muted-foreground">
                    هنوز مقصدی نساخته‌اید. یک مقصد بسازید.
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate("/dashboard/destinations");
                    }}
                    className="gap-1.5 cursor-pointer focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  >
                    <PlusCircleIcon className="size-4" />
                    ساخت مقصد جدید
                  </Button>
                </div>
              ) : (
                <>
                  <div className="flex flex-wrap gap-2">
                    {destinations.map((d) => {
                      const active = selectedDestinationIds.includes(d.id);
                      return (
                        <button
                          key={d.id}
                          type="button"
                          onClick={() => toggleDestination(d.id)}
                          className={
                            "flex cursor-pointer items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none " +
                            (active
                              ? "border-primary bg-primary/10 text-primary"
                              : "bg-background text-foreground hover:bg-muted/40")
                          }
                        >
                          {active ? <CheckIcon className="size-3" /> : null}
                          <span>{d.label}</span>
                          <Badge variant="outline" className="text-[10px]">{providerLabel(d.provider)}</Badge>
                        </button>
                      );
                    })}
                  </div>
                  {selectedDestinationIds.length > 0 && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <UsersIcon className="size-3.5" />
                      <span>{toFa(selectedDestinationIds.length)} مقصد انتخاب شده.</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setSelectedDestinationIds([])}
                        className="h-6 gap-1 px-2 text-xs cursor-pointer focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                      >
                        <XIcon className="size-3" /> پاک انتخاب
                      </Button>
                    </div>
                  )}
                </>
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="b-aud" className="flex items-center gap-1">
                <UsersIcon className="size-3.5" />
                فهرست گیرندگان (اختیاری)
              </Label>
              <Input
                id="b-aud"
                value={audience}
                onChange={(e) => setAudience(e.target.value)}
                dir="ltr"
                placeholder="chatId1, chatId2, ..."
                className="focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              />
              <span className="text-[10px] text-muted-foreground">
                اگر خالی بگذارید، پیام به همهٔ کاربرانی که تاکنون پیام داده‌اند ارسال می‌شود.
              </span>
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="b-msg">متن پیام</Label>
            <Textarea
              id="b-msg"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={5}
              maxLength={4000}
              placeholder="متن پیام خود را بنویسید..."
              className="focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            />
            <span className="text-[10px] text-muted-foreground">{toFa(message.length)} / ۴۰۰۰ نویسه</span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              onClick={handleSubmit}
              disabled={pending || !canSubmit}
              className="cursor-pointer focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              {pending ? <Loader2Icon className="size-4 animate-spin" /> : <SendIcon className="size-4" />}
              ارسال پیام
            </Button>
          </div>
        </CardContent>
      </Card>

      {result && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">نتیجهٔ ارسال</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="flex flex-wrap gap-2">
              <Badge variant="default">موفق: {toFa(result.sent)}</Badge>
              <Badge variant={result.failed > 0 ? "destructive" : "secondary"}>ناموفق: {toFa(result.failed)}</Badge>
            </div>
            {result.failures && result.failures.length > 0 && (
              <div className="rounded-md border bg-muted/30 p-3">
                <div className="mb-2 text-xs font-medium text-muted-foreground">جزئیات خطاها (۵۰ مورد نخست):</div>
                <ul className="max-h-48 overflow-y-auto text-xs" dir="ltr">
                  {result.failures.map((f, i) => (
                    <li key={i} className="flex items-center gap-2 border-b border-dashed py-1">
                      <span className="font-mono">{f.providerUserId}</span>
                      <span className="text-muted-foreground">—</span>
                      <span className="text-destructive">{f.errorFa}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default BotBroadcastView;
