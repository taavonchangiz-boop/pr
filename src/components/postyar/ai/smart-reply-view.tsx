"use client";
// =====================================================================
// POSTYAR — Smart Reply View
// ---------------------------------------------------------------------
// Form: پیام دریافتی (textarea), متن زمینه (textarea, optional).
// «تولید پاسخ» → api.smartReply → primary suggestion + alternatives.
// Auto-send is NOT enabled by default — the user reviews the suggestion
// and copies it. Sending is wired only through the AutoResponder view.
// =====================================================================
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  CheckIcon,
  CopyIcon,
  Loader2Icon,
  MessageSquareTextIcon,
  SparklesIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { api, type SmartReplyResult } from "@/components/postyar/api";
import { toPersianDigits } from "@/lib/persian";

export function SmartReplyView() {
  const [message, setMessage] = useState("");
  const [context, setContext] = useState("");
  const [editable, setEditable] = useState("");
  const [result, setResult] = useState<SmartReplyResult | null>(null);
  const [copied, setCopied] = useState(false);

  const generate = useMutation({
    mutationFn: () =>
      api.smartReply({
        message: message.trim(),
        contextText: context.trim() || undefined,
      }),
    onSuccess: (data: SmartReplyResult) => {
      if (!data.ok || !data.suggestion) {
        toast.error(data.errorFa ?? "تولید پاسخ ناموفق بود.");
        setResult(null);
        setEditable("");
        return;
      }
      setResult(data);
      setEditable(data.suggestion);
      toast.success("پاسخ آماده شد.");
    },
    onError: (e: Error) => {
      toast.error(e.message ?? "تولید پاسخ ناموفق بود.");
    },
  });

  function onGenerate() {
    if (message.trim().length < 2) {
      toast.error("پیام دریافتی حداقل ۲ نویسه باشد.");
      return;
    }
    generate.mutate();
  }

  async function onCopy() {
    try {
      await navigator.clipboard.writeText(editable);
      setCopied(true);
      toast.success("پاسخ کپی شد.");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("کپی ناموفق بود.");
    }
  }

  return (
    <div className="flex flex-col gap-4" dir="rtl">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <MessageSquareTextIcon className="size-6" />
          پاسخ هوشمند
        </h1>
        <p className="text-sm text-muted-foreground">
          یک پیام دریافتی را وارد کنید تا پاسخ پیشنهادی دریافت کنید. ارسال خودکار غیرفعال است.
        </p>
      </div>

      <Alert>
        <AlertTitle>ارسال خودکار غیرفعال است</AlertTitle>
        <AlertDescription>
          این ابزار فقط پیشنهاد می‌سازد. برای ارسال خودکار، به بخش «پاسخگوی خودکار» بروید و یک قاعده بسازید.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle>ورودی</CardTitle>
          <CardDescription>پیام دریافتی و اختیاراً زمینهٔ گفتگو را وارد کنید.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="sr-msg">پیام دریافتی</Label>
            <Textarea
              id="sr-msg"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={4}
              maxLength={4000}
              placeholder="متن پیام کاربر..."
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="sr-ctx">متن زمینه (اختیاری)</Label>
            <Textarea
              id="sr-ctx"
              value={context}
              onChange={(e) => setContext(e.target.value)}
              rows={3}
              maxLength={2000}
              placeholder="مثلاً: این کاربر دربارهٔ سفارش شمارهٔ ۱۲۳۴ سؤال کرده است..."
            />
          </div>
          <div className="flex justify-end">
            <Button onClick={onGenerate} disabled={generate.isPending}>
              {generate.isPending ? (
                <Loader2Icon className="size-4 animate-spin" />
              ) : (
                <SparklesIcon className="size-4" />
              )}
              {generate.isPending ? "در حال تولید..." : "تولید پاسخ"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {generate.isPending && !result && (
        <Card>
          <CardContent className="flex items-center justify-center gap-2 p-8 text-sm text-muted-foreground">
            <Loader2Icon className="size-5 animate-spin" />
            در حال تولید پاسخ...
          </CardContent>
        </Card>
      )}

      {result && (
        <Card>
          <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2">
                <SparklesIcon className="size-5" />
                پاسخ پیشنهادی
              </CardTitle>
              <CardDescription>
                می‌توانید متن را پیش از کپی یا ارسال ویرایش کنید.{" "}
                {result.provider && <span>ارائه‌دهنده: {result.provider}</span>}
              </CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={onCopy} disabled={!editable.trim()}>
              {copied ? <CheckIcon className="size-4" /> : <CopyIcon className="size-4" />}
              کپی
            </Button>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <Textarea
              value={editable}
              onChange={(e) => setEditable(e.target.value)}
              rows={6}
              className="font-sans text-sm"
            />
            {result.alternatives && result.alternatives.length > 0 && (
              <div className="flex flex-col gap-2">
                <div className="text-sm font-medium">پیشنهادهای دیگر</div>
                <ul className="flex flex-col gap-2">
                  {result.alternatives.map((alt, i) => (
                    <li key={i} className="rounded-md border bg-muted/30 p-3 text-sm">
                      <div className="mb-1 flex items-center justify-between">
                        <Badge variant="secondary">گزینهٔ {toPersianDigits(i + 1)}</Badge>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setEditable(alt);
                            toast.success("این پیشنهاد جایگزین شد.");
                          }}
                        >
                          استفاده
                        </Button>
                      </div>
                      <p className="whitespace-pre-wrap">{alt}</p>
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

export default SmartReplyView;
