"use client";
// =====================================================================
// POSTYAR — Bot Broadcast View
// ---------------------------------------------------------------------
// Form: message textarea + optional audience list (comma-separated
// providerUserIds — optional). Shows rate-limit warning (max 10/sec).
// Submit → POST /api/bots/[id]/broadcast. Show result with success/
// failure counts.
// =====================================================================
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlertTriangleIcon,
  Loader2Icon,
  SendIcon,
  UsersIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { api, type BroadcastResult } from "@/components/postyar/api";
import { toPersianDigits } from "@/lib/persian";

export interface BotBroadcastViewProps {
  botId: string;
  navigate: (to: string) => void;
}

export function BotBroadcastView({ botId, navigate: _navigate }: BotBroadcastViewProps) {
  const qc = useQueryClient();
  const [message, setMessage] = useState("");
  const [audience, setAudience] = useState("");
  const [result, setResult] = useState<BroadcastResult | null>(null);

  const sendMut = useMutation({
    mutationFn: () => {
      const list = audience
        .split(/[\s,،]+/)
        .map((s) => s.trim())
        .filter(Boolean);
      return api.broadcastBot(botId, {
        message: message.trim(),
        audienceProviderUserIds: list.length > 0 ? list : undefined,
      });
    },
    onSuccess: (data) => {
      setResult(data);
      qc.invalidateQueries({ queryKey: ["bot", "history", botId] });
      toast.success(`پیام به ${toFa(data.sent)} گیرنده ارسال شد.`);
    },
    onError: (e: Error) => toast.error(e.message ?? "ارسال ناموفق بود."),
  });

  return (
    <div className="flex flex-col gap-4" dir="rtl">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <SendIcon className="size-6" />
          پیام گروهی (Broadcast)
        </h1>
        <p className="text-sm text-muted-foreground">
          ارسال پیام به همهٔ کاربرانی که تاکنون با ربات شما گفتگو کرده‌اند یا فهرستی مشخص از گیرندگان.
        </p>
      </div>

      <Alert>
        <AlertTriangleIcon className="size-4" />
        <AlertTitle>هشدار سرعت ارسال</AlertTitle>
        <AlertDescription>
          نرخ ارسال نهایتاً ۱۰ پیام در ثانیه است تا با محدودیت‌های پروایدر هماهنگ بماند. برای فهرست‌های بزرگ ارسال ممکن است چند دقیقه طول بکشد.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">فرم ارسال پیام گروهی</CardTitle>
          <CardDescription>متن را وارد کنید و در صورت تمایل فهرست گیرندگان را محدود کنید.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="b-msg">متن پیام</Label>
            <Textarea
              id="b-msg"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={5}
              maxLength={4000}
              placeholder="متن پیام خود را بنویسید..."
            />
            <span className="text-[10px] text-muted-foreground">{toFa(message.length)} / ۴۰۰۰ نویسه</span>
          </div>
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
            />
            <span className="text-[10px] text-muted-foreground">
              اگر خالی بگذارید، پیام به همهٔ کاربرانی که تاکنون پیام داده‌اند ارسال می‌شود.
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button onClick={() => sendMut.mutate()} disabled={sendMut.isPending || message.trim().length < 1}>
              {sendMut.isPending ? <Loader2Icon className="size-4 animate-spin" /> : <SendIcon className="size-4" />}
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

function toFa(n: number): string {
  return n.toString().replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[Number(d)]);
}

export default BotBroadcastView;
