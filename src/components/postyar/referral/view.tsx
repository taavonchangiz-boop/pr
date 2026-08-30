"use client";
// =====================================================================
// POSTYAR — Referral View (referral program dashboard)
// ---------------------------------------------------------------------
// Card showing:
//   - the user's referral code (large, copyable)
//   - share URL — /ref/<code> rendered as an absolute link
//   - stats: تعداد زیرمجموعه‌ها (referredCount) | مجموع پاداش‌ها
//   - prominent «تعداد زیرمجموعه‌ها: N نفر» header
//   - list of recent referrals (name + date + status + reward)
// =====================================================================
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  CheckIcon,
  CopyIcon,
  GiftIcon,
  Loader2Icon,
  Share2Icon,
  SparklesIcon,
  UsersIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { api } from "@/components/postyar/api";
import { formatRials, formatJalaliDate, toPersianDigits } from "@/lib/persian";

export interface ReferralViewProps {
  navigate: (to: string) => void;
}

// ---------------------------------------------------------------------
// Local extended stats type. The server (src/lib/payments/referral.ts)
// returns these fields; the legacy `ReferralStatsRow` in api.ts is left
// untouched (additive only), so we re-declare the wider shape here.
// ---------------------------------------------------------------------
interface ReferredRow {
  maskedEmail: string;
  maskedMobile: string;
  fullName: string;
  status: string;
  rewardStatus: string | null;
  amountRials: number;
  amountFa: string;
  createdAt: string;
  rewardCreatedAt: string | null;
}
interface ReferralStatsExtended {
  referralCode: string;
  referredCount: number;
  totalReferrals: number;
  totalRewardRials: number;
  totalRewardFa: string;
  policyFa?: string;
  referred: ReferredRow[];
}

function statusFa(status: string): string {
  switch (status) {
    case "active": return "فعال";
    case "suspended": return "معلق";
    default: return status;
  }
}
function statusBadgeTone(status: string): "default" | "secondary" | "destructive" {
  if (status === "active") return "default";
  if (status === "suspended") return "destructive";
  return "secondary";
}

function StatsRow({
  referredCount,
  totalRewardRials,
}: {
  referredCount: number;
  totalRewardRials: number;
}) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2" dir="rtl">
      <Card>
        <CardContent className="flex items-center gap-3 p-4">
          <div className="rounded-md bg-primary/10 p-2">
            <UsersIcon className="size-5 text-primary" />
          </div>
          <div className="flex flex-col">
            <span className="text-xs text-muted-foreground">تعداد زیرمجموعه‌ها</span>
            <span className="text-2xl font-bold tabular-nums">
              {toPersianDigits(referredCount)} نفر
            </span>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="flex items-center gap-3 p-4">
          <div className="rounded-md bg-emerald-500/10 p-2">
            <GiftIcon className="size-5 text-emerald-600" />
          </div>
          <div className="flex flex-col">
            <span className="text-xs text-muted-foreground">مجموع پاداش‌ها</span>
            <span className="text-2xl font-bold tabular-nums">{formatRials(totalRewardRials)}</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function CodeBox({ code }: { code: string }) {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const shareUrl = `${origin}/ref/${encodeURIComponent(code)}`;
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedShare, setCopiedShare] = useState(false);

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(code);
      toast.success("کد معرفی کپی شد.");
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    } catch {
      toast.error("کپی ناموفق بود. لطفاً به‌صورت دستی کپی کنید.");
    }
  };

  const copyShare = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      toast.success("نشانی اشتراک‌گذاری کپی شد.");
      setCopiedShare(true);
      setTimeout(() => setCopiedShare(false), 2000);
    } catch {
      toast.error("کپی ناموفق بود.");
    }
  };

  return (
    <Card dir="rtl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Share2Icon className="size-4 text-primary" />
          کد معرفی شما
        </CardTitle>
        <CardDescription className="text-xs">
          این کد را با دوستانتان به اشتراک بگذارید. پس از فعال‌شدن اشتراک
          ایشان، پاداش معرفی به کیف پول شما واریز می‌شود.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <Input
            value={code}
            readOnly
            dir="ltr"
            className="text-center font-mono text-lg font-bold tracking-wider"
          />
          <Button
            onClick={copyCode}
            variant="secondary"
            size="icon"
            className="shrink-0 cursor-pointer focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            aria-label="کپی کد"
          >
            {copiedCode ? <CheckIcon className="size-4 text-emerald-600" /> : <CopyIcon className="size-4" />}
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <Input
            value={shareUrl}
            readOnly
            dir="ltr"
            className="text-xs"
          />
          <Button
            onClick={copyShare}
            variant="outline"
            size="icon"
            className="shrink-0 cursor-pointer focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            aria-label="کپی نشانی"
          >
            {copiedShare ? <CheckIcon className="size-4 text-emerald-600" /> : <CopyIcon className="size-4" />}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          نشانی اشتراک‌گذاری: می‌توانید این لینک را در شبکه‌های اجتماعی یا از طریق پیامک برای دوستان خود ارسال کنید.
        </p>
      </CardContent>
    </Card>
  );
}

function ReferredList({ referred }: { referred: ReferredRow[] }) {
  if (referred.length === 0) {
    return (
      <Card dir="rtl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <UsersIcon className="size-4" />
            زیرمجموعه‌ها
          </CardTitle>
          <CardDescription className="text-xs">
            هنوز زیرمجموعه‌ای ثبت نشده است. کد خود را با دوستان به اشتراک بگذارید.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            <SparklesIcon className="size-8 text-muted-foreground" />
            <div className="text-sm font-medium">لیست خالی است</div>
            <div className="text-xs text-muted-foreground">
              پس از اولین زیرمجموعه، اینجا نمایش داده می‌شود.
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }
  return (
    <Card dir="rtl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <UsersIcon className="size-4" />
          زیرمجموعه‌ها
          <Badge variant="secondary" className="font-normal">
            {toPersianDigits(referred.length)} نفر
          </Badge>
        </CardTitle>
        <CardDescription className="text-xs">
          فهرست آخرین زیرمجموعه‌های شما به‌ترتیب زمان ثبت‌نام.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <ul className="max-h-96 divide-y overflow-y-auto" dir="rtl">
          {referred.map((r, i) => {
            const name = r.fullName?.trim() || r.maskedMobile || r.maskedEmail || "—";
            return (
              <li key={`${r.maskedMobile}-${i}`} className="flex items-center justify-between gap-2 p-3 text-sm">
                <div className="flex flex-col gap-0.5">
                  <span className="font-medium">{name}</span>
                  <span className="text-xs text-muted-foreground">
                    {formatJalaliDate(r.createdAt)}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={statusBadgeTone(r.status)} className="text-[10px]">
                    {statusFa(r.status)}
                  </Badge>
                  {r.rewardStatus === "paid" && r.amountRials > 0 ? (
                    <Badge className="gap-1 bg-emerald-600 text-white">
                      <GiftIcon className="size-3" />
                      {r.amountFa ?? formatRials(r.amountRials)}
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-[10px]">
                      بدون پاداش
                    </Badge>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}

export default function ReferralView({ navigate: _navigate }: ReferralViewProps) {
  void _navigate;
  const statsQ = useQuery({
    queryKey: ["referral", "stats"],
    queryFn: async (): Promise<ReferralStatsExtended> => {
      // Local fetch (instead of api.getReferralStats) so the new
      // referredCount/fullName/status fields type-check without editing
      // api.ts. The endpoint contract is the same.
      const r = await fetch("/api/referral", { credentials: "same-origin" });
      if (!r.ok) throw new Error("بارگذاری آمار معرفی ناموفق بود.");
      const data = (await r.json()) as Partial<ReferralStatsExtended>;
      return {
        referralCode: data.referralCode ?? "",
        referredCount: typeof data.referredCount === "number" ? data.referredCount : (data.totalReferrals ?? 0),
        totalReferrals: data.totalReferrals ?? 0,
        totalRewardRials: data.totalRewardRials ?? 0,
        totalRewardFa: data.totalRewardFa ?? formatRials(data.totalRewardRials ?? 0),
        policyFa: data.policyFa,
        referred: Array.isArray(data.referred) ? data.referred : [],
      };
    },
    staleTime: 30_000,
  });

  useEffect(() => {
    if (statsQ.error) toast.error("بارگذاری آمار معرفی ناموفق بود.");
  }, [statsQ.error]);

  const code = statsQ.data?.referralCode ?? "";
  const referredCount = statsQ.data?.referredCount ?? 0;
  const totalRewardRials = statsQ.data?.totalRewardRials ?? 0;
  const referred = useMemo(() => statsQ.data?.referred ?? [], [statsQ.data]);

  if (statsQ.isLoading) {
    return (
      <div className="flex flex-col gap-4" dir="rtl">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-60 w-full" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4" dir="rtl">
      <header>
        <h1 className="text-2xl font-bold">معرفی دوستان</h1>
        <p className="text-sm text-muted-foreground">
          برای هر دوستی که اشتراک پُست‌یار را فعال کند، پاداش معرفی به کیف پول شما واریز می‌شود.
        </p>
      </header>

      {/* Prominent referred count banner */}
      <Card dir="rtl" className="border-primary/30 bg-primary/5">
        <CardContent className="flex items-center gap-3 p-4">
          <div className="rounded-md bg-primary/15 p-3">
            <UsersIcon className="size-6 text-primary" />
          </div>
          <div className="flex flex-col">
            <span className="text-xs text-muted-foreground">تعداد زیرمجموعه‌ها</span>
            <span className="text-3xl font-bold tabular-nums">
              {toPersianDigits(referredCount)} نفر
            </span>
          </div>
          <div className="mr-auto flex flex-col items-end gap-1 text-xs text-muted-foreground">
            <span>
              پاداش فعال: {toPersianDigits(statsQ.data?.totalReferrals ?? 0)} نفر
            </span>
            <span>
              مجموع پاداش: {formatRials(totalRewardRials)}
            </span>
          </div>
        </CardContent>
      </Card>

      {statsQ.data?.policyFa && (
        <div className="rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground" dir="rtl">
          <span className="font-medium text-foreground">خط‌میش پاداش: </span>
          {statsQ.data.policyFa}
        </div>
      )}

      <StatsRow referredCount={referredCount} totalRewardRials={totalRewardRials} />

      <CodeBox code={code} />

      <ReferredList referred={referred} />

      {statsQ.isFetching && (
        <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground" dir="rtl">
          <Loader2Icon className="size-3.5 animate-spin" />
          در حال به‌روزرسانی...
        </div>
      )}
    </div>
  );
}
