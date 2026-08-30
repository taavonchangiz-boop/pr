"use client";
// =====================================================================
// POSTYAR — Inbox View
// ---------------------------------------------------------------------
// Left: list of conversation threads aggregated by (botId, providerUserId).
// Each row: provider badge + masked sender + last message preview + Jalali
// relative time + unread dot.
// Right: selected thread messages (inbound left, outbound right) + reply
// box. Reply calls /api/inbox/[threadId] which sends one message via the
// bot's provider to that providerUserId.
// Persian empty states throughout. No Latin digits.
// =====================================================================
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlertCircleIcon,
  InboxIcon,
  Loader2Icon,
  SendIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { api, type InboxThread, type InboxMessage } from "@/components/postyar/api";
import { formatJalaliDateTime, formatRelative, toPersianDigits } from "@/lib/persian";

const PROVIDER_FA: Record<string, string> = {
  telegram: "تلگرام",
  bale: "بله",
  rubika: "روبیکا",
};

export function InboxView() {
  const qc = useQueryClient();
  const [selected, setSelected] = useState<string | null>(null);
  const [reply, setReply] = useState("");
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const threadsQ = useQuery({
    queryKey: ["inbox", "threads"],
    queryFn: () => api.getInboxThreads(),
    staleTime: 10_000,
    refetchInterval: 30_000,
  });

  // Pick the first thread automatically when none is selected — derived at
  // render time to avoid the setState-in-effect pattern.
  const effectiveSelected = selected ?? threadsQ.data?.items?.[0]?.threadId ?? null;

  const messagesQ = useQuery({
    queryKey: ["inbox", "messages", effectiveSelected],
    queryFn: () => api.getInboxMessages(effectiveSelected!),
    enabled: !!effectiveSelected,
    staleTime: 5_000,
    refetchInterval: 15_000,
  });

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messagesQ.data?.items?.length]);

  const sendMut = useMutation({
    mutationFn: () => api.sendInboxReply(effectiveSelected!, reply.trim()),
    onSuccess: (data) => {
      if (!data.ok) {
        toast.error(data.errorFa ?? "ارسال ناموفق بود.");
        return;
      }
      setReply("");
      qc.invalidateQueries({ queryKey: ["inbox", "messages", effectiveSelected] });
      qc.invalidateQueries({ queryKey: ["inbox", "threads"] });
      toast.success("پیام ارسال شد.");
    },
    onError: (e: Error) => toast.error(e.message ?? "ارسال ناموفق بود."),
  });

  function onSend() {
    if (!effectiveSelected) {
      toast.error("یک گفتگو انتخاب کنید.");
      return;
    }
    if (reply.trim().length < 1) {
      toast.error("متن پیام خالی است.");
      return;
    }
    sendMut.mutate();
  }

  const threads = threadsQ.data?.items ?? [];
  const messages = messagesQ.data?.items ?? [];
  const currentThread = useMemo(
    () => threads.find((t) => t.threadId === effectiveSelected) ?? null,
    [threads, effectiveSelected],
  );

  return (
    <div className="flex flex-col gap-3" dir="rtl">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <InboxIcon className="size-6" />
          صندوق پیام‌ها
        </h1>
        <p className="text-sm text-muted-foreground">
          گفتگوهای دریافتی از ربات‌های شما. پاسخ‌ها از طریق همان ربات ارسال می‌شوند.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        {/* Threads list */}
        <Card className="lg:col-span-1">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">گفتگوها ({toPersianDigits(threads.length)})</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {threadsQ.isLoading && (
              <div className="flex flex-col gap-2 p-3">
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
              </div>
            )}
            {threadsQ.error && (
              <div className="flex items-center gap-2 p-4 text-sm text-destructive">
                <AlertCircleIcon className="size-4" />
                بارگذاری گفتگوها ناموفق بود.
              </div>
            )}
            {!threadsQ.isLoading && threads.length === 0 && (
              <div className="flex flex-col items-center gap-2 p-6 text-center text-sm text-muted-foreground">
                <InboxIcon className="size-8 opacity-50" />
                <div>هیچ گفتگویی موجود نیست.</div>
                <div className="text-xs">وقتی کاربر به یکی از ربات‌های شما پیام بدهد، اینجا نمایش داده می‌شود.</div>
              </div>
            )}
            {threads.length > 0 && (
              <ul className="max-h-[70vh] divide-y overflow-y-auto">
                {threads.map((t) => (
                  <li key={t.threadId}>
                    <button
                      onClick={() => setSelected(t.threadId)}
                      className={cn(
                        "flex w-full flex-col items-start gap-1 p-3 text-right transition-colors",
                        effectiveSelected === t.threadId ? "bg-muted" : "hover:bg-muted/50",
                      )}
                    >
                      <div className="flex w-full items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-xs">
                            {PROVIDER_FA[t.provider] ?? t.provider}
                          </Badge>
                          <span className="font-mono text-xs text-muted-foreground" dir="ltr">
                            {t.maskedSender}
                          </span>
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {formatRelative(t.lastAt)}
                        </span>
                      </div>
                      <div className="flex w-full items-center gap-2">
                        <div className="line-clamp-1 flex-1 text-xs text-foreground/80">
                          {t.lastDirection === "outbound" && <span className="text-muted-foreground">شما: </span>}
                          {t.lastMessage || "—"}
                        </div>
                        {t.unread && (
                          <span className="size-2 rounded-full bg-primary" aria-label="خوانده‌نشده" />
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {t.botName}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Messages panel */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 pb-3">
            <CardTitle className="text-sm">
              {currentThread ? (
                <span className="flex items-center gap-2">
                  <Badge variant="outline">{PROVIDER_FA[currentThread.provider] ?? currentThread.provider}</Badge>
                  <span className="font-mono text-xs text-muted-foreground" dir="ltr">{currentThread.maskedSender}</span>
                </span>
              ) : (
                "یک گفتگو انتخاب کنید"
              )}
            </CardTitle>
            {currentThread && (
              <span className="text-xs text-muted-foreground">
                {formatJalaliDateTime(currentThread.lastAt, { withTime: true })}
              </span>
            )}
          </CardHeader>
          <CardContent className="flex h-[60vh] flex-col p-0">
            {!effectiveSelected && (
              <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
                برای شروع گفتگو، از فهرست سمت راست یک مورد را انتخاب کنید.
              </div>
            )}
            {effectiveSelected && messagesQ.isLoading && (
              <div className="flex flex-1 items-center justify-center gap-2 text-sm text-muted-foreground">
                <Loader2Icon className="size-4 animate-spin" />
                در حال بارگذاری پیام‌ها...
              </div>
            )}
            {effectiveSelected && messagesQ.error && (
              <div className="flex flex-1 items-center justify-center gap-2 text-sm text-destructive">
                <AlertCircleIcon className="size-4" />
                بارگذاری پیام‌ها ناموفق بود.
                <Button variant="ghost" size="sm" onClick={() => messagesQ.refetch()}>تلاش مجدد</Button>
              </div>
            )}
            {effectiveSelected && !messagesQ.isLoading && !messagesQ.error && (
              <>
                <div className="flex-1 overflow-y-auto p-4">
                  {messages.length === 0 && (
                    <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                      این گفتگو خالی است.
                    </div>
                  )}
                  <ul className="flex flex-col gap-2">
                    {messages.map((m) => (
                      <MessageBubble key={m.id} message={m} />
                    ))}
                    <div ref={messagesEndRef} />
                  </ul>
                </div>
                <form
                  className="flex items-center gap-2 border-t p-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    onSend();
                  }}
                >
                  <Input
                    value={reply}
                    onChange={(e) => setReply(e.target.value)}
                    placeholder="پاسخ را بنویسید..."
                    maxLength={4000}
                    disabled={sendMut.isPending}
                  />
                  <Button type="submit" size="icon" disabled={sendMut.isPending || !reply.trim()}>
                    {sendMut.isPending ? (
                      <Loader2Icon className="size-4 animate-spin" />
                    ) : (
                      <SendIcon className="size-4" />
                    )}
                  </Button>
                </form>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function MessageBubble({ message }: { message: InboxMessage }) {
  const isInbound = message.direction === "inbound";
  return (
    <li
      className={cn(
        "flex max-w-[85%] flex-col gap-1 rounded-md border p-2 text-sm",
        isInbound ? "self-start bg-muted/40" : "self-end bg-primary/10",
      )}
    >
      <p className="whitespace-pre-wrap break-words">{message.text ?? ""}</p>
      <span className="text-[10px] text-muted-foreground" dir="rtl">
        {formatJalaliDateTime(message.createdAt, { withTime: true })}
      </span>
    </li>
  );
}

export default InboxView;
