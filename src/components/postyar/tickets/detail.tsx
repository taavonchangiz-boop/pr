"use client";
// =====================================================================
// POSTYAR — Ticket Detail View
// ---------------------------------------------------------------------
// Shows ticket header + replies thread + reply box (textarea + send).
// Replies may carry attachments (image/* or .zip). The reply composer
// accepts multiple files via an `<Input type="file" multiple>` and sends
// the request as multipart/form-data to POST /api/tickets/[id]/replies.
//
// Existing attachments render in each reply bubble:
//   - images: <img> thumbnail (click → open full via GET /api/tickets/[id]/attachments/<aid>)
//   - zip: a download chip with FileArchive icon + filename + size
//
// User can close if status=open and they own it (we trust server-side
// enforcement; the button is shown to everyone but the server rejects
// non-owners). Staff badge visible on staff replies.
// =====================================================================
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlertCircleIcon,
  CheckCircle2Icon,
  FileArchiveIcon,
  ImageIcon,
  Loader2Icon,
  PaperclipIcon,
  SendIcon,
  TicketIcon,
  UploadIcon,
  XIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  api,
  type TicketReplyView,
  type TicketRow,
} from "@/components/postyar/api";
import { formatJalaliDateTime, toPersianDigits } from "@/lib/persian";
import { cn } from "@/lib/utils";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MiB
const MAX_ZIP_BYTES = 10 * 1024 * 1024; // 10 MiB
const MAX_FILES_PER_REPLY = 8;

const ALLOWED_IMAGE_EXTS = new Set(["jpg", "jpeg", "png", "gif", "webp"]);
const ALLOWED_IMAGE_MIMES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
]);
const ALLOWED_ZIP_EXTS = new Set(["zip"]);
const ALLOWED_ZIP_MIMES = new Set([
  "application/zip",
  "application/x-zip-compressed",
]);

interface PendingFile {
  file: File;
  ok: boolean;
  errorFa?: string;
}

function validateFile(file: File): { ok: boolean; errorFa?: string } {
  const lower = (file.type || "").toLowerCase();
  const ext = (file.name.split(".").pop() || "").toLowerCase();
  const isImage =
    ALLOWED_IMAGE_MIMES.has(lower) || ALLOWED_IMAGE_EXTS.has(ext);
  const isZip = ALLOWED_ZIP_MIMES.has(lower) || ALLOWED_ZIP_EXTS.has(ext);
  if (!isImage && !isZip) {
    return {
      ok: false,
      errorFa: "فقط تصاویر (JPG/PNG/GIF/WebP) و فایل فشرده ZIP مجاز است.",
    };
  }
  if (file.size === 0) {
    return { ok: false, errorFa: "فایل خالی است." };
  }
  if (isImage && file.size > MAX_IMAGE_BYTES) {
    return { ok: false, errorFa: "حجم تصویر نباید بیشتر از ۵ مگابایت باشد." };
  }
  if (isZip && file.size > MAX_ZIP_BYTES) {
    return { ok: false, errorFa: "حجم ZIP نباید بیشتر از ۱۰ مگابایت باشد." };
  }
  return { ok: true };
}

function fileSizeLabel(bytes: number): string {
  if (bytes >= 1024 * 1024) {
    return `${toPersianDigits((bytes / (1024 * 1024)).toFixed(1))} مگابایت`;
  }
  if (bytes >= 1024) {
    return `${toPersianDigits(Math.round(bytes / 1024))} کیلوبایت`;
  }
  return `${toPersianDigits(bytes)} بایت`;
}

export interface TicketDetailViewProps {
  ticketId: string;
  navigate: (to: string) => void;
}

function statusBadge(status: string) {
  switch (status) {
    case "open": return <Badge variant="secondary">باز</Badge>;
    case "answered": return <Badge variant="default">پاسخ داده‌شده</Badge>;
    case "closed": return <Badge variant="outline">بسته</Badge>;
    default: return <Badge variant="outline">{status}</Badge>;
  }
}

export function TicketDetailView({ ticketId, navigate }: TicketDetailViewProps) {
  const qc = useQueryClient();
  const [reply, setReply] = useState("");
  const [showClose, setShowClose] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
  const endRef = useRef<HTMLDivElement | null>(null);

  const q = useQuery({
    queryKey: ["tickets", "detail", ticketId],
    queryFn: () => api.getTicketDetail(ticketId),
    enabled: !!ticketId,
    staleTime: 5_000,
    refetchInterval: 30_000,
  });

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [q.data?.replies?.length]);

  const replyMut = useMutation({
    mutationFn: (opts?: { close?: boolean }) => {
      const files = pendingFiles.filter((p) => p.ok).map((p) => p.file);
      return api.replyTicketWithAttachments(ticketId, reply.trim(), files, opts);
    },
    onSuccess: (_data, opts) => {
      setReply("");
      setPendingFiles([]);
      qc.invalidateQueries({ queryKey: ["tickets", "detail", ticketId] });
      qc.invalidateQueries({ queryKey: ["tickets", "list"] });
      toast.success(opts?.close ? "پاسخ ثبت شد و تیکت بسته شد." : "پاسخ ثبت شد.");
    },
    onError: (e: Error) => toast.error(e.message ?? "ثبت پاسخ ناموفق بود."),
  });

  const allFilesValid = useMemo(
    () => pendingFiles.length === 0 || pendingFiles.every((p) => p.ok),
    [pendingFiles],
  );

  function onFilesSelected(fileList: FileList | null) {
    if (!fileList) return;
    const incoming: PendingFile[] = [];
    for (let i = 0; i < fileList.length; i++) {
      const f = fileList.item(i);
      if (!f) continue;
      const result = validateFile(f);
      incoming.push({ file: f, ...result });
    }
    setPendingFiles((prev) => {
      const next = [...prev, ...incoming];
      if (next.length > MAX_FILES_PER_REPLY) {
        toast.error(
          `حداکثر ${toPersianDigits(MAX_FILES_PER_REPLY)} فایل در هر پاسخ مجاز است.`,
        );
        return next.slice(0, MAX_FILES_PER_REPLY);
      }
      return next;
    });
  }

  function onRemoveFile(idx: number) {
    setPendingFiles((prev) => prev.filter((_, i) => i !== idx));
  }

  function onSend(close?: boolean) {
    if (reply.trim().length < 2) {
      toast.error("متن پاسخ حداقل ۲ نویسه باشد.");
      return;
    }
    if (!allFilesValid) {
      toast.error("برخی فایل‌ها نامعتبر هستند. ابتدا آن‌ها را حذف یا اصلاح کنید.");
      return;
    }
    replyMut.mutate({ close });
    if (close) setShowClose(false);
  }

  if (q.isLoading) {
    return (
      <div className="flex flex-col gap-4" dir="rtl">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (q.error || !q.data) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-10 text-center" dir="rtl">
        <AlertCircleIcon className="size-8 text-destructive" />
        <div className="text-sm font-medium">بارگذاری تیکت ناموفق بود.</div>
        <Button variant="outline" size="sm" onClick={() => navigate("/dashboard/tickets")}>
          بازگشت به فهرست
        </Button>
      </div>
    );
  }

  const { ticket, replies } = q.data as { ticket: TicketRow; replies: TicketReplyView[] };
  const isClosed = ticket.status === "closed";

  return (
    <div className="flex flex-col gap-4" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button variant="ghost" size="sm" onClick={() => navigate("/dashboard/tickets")}>
          ← بازگشت
        </Button>
        {ticket.status === "open" && (
          <Button variant="outline" size="sm" onClick={() => setShowClose(true)}>
            <CheckCircle2Icon className="size-4" />
            بستن تیکت
          </Button>
        )}
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <TicketIcon className="size-5 text-muted-foreground" />
              <CardTitle className="text-lg">{ticket.subject}</CardTitle>
              {statusBadge(ticket.status)}
              <Badge variant="outline">{ticket.categoryFa ?? ticket.category}</Badge>
              {ticket.priorityFa && (
                <Badge
                  variant={
                    ticket.priority === "urgent" || ticket.priority === "high"
                      ? "destructive"
                      : "secondary"
                  }
                >
                  اولویت: {ticket.priorityFa}
                </Badge>
              )}
              {ticket.departmentNameFa && (
                <Badge variant="outline">دپارتمان: {ticket.departmentNameFa}</Badge>
              )}
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span>ایجاد: {ticket.createdAtFa ?? formatJalaliDateTime(ticket.createdAt, { withTime: true })}</span>
              <span>به‌روزرسانی: {ticket.updatedAtFa ?? formatJalaliDateTime(ticket.updatedAt, { withTime: true })}</span>
              {ticket.assignedToNameFa && <span>پشتیبان: {ticket.assignedToNameFa}</span>}
              <span>پاسخ‌ها: {toPersianDigits(ticket.replyCount ?? replies.length)}</span>
            </div>
          </div>
        </CardHeader>
      </Card>

      <Card className="flex-1">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">گفتگو ({toPersianDigits(replies.length)} پاسخ)</CardTitle>
        </CardHeader>
        <CardContent className="flex h-[50vh] flex-col p-0">
          <div className="flex-1 overflow-y-auto p-4">
            {replies.length === 0 && (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                هیچ پاسخی هنوز ثبت نشده است.
              </div>
            )}
            <ul className="flex flex-col gap-3">
              {replies.map((r) => (
                <ReplyItem key={r.id} reply={r} ticketId={ticketId} />
              ))}
              <div ref={endRef} />
            </ul>
          </div>
          <form
            className="flex flex-col gap-2 border-t p-3"
            onSubmit={(e) => {
              e.preventDefault();
              onSend(false);
            }}
          >
            <Textarea
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              rows={3}
              maxLength={8000}
              placeholder="پاسخ خود را بنویسید..."
              disabled={isClosed || replyMut.isPending}
            />
            <div className="flex flex-wrap items-center gap-2">
              <label
                htmlFor="ticket-file-input"
                className={cn(
                  "inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-md border border-input bg-background px-3 text-xs font-medium ring-offset-background transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
                  (isClosed || replyMut.isPending) && "pointer-events-none opacity-50",
                )}
              >
                <PaperclipIcon className="size-4" />
                افزودن فایل
                <span className="text-muted-foreground">
                  (تصویر تا {toPersianDigits(5)} مگابایت، ZIP تا {toPersianDigits(10)} مگابایت)
                </span>
              </label>
              <Input
                id="ticket-file-input"
                type="file"
                multiple
                accept="image/*,.zip,application/zip,application/x-zip-compressed"
                className="hidden"
                disabled={isClosed || replyMut.isPending}
                onChange={(e) => {
                  onFilesSelected(e.target.files);
                  // Reset so the same file can be re-selected after removal.
                  e.target.value = "";
                }}
              />
              {pendingFiles.length > 0 && (
                <div className="flex flex-col gap-1.5">
                  {pendingFiles.map((p, idx) => (
                    <div
                      key={`${p.file.name}-${idx}`}
                      className="flex items-center gap-2 rounded-md border bg-muted/40 px-2 py-1 text-xs"
                    >
                      {p.file.type.startsWith("image/") ? (
                        <ImageIcon className="size-3.5 text-muted-foreground" />
                      ) : (
                        <FileArchiveIcon className="size-3.5 text-muted-foreground" />
                      )}
                      <span className="max-w-[200px] truncate" dir="ltr">{p.file.name}</span>
                      <span className="text-muted-foreground">{fileSizeLabel(p.file.size)}</span>
                      {p.ok ? (
                        <span className="text-emerald-600 dark:text-emerald-400">تأیید شد</span>
                      ) : (
                        <span className="text-destructive">{p.errorFa}</span>
                      )}
                      <button
                        type="button"
                        aria-label={`حذف ${p.file.name}`}
                        className="ml-auto inline-flex size-5 cursor-pointer items-center justify-center rounded hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        onClick={() => onRemoveFile(idx)}
                      >
                        <XIcon className="size-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-muted-foreground">
                {isClosed
                  ? "این تیکت بسته شده است."
                  : pendingFiles.length > 0
                    ? `${toPersianDigits(pendingFiles.filter((p) => p.ok).length)} فایل پیوست شد`
                    : ""}
              </span>
              <Button
                type="submit"
                disabled={
                  replyMut.isPending ||
                  reply.trim().length < 2 ||
                  isClosed ||
                  !allFilesValid
                }
              >
                {replyMut.isPending ? (
                  <Loader2Icon className="size-4 animate-spin" />
                ) : (
                  <SendIcon className="size-4" />
                )}
                ارسال پاسخ
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <AlertDialog open={showClose} onOpenChange={setShowClose}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>بستن این تیکت؟</AlertDialogTitle>
            <AlertDialogDescription>
              اگر پاسخ فعلی را ارسال کنیم و تیکت را ببندیم، دیگر پاسخی نمی‌توانید
              اضافه کنید. (در صورت نیاز، تیکت جدید باز کنید.)
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>انصراف</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                onSend(true);
              }}
            >
              ارسال پاسخ و بستن
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function ReplyItem({
  reply,
  ticketId,
}: {
  reply: TicketReplyView;
  ticketId: string;
}) {
  const isStaff = reply.isStaff;
  const attachments = reply.attachments ?? [];
  return (
    <li
      className={cn(
        "flex max-w-[90%] flex-col gap-1 rounded-md border p-3 text-sm",
        isStaff ? "self-start bg-primary/5" : "self-end bg-muted/40",
      )}
    >
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="flex items-center gap-1 font-medium">
          {reply.authorNameFa ?? (isStaff ? "پشتیبان" : "شما")}
          {isStaff && <Badge variant="default" className="text-[10px]">پشتیبان</Badge>}
        </span>
        <span className="text-muted-foreground" dir="rtl">
          {reply.createdAtFa ?? formatJalaliDateTime(reply.createdAt, { withTime: true })}
        </span>
      </div>
      <p className="whitespace-pre-wrap break-words">{reply.body}</p>
      {attachments.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-2">
          {attachments.map((a) =>
            a.mime.startsWith("image/") ? (
              <a
                key={a.id}
                href={api.getTicketAttachmentUrl(ticketId, a.id)}
                target="_blank"
                rel="noopener noreferrer"
                className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <img
                  src={api.getTicketAttachmentUrl(ticketId, a.id)}
                  alt={a.fileName}
                  className="size-24 cursor-pointer rounded-md border object-cover"
                  loading="lazy"
                />
              </a>
            ) : (
              <a
                key={a.id}
                href={api.getTicketAttachmentUrl(ticketId, a.id)}
                download={a.fileName}
                className="inline-flex items-center gap-1.5 rounded-md border bg-background px-2 py-1 text-xs font-medium hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <FileArchiveIcon className="size-4 text-muted-foreground" />
                <span className="max-w-[180px] truncate" dir="ltr">{a.fileName}</span>
                <span className="text-muted-foreground">{fileSizeLabel(a.sizeBytes)}</span>
                <UploadIcon className="size-3.5 text-muted-foreground" />
              </a>
            ),
          )}
        </div>
      )}
    </li>
  );
}

export default TicketDetailView;
