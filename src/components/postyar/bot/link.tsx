"use client";
// =====================================================================
// POSTYAR — Bot Link Codes View
// ---------------------------------------------------------------------
// Button «تولید کد اتصال» → POST /api/bots/[id]/link-code.
// Plaintext code shown in a large monospace box with «کپی» + a deep-link
// URL the user can send to their bot user (e.g., /start POSTYAR-XXXXX).
// List of past link codes (consumed status + masked providerUserId +
// createdAt Jalali). Single-use enforcement shown via badges.
// =====================================================================
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  CheckCheckIcon,
  CopyIcon,
  KeyRoundIcon,
  LinkIcon,
  Loader2Icon,
  PlusIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { api, type LinkCodeResult } from "@/components/postyar/api";
import { formatJalaliDateTime, formatRelative, toPersianDigits } from "@/lib/persian";

export interface BotLinkViewProps {
  botId: string;
  navigate: (to: string) => void;
}

export function BotLinkView({ botId, navigate: _navigate }: BotLinkViewProps) {
  const qc = useQueryClient();
  const [issued, setIssued] = useState<LinkCodeResult | null>(null);

  const q = useQuery({
    queryKey: ["bot", "link-codes", botId],
    queryFn: () => api.getLinkCodes(botId),
    staleTime: 15_000,
  });

  const genMut = useMutation({
    mutationFn: () => api.generateLinkCode(botId),
    onSuccess: (data) => {
      setIssued(data);
      qc.invalidateQueries({ queryKey: ["bot", "link-codes", botId] });
      toast.success("کد اتصال صادر شد.");
    },
    onError: (e: Error) => toast.error(e.message ?? "صدور کد ناموفق بود."),
  });

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("در حافظه رونوشت شد.");
    } catch {
      toast.error("رونوشت ناموفق بود. لطفاً دستی انتخاب کنید.");
    }
  }

  const codes = q.data ?? [];

  return (
    <div className="flex flex-col gap-4" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <LinkIcon className="size-6" />
            کدهای اتصال
          </h1>
          <p className="text-sm text-muted-foreground">
            کد یکبارمصرف برای پیوند کاربر ربات به حساب پُست‌یار شما.
          </p>
        </div>
        <Button onClick={() => genMut.mutate()} disabled={genMut.isPending}>
          {genMut.isPending ? <Loader2Icon className="size-4 animate-spin" /> : <PlusIcon className="size-4" />}
          تولید کد اتصال
        </Button>
      </div>

      {issued && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <KeyRoundIcon className="size-4" />
              کد صادر شد
            </CardTitle>
            <CardDescription>
              این کد را فقط یک‌بار می‌توانید ببینید. آن را کپی و به کاربر ربات تحویل دهید.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <Alert>
              <AlertTitle>مهم</AlertTitle>
              <AlertDescription>{issued.instructionsFa}</AlertDescription>
            </Alert>
            <div className="rounded-md border bg-muted/30 p-4" dir="ltr">
              <div className="font-mono text-lg tracking-wider break-all">{issued.code}</div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => copy(issued.code)}>
                <CopyIcon className="size-4" /> کپی کد
              </Button>
              <Button size="sm" variant="outline" onClick={() => copy(`/start ${issued.code}`)}>
                <CopyIcon className="size-4" /> کپی دستور /start
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setIssued(null)}>
                بستن
              </Button>
              <span className="mr-auto self-center text-xs text-muted-foreground">
                انقضا: {formatRelative(issued.expiresAt)}
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">کدهای پیشین ({toPersianDigits(codes.length)})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {q.isLoading && (
            <div className="flex flex-col gap-2 p-3">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          )}
          {q.error && (
            <div className="p-4 text-sm text-destructive">بارگذاری کدها ناموفق بود.</div>
          )}
          {!q.isLoading && codes.length === 0 && (
            <div className="flex flex-col items-center gap-2 py-10 text-center text-sm text-muted-foreground">
              <KeyRoundIcon className="size-8 opacity-50" />
              <div>هنوز کدی صادر نشده است.</div>
            </div>
          )}
          {codes.length > 0 && (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>وضعیت</TableHead>
                    <TableHead>کاربر ربات</TableHead>
                    <TableHead>ساخته‌شده</TableHead>
                    <TableHead>منقضی</TableHead>
                    <TableHead>مصرف‌شده</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {codes.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell>
                        {c.consumed ? (
                          <Badge variant="default"><CheckCheckIcon className="size-3 ml-1" /> مصرف‌شده</Badge>
                        ) : new Date(c.expiresAt) < new Date() ? (
                          <Badge variant="secondary">منقضی</Badge>
                        ) : (
                          <Badge variant="outline">فعال</Badge>
                        )}
                      </TableCell>
                      <TableCell dir="ltr" className="font-mono text-xs">
                        {c.consumedByProviderUserIdMasked ?? "—"}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {formatJalaliDateTime(c.createdAt, { withTime: true })}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {formatJalaliDateTime(c.expiresAt, { withTime: true })}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {c.consumedAt ? formatJalaliDateTime(c.consumedAt, { withTime: true }) : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Alert>
        <AlertTitle>یادآوری امنیتی</AlertTitle>
        <AlertDescription>
          کدهای اتصال تک‌مصرفی هستند؛ هر کد تنها یک‌بار قابل استفاده است. کد را هرگز در فضای عمومی به اشتراک نگذارید.
        </AlertDescription>
      </Alert>
    </div>
  );
}

export default BotLinkView;
