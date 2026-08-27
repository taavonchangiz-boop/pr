"use client";
// =====================================================================
// POSTYAR — AI Text View
// ---------------------------------------------------------------------
// Form: حالت (تولید/بازنویسی/خلاصه‌سازی/گسترش/تغییر لحن), ورودی (textarea).
// «اجرا» → api.generateText → editable output. «کپی».
// Persian digits throughout (toPersianDigits).
// =====================================================================
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  CheckIcon,
  CopyIcon,
  Loader2Icon,
  PlayIcon,
  SparklesIcon,
  Wand2Icon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { api, type AiTextResult } from "@/components/postyar/api";
import { toPersianDigits } from "@/lib/persian";

type ModeKey = "generate" | "rewrite" | "shorten" | "expand" | "tone";

const MODES: Array<{ key: ModeKey; label: string; hint: string }> = [
  { key: "generate", label: "تولید", hint: "متن جدید از موضوع تولید کن." },
  { key: "rewrite", label: "بازنویسی", hint: "متن را با حفظ معنا بازنویسی کن." },
  { key: "shorten", label: "خلاصه‌سازی", hint: "متن را کوتاه و مفید کن." },
  { key: "expand", label: "گسترش", hint: "متن را با جزئیات بیشتر گسترش بده." },
  { key: "tone", label: "تغییر لحن", hint: "لحن متن را تغییر بده." },
];

export function AiTextView() {
  const [mode, setMode] = useState<ModeKey>("rewrite");
  const [input, setInput] = useState("");
  const [output, setOutput] = useState("");
  const [result, setResult] = useState<AiTextResult | null>(null);
  const [copied, setCopied] = useState(false);

  const run = useMutation({
    mutationFn: () =>
      api.generateText({
        mode,
        input,
        opts: mode === "generate" ? { topic: input, tone: "friendly" } : { tone: "friendly" },
      }),
    onSuccess: (data: AiTextResult) => {
      if (!data.ok || !data.text) {
        toast.error(data.errorFa ?? "تولید متن ناموفق بود.");
        setResult(null);
        setOutput("");
        return;
      }
      setResult(data);
      setOutput(data.text);
      toast.success("متن آماده شد.");
    },
    onError: (e: Error) => {
      toast.error(e.message ?? "تولید متن ناموفق بود.");
    },
  });

  function onRun() {
    if (input.trim().length < 3) {
      toast.error("ورودی حداقل ۳ نویسه باشد.");
      return;
    }
    run.mutate();
  }

  async function onCopy() {
    try {
      await navigator.clipboard.writeText(output);
      setCopied(true);
      toast.success("متن کپی شد.");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("کپی ناموفق بود.");
    }
  }

  const activeMode = MODES.find((m) => m.key === mode)!;

  return (
    <div className="flex flex-col gap-4" dir="rtl">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <Wand2Icon className="size-6" />
          متن هوشمند
        </h1>
        <p className="text-sm text-muted-foreground">
          متن ورودی را بنویسید و یک حالت را انتخاب کنید. خروجی قابل ویرایش است.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>ورودی</CardTitle>
          <CardDescription>{activeMode.hint}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label>حالت</Label>
            <Select value={mode} onValueChange={(v) => setMode(v as ModeKey)}>
              <SelectTrigger className="w-full sm:w-64">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MODES.map((m) => (
                  <SelectItem key={m.key} value={m.key}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            rows={6}
            placeholder={mode === "generate" ? "موضوع متن را بنویسید..." : "متن خود را اینجا بنویسید..."}
            maxLength={8000}
          />
          <div className="flex justify-end">
            <Button onClick={onRun} disabled={run.isPending}>
              {run.isPending ? (
                <Loader2Icon className="size-4 animate-spin" />
              ) : (
                <PlayIcon className="size-4" />
              )}
              {run.isPending ? "در حال اجرا..." : "اجرا"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {run.isPending && !result && (
        <Card>
          <CardContent className="flex items-center justify-center gap-2 p-8 text-sm text-muted-foreground">
            <Loader2Icon className="size-5 animate-spin" />
            در حال پردازش متن...
          </CardContent>
        </Card>
      )}

      {result && (
        <Card>
          <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2">
                <SparklesIcon className="size-5" />
                خروجی
              </CardTitle>
              <CardDescription>
                می‌توانید متن را پیش از کپی یا ذخیره ویرایش کنید.{" "}
                {result.provider && <span>ارائه‌دهنده: {result.provider}</span>}
              </CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={onCopy} disabled={!output.trim()}>
              {copied ? <CheckIcon className="size-4" /> : <CopyIcon className="size-4" />}
              کپی
            </Button>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <Textarea
              value={output}
              onChange={(e) => setOutput(e.target.value)}
              rows={10}
              className="font-sans text-sm"
            />
            {(result.tokensIn !== undefined || result.tokensOut !== undefined) && (
              <div className="text-xs text-muted-foreground">
                {result.tokensIn !== undefined && <span>توکن ورودی: {toPersianDigits(result.tokensIn)} • </span>}
                {result.tokensOut !== undefined && <span>توکن خروجی: {toPersianDigits(result.tokensOut)}</span>}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default AiTextView;
