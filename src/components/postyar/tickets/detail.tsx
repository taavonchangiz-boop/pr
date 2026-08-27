"use client";
// =====================================================================
// POSTYAR — Ticket Detail View
// ---------------------------------------------------------------------
// Shows ticket header + replies thread + reply box (textarea + send).
// User can close if status=open and they own it (we trust server-side
// enforcement; the button is shown to everyone but the server rejects
// non-owners). Staff badge visible on staff replies.
// =====================================================================
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlertCircleIcon,
  CheckCircle2Icon,
  Loader2Icon,
  SendIcon,
  TicketIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { api, type TicketRow, type TicketReplyView } from "@/components/postyar/api";
import { formatJalaliDateTime, toPersianDigits } from "@/lib/persian";
import { cn } from "@/lib/utils";

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
    mutationFn: (opts?: { close?: boolean }) => api.replyTicket(ticketId, reply.trim(), opts),
    onSuccess: (data, opts) => {
      setReply("");
      qc.invalidateQueries({ queryKey: ["tickets", "detail", ticketId] });
      qc.invalidateQueries({ queryKey: ["tickets", "list"] });
      toast.success(opts?.close ? "پاسخ ثبت شد و تیکت بسته شد." : "پاسخ ثبت شد.");
    },
    onError: (e: Error) => toast.error(e.message ?? "ثبت پاسخ ناموفق بود."),
  });

  function onSend(close?: boolean) {
    if (reply.trim().length < 2) {
      toast.error("متن پاسخ حداقل ۲ نویسه باشد.");
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
                <ReplyItem key={r.id} reply={r} />
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
              disabled={ticket.status === "closed" || replyMut.isPending}
            />
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-muted-foreground">
                {ticket.status === "closed" ? "این تیکت بسته شده است." : ""}
              </span>
              <Button type="submit" disabled={replyMut.isPending || reply.trim().length < 2 || ticket.status === "closed"}>
                {replyMut.isPending ? <Loader2Icon className="size-4 animate-spin" /> : <SendIcon className="size-4" />}
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
              اگر پاسخ فعلی را ارسال کنیم و تیکت را ببندیم، دیگر پاسخی نمی‌توانید اضافه کنید. (در صورت نیاز، تیکت جدید باز کنید.)
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

function ReplyItem({ reply }: { reply: TicketReplyView }) {
  const isStaff = reply.isStaff;
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
    </li>
  );
}

export default TicketDetailView;
