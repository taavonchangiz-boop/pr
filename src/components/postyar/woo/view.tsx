"use client";
// =====================================================================
// POSTYAR — WooCommerce View
// ---------------------------------------------------------------------
// List of user's woo stores + «افزودن فروشگاه». Add store form:
// storeUrl, consumerKey, consumerSecret (password input, masked display
// after save). Each store row: URL + status + lastSyncAt (Jalali) +
// «تست اتصال» + «همگام‌سازی محصولات» (which emits Content drafts owned
// by the user).
// =====================================================================
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlertTriangleIcon,
  CheckCircle2Icon,
  ExternalLinkIcon,
  Loader2Icon,
  PlusIcon,
  RefreshCwIcon,
  ShoppingCartIcon,
  Trash2Icon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { api, type WooStoreRow } from "@/components/postyar/api";
import { formatJalaliDateTime, formatRelative, toPersianDigits } from "@/lib/persian";

const STATUS_BADGE: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  active: { label: "فعال", variant: "default" },
  inactive: { label: "غیرفعال", variant: "secondary" },
  error: { label: "خطا", variant: "destructive" },
};

export function WooView({ navigate }: { navigate: (to: string) => void }) {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const storesQ = useQuery({
    queryKey: ["woo", "stores"],
    queryFn: () => api.getWooStores(),
    staleTime: 30_000,
  });

  if (storesQ.isLoading) {
    return (
      <div className="flex flex-col gap-4" dir="rtl">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (storesQ.error) {
    return (
      <Card dir="rtl">
        <CardContent className="flex items-center gap-2 p-4 text-destructive">
          <AlertTriangleIcon className="size-4" />
          بارگذاری فروشگاه‌ها ناموفق بود.
          <Button variant="ghost" size="sm" onClick={() => storesQ.refetch()}>تلاش مجدد</Button>
        </CardContent>
      </Card>
    );
  }

  const stores = storesQ.data ?? [];

  return (
    <div className="flex flex-col gap-4" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <ShoppingCartIcon className="size-6" />
            فروشگاه‌های ووکامرس
          </h1>
          <p className="text-sm text-muted-foreground">
            فروشگاه‌های خود را متصل کنید و محصولات را به‌صورت خودکار به محتوای پیش‌نویس تبدیل کنید.
          </p>
        </div>
        <Button onClick={() => setShowForm(true)}>
          <PlusIcon className="size-4" />
          افزودن فروشگاه
        </Button>
      </div>

      {stores.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center text-sm text-muted-foreground">
            <ShoppingCartIcon className="size-8 opacity-50" />
            <div>هنوز هیچ فروشگاهی متصل نشده است.</div>
            <Button size="sm" variant="outline" onClick={() => setShowForm(true)}>
              <PlusIcon className="size-4" /> افزودن اولین فروشگاه
            </Button>
          </CardContent>
        </Card>
      )}

      {stores.length > 0 && (
        <div className="flex flex-col gap-3">
          {stores.map((s) => (
            <StoreRow
              key={s.id}
              store={s}
              onDelete={() => setDeleteId(s.id)}
              onSynced={() => {
                qc.invalidateQueries({ queryKey: ["woo", "stores"] });
              }}
              navigate={navigate}
            />
          ))}
        </div>
      )}

      <AddStoreDialog
        open={showForm}
        onOpenChange={setShowForm}
        onCreated={() => {
          setShowForm(false);
          qc.invalidateQueries({ queryKey: ["woo", "stores"] });
        }}
      />

      <AlertDialog open={deleteId !== null} onOpenChange={(open) => { if (!open) setDeleteId(null); }}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>حذف فروشگاه؟</AlertDialogTitle>
            <AlertDialogDescription>
              فروشگاه از لیست شما حذف می‌شود. این عمل قابل بازگشت نیست.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>انصراف</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => {
                if (!deleteId) return;
                // Backend doesn't expose DELETE yet — for now, just hide locally + toast.
                toast.info("برای حذف کامل فروشگاه، با پشتیبانی تماس بگیرید.");
                setDeleteId(null);
              }}
            >
              حذف
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function AddStoreDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated: () => void;
}) {
  const [storeUrl, setStoreUrl] = useState("");
  const [consumerKey, setConsumerKey] = useState("");
  const [consumerSecret, setConsumerSecret] = useState("");

  const mut = useMutation({
    mutationFn: () =>
      api.createWooStore({
        storeUrl: storeUrl.trim(),
        consumerKey: consumerKey.trim(),
        consumerSecret: consumerSecret.trim(),
      }),
    onSuccess: () => {
      toast.success("فروشگاه با موفقیت افزوده شد.");
      setStoreUrl("");
      setConsumerKey("");
      setConsumerSecret("");
      onCreated();
    },
    onError: (e: Error) => toast.error(e.message ?? "افزودن فروشگاه ناموفق بود."),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>افزودن فروشگاه ووکامرس</DialogTitle>
          <DialogDescription>
            کلید و رمز مصرف‌کننده را از تنظیمات ووکامرس → API بگیرید. قبل از ذخیره، اتصال آزمایش می‌شود.
          </DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            mut.mutate();
          }}
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ws-url">آدرس فروشگاه</Label>
            <Input
              id="ws-url"
              value={storeUrl}
              onChange={(e) => setStoreUrl(e.target.value)}
              placeholder="https://shop.example.com"
              dir="ltr"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ws-key">کلید مصرف‌کننده</Label>
            <Input
              id="ws-key"
              value={consumerKey}
              onChange={(e) => setConsumerKey(e.target.value)}
              placeholder="ck_..."
              dir="ltr"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ws-secret">رمز مصرف‌کننده</Label>
            <Input
              id="ws-secret"
              type="password"
              value={consumerSecret}
              onChange={(e) => setConsumerSecret(e.target.value)}
              placeholder="cs_..."
              dir="ltr"
            />
            <p className="text-xs text-muted-foreground">رمز در پایگاه داده رمزگذاری می‌شود و هرگز به‌صورت متن بازگردانده نمی‌شود.</p>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>انصراف</Button>
            <Button type="submit" disabled={mut.isPending}>
              {mut.isPending ? <Loader2Icon className="size-4 animate-spin" /> : <PlusIcon className="size-4" />}
              افزودن فروشگاه
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function StoreRow({
  store,
  onDelete,
  onSynced,
  navigate,
}: {
  store: WooStoreRow;
  onDelete: () => void;
  onSynced: () => void;
  navigate: (to: string) => void;
}) {
  const [testing, setTesting] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const meta = STATUS_BADGE[store.status] ?? { label: store.status, variant: "outline" as const };

  async function onTest() {
    setTesting(true);
    const r = await api.testWooStore(store.id);
    setTesting(false);
    if (r.ok) {
      toast.success("اتصال به فروشگاه برقرار است.");
    } else {
      toast.error(r.errorFa ?? "تست اتصال ناموفق بود.");
    }
  }

  async function onSync() {
    setSyncing(true);
    const r = await api.syncWooStore(store.id);
    setSyncing(false);
    if (r.ok) {
      toast.success(
        `${toPersianDigits(r.syncedCount ?? 0)} محصول به‌عنوان پیش‌نویس محتوا ذخیره شد.`,
      );
      onSynced();
      navigate("/dashboard/content");
    } else {
      toast.error(r.errorFa ?? "همگام‌سازی ناموفق بود.");
    }
  }

  return (
    <Card dir="rtl">
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 pb-3">
        <div className="flex flex-col gap-1">
          <CardTitle className="flex items-center gap-2 text-base">
            <a
              href={store.storeUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 hover:underline"
              dir="ltr"
            >
              {store.storeUrl}
              <ExternalLinkIcon className="size-3" />
            </a>
            <Badge variant={meta.variant}>{meta.label}</Badge>
          </CardTitle>
          <CardDescription>
            کلید مصرف‌کننده: <span dir="ltr" className="font-mono text-xs">{store.consumerKeyMasked || "••••"}</span>
          </CardDescription>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={onTest} disabled={testing || syncing}>
            {testing ? <Loader2Icon className="size-4 animate-spin" /> : <CheckCircle2Icon className="size-4" />}
            تست اتصال
          </Button>
          <Button size="sm" onClick={onSync} disabled={testing || syncing}>
            {syncing ? <Loader2Icon className="size-4 animate-spin" /> : <RefreshCwIcon className="size-4" />}
            همگام‌سازی محصولات
          </Button>
          <Button variant="ghost" size="icon" onClick={onDelete} disabled={testing || syncing}>
            <Trash2Icon className="size-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-xs text-muted-foreground">
          <span>
            آخرین همگام‌سازی: {store.lastSyncAt ? formatJalaliDateTime(store.lastSyncAt, { withTime: true }) : "هنوز انجام نشده"}
          </span>
          <span>
            {store.lastSyncAt ? `(${formatRelative(store.lastSyncAt)})` : ""}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

export default WooView;
