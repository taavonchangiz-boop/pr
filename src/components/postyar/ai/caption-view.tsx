"use client";
// =====================================================================
// POSTYAR — AI Caption View
// ---------------------------------------------------------------------
// Form: موضوع، لحن، مخاطب، طول، پلتفرم، هدف.
// «تولید کپشن» → api.generateCaption → primary caption (editable
// textarea) + alternatives list + hashtag chips.
// Buttons: «درج در محتوا» (writes the caption to the global store and
// navigates to /dashboard/content-editor), «تلاش مجدد», «کپی».
// All Persian strings + Persian digits (toPersianDigits).
// =====================================================================
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  CheckIcon,
  CopyIcon,
  FileTextIcon,
  HashIcon,
  Loader2Icon,
  RefreshCwIcon,
  SparklesIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { api, type AiCaptionResult } from "@/components/postyar/api";
import { useCaptionStore } from "@/components/postyar/ai/caption-store";
import { toPersianDigits } from "@/lib/persian";

export interface AiCaptionViewProps {
  navigate: (to: string) => void;
}

// NOTE: enum values MUST match the backend Zod schema in
// /api/ai/generate-caption/route.ts:
//   tone:     formal | friendly | casual | promotional | educational
//   purpose:  engagement | sale | awareness | announcement
//   platform: telegram | bale | rubika | instagram | website | general
//   length:   short | medium | long
// `audience` is a free-form string so any value is accepted.
type ToneKey = "formal" | "friendly" | "casual" | "promotional" | "educational";
type AudienceKey = "general" | "technical" | "childish" | "managers";
type LengthKey = "short" | "medium" | "long";
type PlatformKey = "telegram" | "bale" | "rubika" | "instagram" | "website" | "general";
type PurposeKey = "engagement" | "sale" | "awareness" | "announcement";

const TONES: Array<{ key: ToneKey; label: string }> = [
  { key: "formal", label: "رسمی" },
  { key: "friendly", label: "دوستانه" },
  { key: "casual", label: "صمیمی" },
  { key: "promotional", label: "تبلیغاتی" },
  { key: "educational", label: "آموزشی" },
];

const AUDIENCES: Array<{ key: AudienceKey; label: string }> = [
  { key: "general", label: "عمومی" },
  { key: "technical", label: "فنی" },
  { key: "childish", label: "کودکانه" },
  { key: "managers", label: "مدیران" },
];

const LENGTHS: Array<{ key: LengthKey; label: string }> = [
  { key: "short", label: "کوتاه" },
  { key: "medium", label: "متوسط" },
  { key: "long", label: "بلند" },
];

const PLATFORMS: Array<{ key: PlatformKey; label: string }> = [
  { key: "telegram", label: "تلگرام" },
  { key: "bale", label: "بله" },
  { key: "rubika", label: "روبیکا" },
  { key: "instagram", label: "اینستاگرام" },
  { key: "website", label: "وب‌سایت" },
  { key: "general", label: "عمومی" },
];

const PURPOSES: Array<{ key: PurposeKey; label: string }> = [
  { key: "engagement", label: "تعامل و مشارکت" },
  { key: "sale", label: "فروش" },
  { key: "awareness", label: "معرفی برند" },
  { key: "announcement", label: "اطلاع‌رسانی" },
];

export function AiCaptionView({ navigate }: AiCaptionViewProps) {
  const [topic, setTopic] = useState("");
  const [tone, setTone] = useState<ToneKey>("friendly");
  const [audience, setAudience] = useState<AudienceKey>("general");
  const [length, setLength] = useState<LengthKey>("short");
  const [platform, setPlatform] = useState<PlatformKey>("telegram");
  const [purpose, setPurpose] = useState<PurposeKey>("engagement");

  const [result, setResult] = useState<AiCaptionResult | null>(null);
  const [editable, setEditable] = useState("");
  const [copied, setCopied] = useState(false);

  const setCaptionStore = useCaptionStore((s) => s.set);

  const generate = useMutation({
    mutationFn: () =>
      api.generateCaption({
        topic: topic.trim(),
        tone,
        audience,
        length,
        platform,
        purpose,
      }),
    onSuccess: (data: AiCaptionResult) => {
      if (!data.ok || !data.caption) {
        toast.error(data.errorFa ?? "تولید کپشن ناموفق بود.");
        setResult(null);
        setEditable("");
        return;
      }
      setResult(data);
      setEditable(data.caption);
      toast.success("کپشن با موفقیت ساخته شد.");
    },
    onError: (e: Error) => {
      toast.error(e.message ?? "تولید کپشن ناموفق بود.");
    },
  });

  function onGenerate() {
    if (topic.trim().length < 3) {
      toast.error("موضوع حداقل ۳ نویسه باشد.");
      return;
    }
    generate.mutate();
  }

  function onInsert() {
    if (!editable.trim()) {
      toast.error("هیچ متنی برای درج نیست.");
      return;
    }
    setCaptionStore({
      text: editable,
      hashtags: result?.hashtags ?? [],
      createdAt: Date.now(),
    });
    toast.success("کپشن به ویرایشگر محتوا منتقل شد.");
    navigate("/dashboard/content-editor");
  }

  async function onCopy() {
    try {
      await navigator.clipboard.writeText(editable);
      setCopied(true);
      toast.success("متن کپشن کپی شد.");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("کپی ناموفق بود. لطفاً به‌صورت دستی کپی کنید.");
    }
  }

  return (
    <div className="flex flex-col gap-4" dir="rtl">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <SparklesIcon className="size-6" />
          ساخت کپشن هوشمند
        </h1>
        <p className="text-sm text-muted-foreground">
          با چند انتخاب ساده، یک کپشن آمادهٔ انتشار برای شبکه‌های اجتماعی بسازید.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>پارامترهای کپشن</CardTitle>
          <CardDescription>هرچه دقیق‌تر پر کنید، خروجی بهتر می‌شود.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="lg:col-span-3">
            <Label htmlFor="cap-topic">موضوع</Label>
            <Input
              id="cap-topic"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="مثلاً: معرفی کمپین پاییزهٔ فروشگاه فلان"
              maxLength={800}
            />
          </div>

          <SelectField label="لحن" value={tone} onChange={(v) => setTone(v as ToneKey)} items={TONES} />
          <SelectField label="مخاطب" value={audience} onChange={(v) => setAudience(v as AudienceKey)} items={AUDIENCES} />
          <SelectField label="طول" value={length} onChange={(v) => setLength(v as LengthKey)} items={LENGTHS} />
          <SelectField label="پلتفرم" value={platform} onChange={(v) => setPlatform(v as PlatformKey)} items={PLATFORMS} />
          <SelectField label="هدف" value={purpose} onChange={(v) => setPurpose(v as PurposeKey)} items={PURPOSES} />
          <div className="flex items-end">
            <Button
              onClick={onGenerate}
              disabled={generate.isPending}
              className="w-full sm:w-auto"
            >
              {generate.isPending ? (
                <Loader2Icon className="size-4 animate-spin" />
              ) : (
                <SparklesIcon className="size-4" />
              )}
              {generate.isPending ? "در حال ساخت..." : "تولید کپشن"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {generate.isPending && !result && (
        <Card>
          <CardContent className="flex items-center justify-center gap-2 p-8 text-sm text-muted-foreground">
            <Loader2Icon className="size-5 animate-spin" />
            در حال تولید کپشن — لطفاً چند ثانیه صبر کنید...
          </CardContent>
        </Card>
      )}

      {result && (
        <Card>
          <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2">
                <FileTextIcon className="size-5" />
                کپشن پیشنهادی
              </CardTitle>
              <CardDescription>
                می‌توانید متن را پیش از انتشار ویرایش کنید.{" "}
                {result.provider && (
                  <span className="text-muted-foreground">
                    (ارائه‌دهنده: {result.provider})
                  </span>
                )}
              </CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={onCopy} disabled={!editable.trim()}>
                {copied ? <CheckIcon className="size-4" /> : <CopyIcon className="size-4" />}
                کپی
              </Button>
              <Button variant="outline" size="sm" onClick={onGenerate} disabled={generate.isPending}>
                {generate.isPending ? <Loader2Icon className="size-4 animate-spin" /> : <RefreshCwIcon className="size-4" />}
                تلاش مجدد
              </Button>
              <Button size="sm" onClick={onInsert} disabled={!editable.trim()}>
                <FileTextIcon className="size-4" />
                درج در محتوا
              </Button>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <Textarea
              value={editable}
              onChange={(e) => setEditable(e.target.value)}
              rows={8}
              className="font-sans text-sm"
            />
            {result.hashtags && result.hashtags.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                <HashIcon className="size-4 text-muted-foreground" />
                {result.hashtags.map((tag, i) => (
                  <Badge key={`${tag}-${i}`} variant="secondary" className="gap-1">
                    {tag}
                  </Badge>
                ))}
              </div>
            )}
            {result.alternatives && result.alternatives.length > 0 && (
              <div className="flex flex-col gap-2">
                <div className="text-sm font-medium">پیشنهادهای دیگر</div>
                <ul className="flex flex-col gap-2">
                  {result.alternatives.map((alt, i) => (
                    <li
                      key={i}
                      className="rounded-md border bg-muted/30 p-3 text-sm"
                    >
                      <div className="mb-1 flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">
                          گزینهٔ {toPersianDigits(i + 1)}
                        </span>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setEditable(alt);
                            toast.success("این پیشنهاد جایگزین شد — برای ذخیره روی «درج در محتوا» بزنید.");
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

function SelectField<T extends string>({
  label,
  value,
  onChange,
  items,
}: {
  label: string;
  value: T;
  onChange: (v: string) => void;
  items: Array<{ key: T; label: string }>;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label>{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {items.map((it) => (
            <SelectItem key={it.key} value={it.key}>
              {it.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export default AiCaptionView;
