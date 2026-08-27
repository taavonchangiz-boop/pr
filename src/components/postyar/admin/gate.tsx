"use client";
// =====================================================================
// POSTYAR — Admin gate. Wraps any admin-only view; if the current user
// is not "admin", shows a Persian «دسترسی غیرمجاز» message.
// =====================================================================
import { ShieldAlertIcon } from "lucide-react";
import { useSession } from "@/components/layout/session-provider";
import { Skeleton } from "@/components/ui/skeleton";

export interface AdminGateProps {
  /** Optional: allow support role too (e.g. tickets). Defaults to admin-only. */
  roles?: Array<"admin" | "support" | "user">;
  children: React.ReactNode;
}

export function AdminGate({ roles = ["admin"], children }: AdminGateProps) {
  const { user, loading } = useSession();
  if (loading) {
    return (
      <div className="flex flex-col gap-2" dir="rtl">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }
  if (!user || !roles.includes(user.role)) {
    return (
      <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 text-center" dir="rtl">
        <ShieldAlertIcon className="size-12 text-destructive" />
        <div className="text-base font-medium">دسترسی غیرمجاز</div>
        <div className="max-w-md text-xs text-muted-foreground">
          این بخش فقط برای مدیران سیستم قابل دسترس است. اگر فکر می‌کنید این پیام را به اشتباه می‌بینید، با پشتیبانی تماس بگیرید.
        </div>
      </div>
    );
  }
  return <>{children}</>;
}

export default AdminGate;
