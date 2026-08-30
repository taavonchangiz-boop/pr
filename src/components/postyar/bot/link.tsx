"use client";
// =====================================================================
// POSTYAR — Bot Link Codes View
// ---------------------------------------------------------------------
// Two render modes:
//   • With a pre-selected bot (botId !== undefined) — existing flow.
//     Lists that bot's link codes + «تولید کد اتصال» button.
//   • Without a pre-selected bot (botId === undefined) — "all codes"
//     mode: fetches ALL the user's bots, then each bot's link codes,
//     and renders them in a unified table with a «بات» column. The
//     «تولید کد» button requires picking a target bot first.
//
// Bot-less personal codes:
//   A separate "کدهای شخصی (بدون بات)" section stores short referral-
//   style codes in localStorage (key: postyar:bot-link-personal-codes).
//   These codes can be created/managed without a bot. They show a
//   «کپی /start <code>» button so the user can share them with anyone;
//   the recipient can later claim them against any of the user's bots.
//   (The server-side cross-bot claim handshake is a follow-up item; the
//   personal code is, at minimum, a shareable, copyable, revocable
//   short string.)
//
// Persistence approach (documented in worklog):
//   The Prisma schema's `BotLinkCode.botId` is non-nullable. Bot-less
//   personal codes are therefore stored in localStorage. Generating a
//   server-side link code requires a target bot — the unified view
//   shows a bot-picker when the user clicks «تولید کد اتصال» without a
//   pre-selected bot.
// =====================================================================
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  BotIcon,
  CheckCheckIcon,
  CopyIcon,
  KeyRoundIcon,
  LayoutTemplateIcon,
  LinkIcon,
  Loader2Icon,
  PlusIcon,
  RefreshCwIcon,
  Trash2Icon,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { api, type BotListRow, type LinkCodeResult, type LinkCodeRow } from "@/components/postyar/api";
import { formatJalaliDateTime, formatRelative, toPersianDigits } from "@/lib/persian";

// =====================================================================
// localStorage personal-code store (bot-less)
// =====================================================================
const PERSONAL_KEY = "postyar:bot-link-personal-codes";

export interface PersonalLinkCode {
  id: string;
  code: string; // short referral-style code
  createdAt: string;
  claimed: boolean;
  claimedAt: string | null;
  note: string | null;
}

function loadPersonal(): PersonalLinkCode[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(PERSONAL_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed as PersonalLinkCode[];
  } catch { return []; }
}

function persistPersonal(items: PersonalLinkCode[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PERSONAL_KEY, JSON.stringify(items));
  } catch { /* ignore */ }
}

function randomPersonalCode(): string {
  // 6 uppercase alphanumerics — referral-style.
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no easy-to-confuse chars
  let s = "";
  for (let i = 0; i < 6; i++) {
    s += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return `POSTYAR-${s}`;
}

// =====================================================================
// Main view
// =====================================================================
export interface BotLinkViewProps {
  /** Optional — when omitted, lists codes across all the user's bots +
   *  a personal-codes section. */
  botId?: string;
  navigate: (to: string) => void;
}

export function BotLinkView({ botId, navigate: _navigate }: BotLinkViewProps) {
  void _navigate;
  const qc = useQueryClient();
  const [issued, setIssued] = useState<LinkCodeResult | null>(null);
  const [showGenerate, setShowGenerate] = useState(false);
  const [targetBotId, setTargetBotId] = useState<string>("");
  const [personal, setPersonal] = useState<PersonalLinkCode[]>([]);
  useEffect(() => { setPersonal(loadPersonal()); }, []);
  function commitPersonal(next: PersonalLinkCode[]) {
    setPersonal(next);
    persistPersonal(next);
  }

  // ----- Bots list (only when no botId) -----
  const botsQ = useQuery({
    queryKey: ["bots", "list"],
    queryFn: () => api.getBotsFull(),
    staleTime: 15_000,
    enabled: !botId,
  });
  const bots: BotListRow[] = botsQ.data ?? [];

  // ----- Single-bot codes (existing flow, only when botId) -----
  const singleQ = useQuery({
    queryKey: ["bot", "link-codes", botId ?? ""],
    queryFn: () => api.getLinkCodes(botId as string),
    staleTime: 15_000,
    enabled: !!botId,
  });

  // ----- Per-bot codes (unified mode) -----
  const unifiedQ = useQuery({
    queryKey: ["bot", "link-codes", "all", bots.map((b) => b.id).join(",")] as const,
    queryFn: async (): Promise<Array<{ botId: string; botName: string; botProvider: string; code: LinkCodeRow }>> => {
      const results = await Promise.all(
        bots.map(async (b) => {
          try {
            const items = await api.getLinkCodes(b.id);
            return items.map((c) => ({ botId: b.id, botName: b.name, botProvider: b.provider, code: c }));
          } catch { return []; }
        }),
      );
      return results.flat();
    },
    staleTime: 15_000,
    enabled: !botId && bots.length > 0,
  });

  // ----- Generate (server) -----
  const genMut = useMutation({
    mutationFn: (targetId: string) => api.generateLinkCode(targetId),
    onSuccess: (data) => {
      setIssued(data);
      setShowGenerate(false);
      setTargetBotId("");
      if (botId) {
        qc.invalidateQueries({ queryKey: ["bot", "link-codes", botId] });
      } else {
        qc.invalidateQueries({ queryKey: ["bot", "link-codes", "all"] });
      }
      toast.success("کد اتصال صادر شد.");
    },
    onError: (e: Error) => toast.error(e.message ?? "صدور کد ناموفق بود."),
  });

  // ----- Create personal (localStorage) -----
  function createPersonal() {
    const c: PersonalLinkCode = {
      id: `pc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      code: randomPersonalCode(),
      createdAt: new Date().toISOString(),
      claimed: false,
      claimedAt: null,
      note: null,
    };
    commitPersonal([c, ...personal]);
    toast.success("کد شخصی ساخته شد (ذخیره‌سازی محلی).");
  }

  function togglePersonalClaimed(id: string) {
    commitPersonal(personal.map((c) => c.id === id ? {
      ...c,
      claimed: !c.claimed,
      claimedAt: !c.claimed ? new Date().toISOString() : null,
    } : c));
  }

  function deletePersonal(id: string) {
    commitPersonal(personal.filter((c) => c.id !== id));
    toast.success("کد شخصی حذف شد.");
  }

  async function copy(text: string, label = "در حافظه رونوشت شد.") {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(label);
    } catch {
      toast.error("رونوشت ناموفق بود. لطفاً دستی انتخاب کنید.");
    }
  }

  // ----- Render server-side codes -----
  const serverRows = botId
    ? (singleQ.data ?? []).map((c) => ({ botId, botName: undefined as string | undefined, botProvider: undefined as string | undefined, code: c }))
    : (unifiedQ.data ?? []);

  const isLoading = botId ? singleQ.isLoading : (botsQ.isLoading || (unifiedQ.isLoading && bots.length > 0));
  const isError = botId ? !!singleQ.error : !!botsQ.error;

  return (
    <div className="flex flex-col gap-4" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <LinkIcon className="size-6" />
            کدهای اتصال
            {!botId && (
              <Badge variant="outline" className="font-normal text-xs">همهٔ بات‌ها</Badge>
            )}
          </h1>
          <p className="text-sm text-muted-foreground">
            {botId
              ? "کد یکبارمصرف برای پیوند کاربر ربات به حساب پُست‌یار شما."
              : "همهٔ کدهای اتصال شما در بات‌هایتان + کدهای شخصی بدون بات."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => createPersonal()}
            className="cursor-pointer focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            title="ساخت کد شخصی بدون بات"
          >
            <LayoutTemplateIcon className="size-4" />
            کد شخصی (بدون بات)
          </Button>
          <Button
            onClick={() => botId ? genMut.mutate(botId) : setShowGenerate(true)}
            disabled={genMut.isPending || (!botId && bots.length === 0)}
            className="cursor-pointer focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            {genMut.isPending ? <Loader2Icon className="size-4 animate-spin" /> : <PlusIcon className="size-4" />}
            تولید کد اتصال
          </Button>
        </div>
      </div>

      {/* Issued result */}
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
              <Button size="sm" variant="outline" onClick={() => copy(issued.code)} className="cursor-pointer focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
                <CopyIcon className="size-4" /> کپی کد
              </Button>
              <Button size="sm" variant="outline" onClick={() => copy(`/start ${issued.code}`)} className="cursor-pointer focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
                <CopyIcon className="size-4" /> کپی دستور /start
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setIssued(null)} className="cursor-pointer focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
                بستن
              </Button>
              <span className="mr-auto self-center text-xs text-muted-foreground">
                انقضا: {formatRelative(issued.expiresAt)}
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Personal codes (bot-less) */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <LayoutTemplateIcon className="size-4" />
            کدهای شخصی (بدون بات)
            <Badge variant="secondary" className="font-normal">{toPersianDigits(personal.length)}</Badge>
          </CardTitle>
          <CardDescription>
            کدهای کوتاه و قابل‌بازچینی که به بات خاصی وابسته نیستند. می‌توانید آن‌ها را در شبکه‌های اجتماعی به‌اشتراک بگذارید و هر زمان که مصرف شد، علامت‌گذاری کنید.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {personal.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-8 text-center text-sm text-muted-foreground">
              <LayoutTemplateIcon className="size-6 opacity-50" />
              <div>هنوز کد شخصی نساخته‌اید.</div>
              <Button size="sm" variant="outline" onClick={() => createPersonal()} className="cursor-pointer focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
                <PlusIcon className="size-4" /> ساخت کد شخصی
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>کد</TableHead>
                    <TableHead>وضعیت</TableHead>
                    <TableHead>ساخته‌شده</TableHead>
                    <TableHead>مصرف‌شده</TableHead>
                    <TableHead className="text-left">عملیات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {personal.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell dir="ltr" className="font-mono text-xs">{c.code}</TableCell>
                      <TableCell>
                        {c.claimed ? (
                          <Badge variant="default"><CheckCheckIcon className="size-3 ml-1" /> مصرف‌شده</Badge>
                        ) : (
                          <Badge variant="outline">فعال</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {formatJalaliDateTime(c.createdAt, { withTime: true })}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {c.claimedAt ? formatJalaliDateTime(c.claimedAt, { withTime: true }) : "—"}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => copy(c.code, "کد کپی شد.")}
                            title="کپی کد"
                            className="cursor-pointer focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                          >
                            <CopyIcon className="size-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => copy(`/start ${c.code}`, "دستور /start کپی شد.")}
                            title="کپی /start"
                            className="cursor-pointer focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                          >
                            <LinkIcon className="size-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => togglePersonalClaimed(c.id)}
                            title={c.claimed ? "علامت‌گذاری به‌عنوان فعال" : "علامت‌گذاری به‌عنوان مصرف‌شده"}
                            className="cursor-pointer focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                          >
                            <RefreshCwIcon className="size-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => deletePersonal(c.id)}
                            title="حذف"
                            className="cursor-pointer text-destructive hover:text-destructive focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                          >
                            <Trash2Icon className="size-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Server-side codes */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex flex-wrap items-center gap-2">
            <span>کدهای پیشین ({toPersianDigits(serverRows.length)})</span>
            {!botId && <Badge variant="outline" className="text-[10px] font-normal">از همهٔ بات‌ها</Badge>}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading && (
            <div className="flex flex-col gap-2 p-3">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          )}
          {isError && (
            <div className="p-4 text-sm text-destructive">بارگذاری کدها ناموفق بود.</div>
          )}
          {!isLoading && serverRows.length === 0 && (
            <div className="flex flex-col items-center gap-2 py-10 text-center text-sm text-muted-foreground">
              <KeyRoundIcon className="size-8 opacity-50" />
              <div>
                {botId
                  ? "هنوز کدی صادر نشده است."
                  : bots.length === 0
                    ? "ابتدا یک بات بسازید تا بتوانید کد اتصال صادر کنید."
                    : "موردی یافت نشد."}
              </div>
            </div>
          )}
          {serverRows.length > 0 && (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    {!botId && <TableHead>بات</TableHead>}
                    <TableHead>وضعیت</TableHead>
                    <TableHead>کاربر ربات</TableHead>
                    <TableHead>ساخته‌شده</TableHead>
                    <TableHead>منقضی</TableHead>
                    <TableHead>مصرف‌شده</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {serverRows.map((r) => (
                    <TableRow key={r.code.id}>
                      {!botId && (
                        <TableCell>
                          <div className="flex items-center gap-1 text-xs">
                            <BotIcon className="size-3" />
                            <span>{r.botName}</span>
                            <span dir="ltr" className="text-[10px] text-muted-foreground">{r.botProvider}</span>
                          </div>
                        </TableCell>
                      )}
                      <TableCell>
                        {r.code.consumed ? (
                          <Badge variant="default"><CheckCheckIcon className="size-3 ml-1" /> مصرف‌شده</Badge>
                        ) : new Date(r.code.expiresAt) < new Date() ? (
                          <Badge variant="secondary">منقضی</Badge>
                        ) : (
                          <Badge variant="outline">فعال</Badge>
                        )}
                      </TableCell>
                      <TableCell dir="ltr" className="font-mono text-xs">
                        {r.code.consumedByProviderUserIdMasked ?? "—"}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {formatJalaliDateTime(r.code.createdAt, { withTime: true })}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {formatJalaliDateTime(r.code.expiresAt, { withTime: true })}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {r.code.consumedAt ? formatJalaliDateTime(r.code.consumedAt, { withTime: true }) : "—"}
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

      {/* Generate dialog (only in unified mode) */}
      <Dialog open={showGenerate} onOpenChange={setShowGenerate}>
        <DialogContent dir="rtl" className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>تولید کد اتصال</DialogTitle>
            <DialogDescription>
              یک بات هدف انتخاب کنید تا کد یکبارمصرف برای آن بات صادر شود.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>بات هدف</Label>
              <Select value={targetBotId} onValueChange={setTargetBotId}>
                <SelectTrigger className="w-full cursor-pointer focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"><SelectValue placeholder="انتخاب بات…" /></SelectTrigger>
                <SelectContent>
                  {bots.length === 0 ? (
                    <SelectItem value="_none" disabled>ابتدا یک بات بسازید</SelectItem>
                  ) : (
                    bots.map((b) => (
                      <SelectItem key={b.id} value={b.id}>
                        <span className="flex items-center gap-2">
                          <BotIcon className="size-3" />
                          {b.name}
                          <span dir="ltr" className="text-[10px] text-muted-foreground">{b.provider}</span>
                        </span>
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setShowGenerate(false)} className="cursor-pointer focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">انصراف</Button>
            <Button
              type="button"
              disabled={genMut.isPending || !targetBotId}
              onClick={() => targetBotId && genMut.mutate(targetBotId)}
              className="cursor-pointer focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              {genMut.isPending ? <Loader2Icon className="size-4 animate-spin" /> : <PlusIcon className="size-4" />}
              صدور کد
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Keep the export stable — backward compat for any consumer still using
// `import BotLinkView, { type BotLinkViewProps } from …`.
void BotIcon;
export default BotLinkView;
