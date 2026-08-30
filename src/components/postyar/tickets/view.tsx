"use client";
// =====================================================================
// POSTYAR — Tickets View
// ---------------------------------------------------------------------
// List of user's tickets + «تیکت جدید» dialog. The dialog lets the
// user pick a department (from the admin-defined active departments)
// and a priority (low/normal/high/urgent) in addition to the legacy
// subject + body + category fields. The ticket list shows priority
// as a colored Badge and department name as a separate column.
//
// Clicking a ticket navigates to /dashboard/ticket/<id>.
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
import {
  api,
  type TicketDepartmentRow,
  type TicketRow,
} from "@/components/postyar/api";
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

const PRIORITY_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "low", label: "کم" },
  { value: "normal", label: "عادی" },
  { value: "high", label: "زیاد" },
  { value: "urgent", label: "فوری" },
];

function statusBadge(status: string) {
  switch (status) {
    case "open": return <Badge variant="secondary">باز</Badge>;
    case "answered": return <Badge variant="default">پاسخ داده‌شده</Badge>;
    case "closed": return <Badge variant="outline">بسته</Badge>;
    default: return <Badge variant="outline">{status}</Badge>;
  }
}

// Colored priority badge — urgent/high get the destructive variant
// (red) so they stand out at a glance; normal/low use quieter tones.
function priorityBadge(priority: string, priorityFa?: string) {
  const label = priorityFa ?? priority ?? "عادی";
  switch (priority) {
    case "urgent":
      return <Badge variant="destructive">{label}</Badge>;
    case "high":
      return (
        <Badge
          variant="destructive"
          className="border-transparent bg-amber-500 text-white [a&]:hover:bg-amber-500/90 dark:bg-amber-500/80"
        >
          {label}
        </Badge>
      );
    case "low":
      return <Badge variant="outline">{label}</Badge>;
    case "normal":
    default:
      return <Badge variant="secondary">{label}</Badge>;
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
  const [priority, setPriority] = useState<"low" | "normal" | "high" | "urgent">("normal");
  const [departmentId, setDepartmentId] = useState<string>("");

  const q = useQuery({
    queryKey: ["tickets", "list"],
    queryFn: () => api.getTickets(),
    staleTime: 15_000,
  });

  // Active departments for the create-ticket dialog dropdown. Any signed-in
  // user can read these (see /api/tickets/departments). If the admin has not
  // defined any departments yet, the dropdown shows a single disabled hint
  // item and the ticket is created without a department (departmentId=null).
  const depQ = useQuery({
    queryKey: ["tickets", "departments", "user"],
    queryFn: () => api.getTicketDepartmentsForUser(),
    staleTime: 60_000,
  });

  const create = useMutation({
    mutationFn: () =>
      api.createTicket({
        subject: subject.trim(),
        body: body.trim(),
        category,
        priority,
        departmentId: departmentId === "" ? null : departmentId,
      }),
    onSuccess: (data) => {
      toast.success("تیکت ساخته شد.");
      setShowForm(false);
      setSubject("");
      setBody("");
      setCategory("general");
      setPriority("normal");
      setDepartmentId("");
      qc.invalidateQueries({ queryKey: ["tickets", "list"] });
      navigate(`/dashboard/ticket/${data.ticket.id}`);
    },
    onError: (e: Error) => toast.error(e.message ?? "ایجاد تیکت ناموفق بود."),
  });

  const tickets = q.data ?? [];
  const departments: TicketDepartmentRow[] = depQ.data?.items ?? [];

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
                    <TableHead>دپارتمان</TableHead>
                    <TableHead>اولویت</TableHead>
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
                      className="cursor-pointer hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      onClick={() => navigate(`/dashboard/ticket/${t.id}`)}
                    >
                      <TableCell className="max-w-[260px] truncate font-medium">{t.subject}</TableCell>
                      <TableCell>{categoryLabel(t.category)}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {t.departmentNameFa ?? "—"}
                      </TableCell>
                      <TableCell>{priorityBadge(t.priority, t.priorityFa)}</TableCell>
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
              موضوع و توضیحات خود را وارد کنید. انتخاب دپارتمان و اولویت به
              پشتیبان کمک می‌کند سریع‌تر و دقیق‌تر پاسخ دهد.
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
              <Label>دپارتمان</Label>
              <Select
                value={departmentId || "none"}
                onValueChange={(v) => setDepartmentId(v === "none" ? "" : v)}
                disabled={depQ.isLoading || depQ.error !== null}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="بدون دپارتمان" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">بدون دپارتمان</SelectItem>
                  {departments.length === 0 && !depQ.isLoading && (
                    <SelectItem value="empty" disabled>
                      دپارتمانی تعریف نشده است
                    </SelectItem>
                  )}
                  {departments.map((d) => (
                    <SelectItem key={d.id} value={d.id}>{d.nameFa}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {depQ.error && (
                <span className="text-xs text-muted-foreground">
                  بارگذاری دپارتمان‌ها ناموفق بود. می‌توانید بدون دپارتمان ادامه دهید.
                </span>
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>اولویت</Label>
              <Select
                value={priority}
                onValueChange={(v) => setPriority(v as "low" | "normal" | "high" | "urgent")}
              >
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PRIORITY_OPTIONS.map((p) => (
                    <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
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
