"use client";
// =====================================================================
// POSTYAR — Tickets View
// ---------------------------------------------------------------------
// List of user's tickets + «تیکت جدید» dialog (subject + body + category
// select). Clicking a ticket navigates to /dashboard/ticket/<id>.
// =====================================================================
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Loader2Icon,
  PlusIcon,
  TicketIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { api, type TicketRow } from "@/components/postyar/api";
import { formatRelative, toPersianDigits } from "@/lib/persian";

const CATEGORIES: Array<{ key: string; label: string }> = [
  { key: "general", label: "عمومی" },
  { key: "billing", label: "مالی" },
  { key: "technical", label: "فنی" },
  { key: "ai", label: "هوش مصنوعی" },
  { key: "gold", label: "طلا" },
  { key: "woo", label: "ووکامرس" },
  { key: "bot", label: "ربات" },
  { key: "security", label: "امنیتی" },
];

function statusBadge(status: string) {
  switch (status) {
    case "open": return <Badge variant="secondary">باز</Badge>;
    case "answered": return <Badge variant="default">پاسخ داده‌شده</Badge>;
    case "closed": return <Badge variant="outline">بسته</Badge>;
    default: return <Badge variant="outline">{status}</Badge>;
  }
}

function categoryLabel(c: string): string {
  return CATEGORIES.find((x) => x.key === c)?.label ?? c;
}

export interface TicketsViewProps {
  navigate: (to: string) => void;
}

export function TicketsView({ navigate }: TicketsViewProps) {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [category, setCategory] = useState("general");

  const q = useQuery({
    queryKey: ["tickets", "list"],
    queryFn: () => api.getTickets(),
    staleTime: 15_000,
  });

  const create = useMutation({
    mutationFn: () =>
      api.createTicket({
        subject: subject.trim(),
        body: body.trim(),
        category,
      }),
    onSuccess: (data) => {
      toast.success("تیکت ساخته شد.");
      setShowForm(false);
      setSubject("");
      setBody("");
      setCategory("general");
      qc.invalidateQueries({ queryKey: ["tickets", "list"] });
      navigate(`/dashboard/ticket/${data.ticket.id}`);
    },
    onError: (e: Error) => toast.error(e.message ?? "ایجاد تیکت ناموفق بود."),
  });

  const tickets = q.data ?? [];

  return (
    <div className="flex flex-col gap-4" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <TicketIcon className="size-6" />
            تیکت‌های پشتیبانی
          </h1>
          <p className="text-sm text-muted-foreground">
            سؤال‌ها و درخواست‌های پشتیبانی خود را اینجا پیگیری کنید.
          </p>
        </div>
        <Button onClick={() => setShowForm(true)}>
          <PlusIcon className="size-4" />
          تیکت جدید
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">تیکت‌های شما ({toPersianDigits(tickets.length)})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {q.isLoading && (
            <div className="flex flex-col gap-2 p-3">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          )}
          {q.error && (
            <div className="p-4 text-sm text-destructive">بارگذاری تیکت‌ها ناموفق بود.</div>
          )}
          {!q.isLoading && tickets.length === 0 && (
            <div className="flex flex-col items-center gap-2 py-10 text-center text-sm text-muted-foreground">
              <TicketIcon className="size-8 opacity-50" />
              <div>هنوز تیکتی نساخته‌اید.</div>
              <Button size="sm" variant="outline" onClick={() => setShowForm(true)}>
                <PlusIcon className="size-4" /> تیکت جدید
              </Button>
            </div>
          )}
          {tickets.length > 0 && (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>موضوع</TableHead>
                    <TableHead>دسته</TableHead>
                    <TableHead>وضعیت</TableHead>
                    <TableHead>پاسخ‌ها</TableHead>
                    <TableHead>به‌روزشده</TableHead>
                    <TableHead className="text-left">عملیات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tickets.map((t) => (
                    <TableRow
                      key={t.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => navigate(`/dashboard/ticket/${t.id}`)}
                    >
                      <TableCell className="max-w-[280px] truncate font-medium">{t.subject}</TableCell>
                      <TableCell>{categoryLabel(t.category)}</TableCell>
                      <TableCell>{statusBadge(t.status)}</TableCell>
                      <TableCell className="tabular-nums">{toPersianDigits(t.replyCount ?? 0)}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{formatRelative(t.updatedAt)}</TableCell>
                      <TableCell className="text-left">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/dashboard/ticket/${t.id}`);
                          }}
                        >
                          مشاهده
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent dir="rtl" className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>تیکت جدید</DialogTitle>
            <DialogDescription>
              موضوع و توضیحات خود را وارد کنید. دسته‌بندی به پشتیبان کمک می‌کند سریع‌تر پاسخ دهد.
            </DialogDescription>
          </DialogHeader>
          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              create.mutate();
            }}
          >
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="t-subject">موضوع</Label>
              <Input
                id="t-subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                maxLength={200}
                placeholder="مثلاً: مشکل در اتصال فروشگاه"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>دسته</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="t-body">متن تیکت</Label>
              <Textarea
                id="t-body"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={5}
                maxLength={8000}
                placeholder="شرح کامل مشکل یا درخواست..."
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowForm(false)}>انصراف</Button>
              <Button type="submit" disabled={create.isPending || subject.trim().length < 3 || body.trim().length < 3}>
                {create.isPending ? <Loader2Icon className="size-4 animate-spin" /> : null}
                ایجاد تیکت
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default TicketsView;
