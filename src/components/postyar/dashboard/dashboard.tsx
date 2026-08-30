"use client";
// ---------------------------------------------------------------------
// POSTYAR — Dashboard (revamp2 integration)
// ---------------------------------------------------------------------
// Wires every view built by the feature agents into a single collapsible
// sidebar shell. Item 4 (polish), Item 5 (collapsible submenus), Item 6
// (scroll-to-top on nav), Item 7 (decluttered home with inline KPI strip),
// Item 8 (3-tab stats lives in stats-view.tsx), Item 9 (subscription-gated
// menu via /api/me/usage planFeatures).
//
// Ad slots (other agents built these — we mount them):
//   - <StickyAdBar placement="sticky_bar" position="top" /> at the root.
//   - <AdSlot placement="user_dashboard_top" /> at the top of <main>.
//   - <AdSlot placement="user_dashboard_sidebar" /> at the bottom of the
//     desktop sidebar.
//
// New renderView cases wired in this integration:
//   - "training"              → <Training navigate={navigate} />  (landing agent)
//   - "admin-orders-review"   → <AdminOrdersReviewView navigate>  (orders agent)
//   (admin-ticket-departments: not a separate case — TicketDepartmentsManager
//    is already embedded inside admin/tickets.tsx.)
//
// All existing renderView cases are preserved unchanged.
// ---------------------------------------------------------------------
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ActivityIcon,
  BarChart3Icon,
  BellIcon,
  BookOpenIcon,
  ChevronDownIcon,
  CreditCardIcon,
  FileTextIcon,
  GiftIcon,
  GraduationCapIcon,
  InboxIcon,
  LayoutGridIcon,
  ListOrderedIcon,
  LogOutIcon,
  MegaphoneIcon,
  MenuIcon,
  MessageCircleIcon,
  PackageIcon,
  PencilRulerIcon,
  PlusIcon,
  RadioIcon,
  RefreshCwIcon,
  SendIcon,
  ServerIcon,
  SettingsIcon,
  ShieldCheckIcon,
  ShoppingCartIcon,
  SparklesIcon,
  TicketIcon,
  TrendingUpIcon,
  UserCogIcon,
  UserIcon,
  UsersIcon,
  WalletIcon,
  Wand2Icon,
  ZapIcon,
  XIcon,
  BotIcon,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Skeleton } from "@/components/ui/skeleton";
import { useSession } from "@/components/layout/session-provider";
import { Logo } from "@/components/layout/logo";
import { HeaderClock } from "@/components/layout/header-clock";
import { NotificationBell } from "@/components/layout/notification-bell";
import { AdSlot } from "@/components/layout/ad-slot";
import { StickyAdBar } from "@/components/layout/sticky-ad-bar";
import { cn } from "@/lib/utils";
import { toPersianDigits, formatJalaliDate } from "@/lib/persian";
import type { PlanFeatures, PlanBooleanFeatureKey } from "@/lib/payments/plans";

import StatsView from "@/components/postyar/dashboard/stats-view";
import AdminStatsView from "@/components/postyar/admin/stats";

import ContentManagerView from "@/components/postyar/content/view";
import ContentEditorView from "@/components/postyar/content/editor";
import DestinationsView from "@/components/postyar/destinations/view";
import GlassButtonsView from "@/components/postyar/destinations/glass-buttons";
import PlansView from "@/components/postyar/payment/plans";
import PaymentView from "@/components/postyar/payment/view";
import OrdersView from "@/components/postyar/payment/orders";
import WalletView from "@/components/postyar/wallet/view";
import LedgerView from "@/components/postyar/wallet/ledger";
import ReferralView from "@/components/postyar/referral/view";
import SubscriptionsView from "@/components/postyar/payment/subscriptions";
import ProfileView from "@/components/postyar/dashboard/profile";
// Task 10-C views
import AiCaptionView from "@/components/postyar/ai/caption-view";
import AiTextView from "@/components/postyar/ai/text-view";
import SmartReplyView from "@/components/postyar/ai/smart-reply-view";
import AutoResponderView from "@/components/postyar/ai/auto-responder-view";
import InboxView from "@/components/postyar/ai/inbox-view";
import GoldView from "@/components/postyar/gold/view";
import GoldBotView from "@/components/postyar/gold/bot-view";
import WooView from "@/components/postyar/woo/view";
import TicketsView from "@/components/postyar/tickets/view";
import TicketDetailView from "@/components/postyar/tickets/detail";
import NotificationsView from "@/components/postyar/notifications/view";
import AdvertisingView from "@/components/postyar/advertising/view";
// Landing — training page (now private, embedded in the dashboard).
import { Training } from "@/components/postyar/landing/training";
// Task 10-D views — Bot Builder
import BotsListView from "@/components/postyar/bot/list";
import BotWorkflowView from "@/components/postyar/bot/workflow";
import BotLinkView from "@/components/postyar/bot/link";
import BotHistoryView from "@/components/postyar/bot/history";
import BotBroadcastView from "@/components/postyar/bot/broadcast";
// Task 10-D views — Admin Panel
import AdminUsersView from "@/components/postyar/admin/users";
import AdminPlansView from "@/components/postyar/admin/plans";
import AdminAuditView from "@/components/postyar/admin/audit";
import AdminHealthView from "@/components/postyar/admin/health";
import AdminAdsView from "@/components/postyar/admin/ads";
import AdminDiscountsView from "@/components/postyar/admin/discounts";
import AdminBankCardsView from "@/components/postyar/admin/bank-cards";
import AdminOrdersView from "@/components/postyar/admin/orders";
import AdminOrdersReviewView from "@/components/postyar/admin/orders-review";
import AdminSubscriptionsView from "@/components/postyar/admin/subscriptions";
import AdminBotsView from "@/components/postyar/admin/bots";
import AdminBroadcastView from "@/components/postyar/admin/broadcast";
import AdminSettingsView from "@/components/postyar/admin/settings";
import AdminTicketsView from "@/components/postyar/admin/tickets";
import AdminWooView from "@/components/postyar/admin/woo";
import AdminGoldView from "@/components/postyar/admin/gold";

export interface DashboardProps {
  navigate: (to: string) => void;
  initialView: string;
  param?: string;
}

// ---------------------------------------------------------------------
// Navigation model
// ---------------------------------------------------------------------
type NavGroupId =
  | "account"
  | "content"
  | "ai"
  | "bots"
  | "gold"
  | "admin";

interface NavItem {
  view: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  group: NavGroupId;
  adminOnly?: boolean;
  /** When set, the item is visible only if the user's active plan grants
   *  this feature (or the user is an admin). When absent, the item is
   *  always visible. Mirrors the FEATURE_CATALOG keys. */
  featureKey?: PlanBooleanFeatureKey;
}

const NAV: NavItem[] = [
  // ===== Group: account (always-on essentials + subscription items) =====
  { view: "home", label: "خانه", icon: LayoutGridIcon, group: "account" },
  { view: "stats", label: "آمار", icon: BarChart3Icon, group: "account", featureKey: "stats" },
  { view: "subscriptions", label: "اشتراک", icon: PackageIcon, group: "account" },
  { view: "plans", label: "پلن‌ها", icon: SparklesIcon, group: "account" },
  { view: "payment", label: "تسویه‌حساب", icon: CreditCardIcon, group: "account" },
  { view: "orders", label: "سفارش‌ها", icon: ListOrderedIcon, group: "account" },
  { view: "wallet", label: "کیف پول", icon: WalletIcon, group: "account", featureKey: "wallet" },
  { view: "ledger", label: "دفتر کل", icon: BookOpenIcon, group: "account", featureKey: "wallet" },
  { view: "referral", label: "معرفی دوستان", icon: GiftIcon, group: "account", featureKey: "referral" },
  { view: "advertising", label: "تبلیغات", icon: MegaphoneIcon, group: "account", featureKey: "advertising" },
  { view: "tickets", label: "تیکت‌ها", icon: TicketIcon, group: "account", featureKey: "tickets" },
  { view: "notifications", label: "اعلان‌ها", icon: BellIcon, group: "account" },
  { view: "profile", label: "پروفایل", icon: UserIcon, group: "account" },
  { view: "training", label: "آموزش", icon: GraduationCapIcon, group: "account" },
  // ===== Group: content (محتوا) =====
  { view: "content", label: "مدیریت محتوا", icon: FileTextIcon, group: "content", featureKey: "publish" },
  { view: "content-editor", label: "ویرایشگر محتوا", icon: SparklesIcon, group: "content", featureKey: "publish" },
  { view: "destinations", label: "مقاصد", icon: SendIcon, group: "content", featureKey: "multiChannel" },
  { view: "glass-buttons", label: "دکمه‌های شیشه‌ای", icon: LayoutGridIcon, group: "content", featureKey: "glassButtons" },
  { view: "woo", label: "ووکامرس", icon: ShoppingCartIcon, group: "content", featureKey: "woo" },
  // ===== Group: ai (هوش مصنوعی) =====
  { view: "ai-caption", label: "ساخت کپشن", icon: SparklesIcon, group: "ai", featureKey: "caption" },
  { view: "ai-text", label: "متن هوشمند", icon: Wand2Icon, group: "ai", featureKey: "smartText" },
  { view: "smart-reply", label: "پاسخ هوشمند", icon: MessageCircleIcon, group: "ai", featureKey: "smartReply" },
  { view: "auto-responder", label: "پاسخگوی خودکار", icon: ZapIcon, group: "ai", featureKey: "autoResponder" },
  { view: "inbox", label: "صندوق پیام‌ها", icon: InboxIcon, group: "ai", featureKey: "inbox" },
  // ===== Group: gold (طلا) =====
  { view: "gold", label: "قیمت طلا", icon: TrendingUpIcon, group: "gold", featureKey: "goldMonitor" },
  { view: "gold-bot", label: "بات طلا", icon: TrendingUpIcon, group: "gold", featureKey: "goldBot" },
  // ===== Group: bots (بات و اتوماسیون) =====
  { view: "bots", label: "بات‌ها", icon: BotIcon, group: "bots", featureKey: "bot" },
  { view: "bot-workflow", label: "گردش کار", icon: PencilRulerIcon, group: "bots", featureKey: "workflow" },
  { view: "bot-link", label: "کدهای اتصال", icon: RadioIcon, group: "bots", featureKey: "linkCodes" },
  { view: "bot-history", label: "تاریخچه ربات", icon: InboxIcon, group: "bots", featureKey: "bot" },
  { view: "bot-broadcast", label: "پیام گروهی", icon: SendIcon, group: "bots", featureKey: "broadcast" },
  // ===== Group: admin (مدیریت سامانه — adminOnly) =====
  { view: "admin-stats", label: "آمار سامانه", icon: BarChart3Icon, group: "admin", adminOnly: true },
  { view: "admin-users", label: "کاربران", icon: UsersIcon, group: "admin", adminOnly: true },
  { view: "admin-plans", label: "پلن‌ها", icon: PackageIcon, group: "admin", adminOnly: true },
  { view: "admin-audit", label: "ممیزی", icon: ShieldCheckIcon, group: "admin", adminOnly: true },
  { view: "admin-health", label: "وضعیت سامانه", icon: ActivityIcon, group: "admin", adminOnly: true },
  { view: "admin-ads", label: "تبلیغات", icon: MegaphoneIcon, group: "admin", adminOnly: true },
  { view: "admin-discounts", label: "تخفیف‌ها", icon: CreditCardIcon, group: "admin", adminOnly: true },
  { view: "admin-bank-cards", label: "کارت‌های بانکی", icon: CreditCardIcon, group: "admin", adminOnly: true },
  // New (revamp2-orders-wallet agent): better than the legacy admin-orders.
  { view: "admin-orders-review", label: "بازبینی سفارش‌ها", icon: ListOrderedIcon, group: "admin", adminOnly: true },
  { view: "admin-orders", label: "سفارش‌ها (قدیمی)", icon: ListOrderedIcon, group: "admin", adminOnly: true },
  { view: "admin-subscriptions", label: "اشتراک‌ها", icon: PackageIcon, group: "admin", adminOnly: true },
  { view: "admin-bots", label: "بات‌های سامانه", icon: BotIcon, group: "admin", adminOnly: true },
  { view: "admin-woo", label: "ووکامرس", icon: ShoppingCartIcon, group: "admin", adminOnly: true },
  { view: "admin-gold", label: "بات‌های طلا", icon: TrendingUpIcon, group: "admin", adminOnly: true },
  { view: "admin-broadcast", label: "اعلان گروهی", icon: MegaphoneIcon, group: "admin", adminOnly: true },
  { view: "admin-tickets", label: "تیکت‌ها", icon: TicketIcon, group: "admin", adminOnly: true },
  { view: "admin-settings", label: "تنظیمات", icon: SettingsIcon, group: "admin", adminOnly: true },
];

// ---------------------------------------------------------------------
// Collapsible group metadata
// ---------------------------------------------------------------------
interface NavGroupMeta {
  id: NavGroupId;
  label: string;
  adminOnly?: boolean;
  // When true, the group is expanded by default for new sessions.
  defaultOpen?: boolean;
}

const NAV_GROUPS: NavGroupMeta[] = [
  { id: "account", label: "حساب کاربری", defaultOpen: true },
  { id: "content", label: "محتوا" },
  { id: "ai", label: "هوش مصنوعی" },
  { id: "bots", label: "بات و اتوماسیون" },
  { id: "gold", label: "طلا" },
  { id: "admin", label: "مدیریت سامانه", adminOnly: true },
];

const NAV_GROUPS_STORAGE_KEY = "postyar_nav_groups";

// Persian role labels (addendum §23 — no Latin role string in UI).
// Technical identifiers remain Latin internally; only the rendered
// label is localized.
function roleFa(role: string | undefined | null): string {
  switch (role) {
    case "admin": return "مدیر";
    case "support": return "پشتیبان";
    case "user": return "کاربر";
    default: return "—";
  }
}

// ---------------------------------------------------------------------
// Feature gating
// ---------------------------------------------------------------------

/**
 * Decide whether a single nav item should be visible.
 *  - Admin users see EVERYTHING (all admin items + all user items
 *    regardless of plan).
 *  - Otherwise: visible if the item has no `featureKey` OR the user's
 *    active plan grants that feature.
 */
function isVisible(item: NavItem, isAdmin: boolean, features: PlanFeatures | null): boolean {
  if (item.adminOnly) return isAdmin;
  if (isAdmin) return true; // admin sees every user-facing module too
  if (!item.featureKey) return true;
  if (!features) return false;
  const v = features[item.featureKey];
  return typeof v === "boolean" ? v : false;
}

/**
 * Decide whether the user can access the current view (used to render the
 * upgrade card when they land on a gated view directly via URL).
 */
function isViewGranted(view: string, isAdmin: boolean, features: PlanFeatures | null): boolean {
  const item = NAV.find((n) => n.view === view);
  if (!item) return true; // unknown views fall through to NotImplemented
  return isVisible(item, isAdmin, features);
}

// ---------------------------------------------------------------------
// Collapsible nav group (Item 5)
// ---------------------------------------------------------------------
function NavGroup({
  group,
  items,
  active,
  onNavigate,
  open,
  onToggle,
}: {
  group: NavGroupMeta;
  items: NavItem[];
  active: string;
  onNavigate: (view: string) => void;
  open: boolean;
  onToggle: (id: NavGroupId) => void;
}) {
  if (items.length === 0) return null;
  const Icon = group.id === "account"
    ? UserCogIcon
    : group.id === "content"
      ? FileTextIcon
      : group.id === "ai"
        ? SparklesIcon
        : group.id === "bots"
          ? BotIcon
          : group.id === "gold"
            ? TrendingUpIcon
            : ServerIcon;
  return (
    <Collapsible open={open} onOpenChange={(v) => { if (v !== open) onToggle(group.id); }} dir="rtl">
      <CollapsibleTrigger
        className={cn(
          "group flex w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-xs font-semibold text-foreground transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          open ? "bg-muted/60" : "hover:bg-muted/40",
        )}
      >
        <span className="flex items-center gap-2">
          <Icon className="size-4 text-primary" />
          <span>{group.label}</span>
          <Badge variant="secondary" className="tabular-nums px-1.5 py-0 text-[10px]">
            {toPersianDigits(items.length)}
          </Badge>
        </span>
        <ChevronDownIcon
          className={cn(
            "size-4 text-muted-foreground transition-transform motion-safe:duration-200",
            open ? "rotate-180" : "rotate-0",
          )}
        />
      </CollapsibleTrigger>
      <CollapsibleContent className="flex flex-col gap-0.5 ps-2 pt-1">
        {items.map((item) => (
          <NavLink key={item.view} item={item} active={active} onNavigate={onNavigate} />
        ))}
      </CollapsibleContent>
    </Collapsible>
  );
}

function NavLink({
  item,
  active,
  onNavigate,
}: {
  item: NavItem;
  active: string;
  onNavigate: (view: string) => void;
}) {
  const Icon = item.icon;
  const isActive = active === item.view;
  return (
    <button
      type="button"
      onClick={() => onNavigate(item.view)}
      aria-current={isActive ? "page" : undefined}
      className={cn(
        "nav-item-link flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        isActive
          ? "bg-primary/10 text-primary border-s-2 border-s-primary font-medium"
          : "text-muted-foreground hover:bg-muted hover:text-foreground border-s-2 border-s-transparent",
      )}
    >
      <Icon className="size-4 shrink-0" />
      <span className="truncate">{item.label}</span>
    </button>
  );
}

function SideNav({
  active,
  onNavigate,
  onSignOut,
  userName,
  userRole,
  forceUserMode = false,
  features,
}: {
  active: string;
  onNavigate: (view: string) => void;
  onSignOut: () => void;
  userName: string;
  userRole?: string;
  forceUserMode?: boolean;
  features: PlanFeatures | null;
}) {
  const isAdmin = userRole === "admin";
  const showAdminGroup = isAdmin && !forceUserMode;

  // Persist expand state per user (Item 5). Default: account + the active
  // group expanded, others collapsed. The hook is in the parent so the
  // state survives re-renders of NavLink (which happens on every nav click).
  const [openGroups, setOpenGroups] = useState<Record<NavGroupId, boolean>>(() => {
    if (typeof window === "undefined") return { account: true } as Record<NavGroupId, boolean>;
    try {
      const raw = window.localStorage.getItem(NAV_GROUPS_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<Record<NavGroupId, boolean>>;
        const base: Record<NavGroupId, boolean> = {
          account: true, content: false, ai: false, bots: false, gold: false, admin: false,
        };
        return { ...base, ...parsed } as Record<NavGroupId, boolean>;
      }
    } catch {
      /* storage may be unavailable — fall through to defaults */
    }
    return { account: true } as Record<NavGroupId, boolean>;
  });

  // Find which group the active item belongs to. If that group is closed,
  // open it (so the active item is always reachable).
  useEffect(() => {
    const activeItem = NAV.find((n) => n.view === active);
    if (!activeItem) return;
    if (!openGroups[activeItem.group]) {
      setOpenGroups((cur) => ({ ...cur, [activeItem.group]: true }));
    }
  }, [active, openGroups]);

  function toggle(id: NavGroupId) {
    setOpenGroups((cur) => {
      const next = { ...cur, [id]: !cur[id] };
      try {
        window.localStorage.setItem(NAV_GROUPS_STORAGE_KEY, JSON.stringify(next));
      } catch {
        /* ignore storage errors */
      }
      return next;
    });
  }

  return (
    <div className="flex h-full flex-col" dir="rtl">
      <nav className="flex flex-1 flex-col gap-2 overflow-y-auto p-2">
        {NAV_GROUPS.filter((g) => !g.adminOnly || showAdminGroup).map((g) => {
          const items = NAV.filter((n) => n.group === g.id && isVisible(n, isAdmin, features));
          return (
            <NavGroup
              key={g.id}
              group={g}
              items={items}
              active={active}
              onNavigate={onNavigate}
              open={openGroups[g.id] ?? false}
              onToggle={toggle}
            />
          );
        })}
      </nav>

      {/* User card + ad slot at the very bottom of the sidebar */}
      <div className="mt-2 flex flex-col gap-3 border-t p-2">
        <AdSlot placement="user_dashboard_sidebar" />
        <div className="rounded-md border bg-muted/40 p-3 text-xs">
          <div className="text-muted-foreground">کاربر</div>
          <div className="mt-1 truncate font-medium">{userName}</div>
          {userRole && (
            <div className="mt-1 text-[10px] text-muted-foreground">
              نقش: {roleFa(userRole)}
            </div>
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={onSignOut}
          className="justify-start gap-2 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <LogOutIcon className="size-4" />
          خروج
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------
// Redesigned home view (Item 7)
// ---------------------------------------------------------------------
type HomeStats = {
  totalContents: number;
  totalDestinations: number;
  totalPublishes: number;
  totalViews: number;
};

type HomeUsage = {
  hasActivePlan: boolean;
  planName: string | null;
  planCode: string | null;
  remainingDays: number | null;
  endsAt: string | null;
};

type HomeNotification = {
  id: string;
  titleFa: string;
  createdAt: string;
  read: boolean;
};

type HomePublish = {
  id: string;
  title: string;
  deliveredAt: string | null;
  status: string;
};

function HomeKpiCard({
  Icon,
  tint,
  label,
  value,
}: {
  Icon: LucideIcon;
  tint: string;
  label: string;
  value: string;
}) {
  return (
    <Card className="gap-1 p-3">
      <div className="flex items-center gap-2">
        <div className={cn("rounded-md p-1.5", tint)}>
          <Icon className="size-4" />
        </div>
        <span className="text-[11px] text-muted-foreground">{label}</span>
      </div>
      <div className="text-xl font-bold tabular-nums">{value}</div>
    </Card>
  );
}

function HomeQuickAction({
  Icon,
  label,
  hint,
  onClick,
}: {
  Icon: LucideIcon;
  label: string;
  hint: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col items-start gap-2 rounded-lg border bg-card p-3 text-right transition-colors hover:bg-muted/50 hover:border-primary/40 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-safe:transition-all motion-safe:hover:-translate-y-0.5"
    >
      <div className="rounded-md bg-primary/10 p-2 text-primary">
        <Icon className="size-5" />
      </div>
      <div>
        <div className="text-sm font-medium">{label}</div>
        <div className="text-[11px] text-muted-foreground">{hint}</div>
      </div>
    </button>
  );
}

function HomeView({
  navigate,
  firstName,
}: {
  navigate: (to: string) => void;
  firstName: string;
}) {
  const [stats, setStats] = useState<HomeStats | null>(null);
  const [usage, setUsage] = useState<HomeUsage | null>(null);
  const [notifications, setNotifications] = useState<HomeNotification[]>([]);
  const [recentPublishes, setRecentPublishes] = useState<HomePublish[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const [statsRes, usageRes, notifRes] = await Promise.all([
          fetch("/api/stats/me", { credentials: "same-origin" }),
          fetch("/api/me/usage", { credentials: "same-origin" }),
          fetch("/api/notifications?limit=3&offset=0", { credentials: "same-origin" }),
        ]);
        const statsJson = statsRes.ok ? await statsRes.json() : null;
        const usageJson = usageRes.ok ? await usageRes.json() : null;
        const notifJson = notifRes.ok ? await notifRes.json() : null;
        if (cancelled) return;
        if (statsJson?.summary) {
          setStats({
            totalContents: statsJson.summary.totalContents ?? 0,
            totalDestinations: statsJson.summary.totalDestinations ?? 0,
            totalPublishes: statsJson.summary.totalPublishes ?? 0,
            totalViews: statsJson.summary.totalViews ?? 0,
          });
        }
        if (usageJson) {
          setUsage({
            hasActivePlan: Boolean(usageJson.hasActivePlan),
            planName: usageJson.planName ?? null,
            planCode: usageJson.planCode ?? null,
            remainingDays: usageJson.remainingDays ?? null,
            endsAt: usageJson.endsAt ?? null,
          });
        }
        if (notifJson?.items) {
          setNotifications(notifJson.items as HomeNotification[]);
        }
      } catch {
        /* swallow — the home view degrades gracefully */
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  const hasPlan = usage?.hasActivePlan && (usage.remainingDays ?? 0) > 0;

  return (
    <div className="flex flex-col gap-5" dir="rtl">
      {/* Welcome header */}
      <div className="rounded-xl border bg-gradient-to-l from-primary/10 via-card to-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold sm:text-2xl">
              خوش آمدی، {firstName || "کاربر پُست‌یار"}
            </h1>
            <p className="mt-1 text-xs text-muted-foreground">
              {hasPlan
                ? `پلن فعال: ${usage?.planName ?? "—"}`
                : "بدون پلن فعال — برای دسترسی به همهٔ قابلیت‌ها یک پلن انتخاب کنید."}
            </p>
          </div>
          {hasPlan ? (
            <Badge variant="secondary" className="gap-1.5 px-3 py-1.5 text-xs">
              <PackageIcon className="size-3.5" />
              {toPersianDigits(usage?.remainingDays ?? 0)} روز باقی‌مانده
            </Badge>
          ) : (
            <Button
              variant="default"
              size="sm"
              onClick={() => navigate("/dashboard/plans")}
              className="gap-1.5 cursor-pointer"
            >
              <SparklesIcon className="size-4" />
              ارتقای پلن
            </Button>
          )}
        </div>
      </div>

      {/* Inline KPI strip */}
      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <BarChart3Icon className="size-4 text-primary" />
            نمای کلی
          </h2>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate("/dashboard/stats")}
            className="gap-1.5 cursor-pointer text-xs"
          >
            مشاهدهٔ آمار کامل
          </Button>
        </div>
        {loading ? (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-24 w-full" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <HomeKpiCard Icon={FileTextIcon} tint="bg-teal-100 text-teal-700" label="محتوا" value={toPersianDigits(stats?.totalContents ?? 0)} />
            <HomeKpiCard Icon={LayoutGridIcon} tint="bg-sky-100 text-sky-700" label="کانال‌ها / مقاصد" value={toPersianDigits(stats?.totalDestinations ?? 0)} />
            <HomeKpiCard Icon={SendIcon} tint="bg-emerald-100 text-emerald-700" label="انتشار" value={toPersianDigits(stats?.totalPublishes ?? 0)} />
            <HomeKpiCard Icon={ActivityIcon} tint="bg-violet-100 text-violet-700" label="بازدید" value={toPersianDigits(stats?.totalViews ?? 0)} />
          </div>
        )}
      </section>

      {/* Quick actions */}
      <section>
        <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold">
          <ZapIcon className="size-4 text-primary" />
          دسترسی سریع
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <HomeQuickAction Icon={PlusIcon} label="ساخت محتوا" hint="ویرایشگر محتوا" onClick={() => navigate("/dashboard/content-editor")} />
          <HomeQuickAction Icon={SendIcon} label="افزودن مقصد" hint="کانال‌های انتشار" onClick={() => navigate("/dashboard/destinations")} />
          <HomeQuickAction Icon={BotIcon} label="ساخت بات" hint="بات‌ساز تلگرام/بله" onClick={() => navigate("/dashboard/bots")} />
          <HomeQuickAction Icon={WalletIcon} label="شارژ کیف پول" hint="افزایش موجودی" onClick={() => navigate("/dashboard/wallet")} />
          <HomeQuickAction Icon={TicketIcon} label="تیکت پشتیبانی" hint="پشتیبانی پُست‌یار" onClick={() => navigate("/dashboard/tickets")} />
          <HomeQuickAction Icon={GraduationCapIcon} label="آموزش" hint="راهنمای گام‌به‌گام" onClick={() => navigate("/dashboard/training")} />
        </div>
      </section>

      {/* Recent activity */}
      <section>
        <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold">
          <BellIcon className="size-4 text-primary" />
          آخرین اعلان‌ها
        </h2>
        {loading ? (
          <Skeleton className="h-24 w-full" />
        ) : notifications.length === 0 ? (
          <Card className="p-4 text-xs text-muted-foreground">
            اعلان جدیدی برای نمایش وجود ندارد.
          </Card>
        ) : (
          <Card className="divide-y">
            {notifications.map((n) => (
              <button
                key={n.id}
                type="button"
                onClick={() => navigate("/dashboard/notifications")}
                className="flex w-full items-start gap-3 p-3 text-right transition-colors hover:bg-muted/50 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <div className={cn("mt-1 size-2 shrink-0 rounded-full", n.read ? "bg-muted-foreground/30" : "bg-primary")} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{n.titleFa || "اعلان"}</div>
                  <div className="text-[11px] text-muted-foreground">
                    {n.createdAt ? formatJalaliDate(n.createdAt) : "—"}
                  </div>
                </div>
              </button>
            ))}
          </Card>
        )}
      </section>
    </div>
  );
}

function NotImplemented({ name }: { name: string }) {
  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center gap-2 text-center" dir="rtl">
      <BotIcon className="size-8 text-muted-foreground" />
      <div className="text-sm font-medium">بخش «{name}» هنوز پیاده‌سازی نشده است.</div>
      <div className="max-w-md text-xs text-muted-foreground">
        این بخش توسط یکی از عامل‌های دیگر توسعه داده می‌شود.
      </div>
    </div>
  );
}

/** Upgrade card shown when a non-admin user lands on a gated view (Item 9). */
function UpgradeRequired({ navigate }: { navigate: (to: string) => void }) {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 text-center" dir="rtl">
      <div className="flex size-14 items-center justify-center rounded-full bg-amber-100 text-amber-700">
        <SparklesIcon className="size-7" />
      </div>
      <div className="text-base font-semibold">ارتقای پلن لازم است</div>
      <div className="max-w-md text-xs text-muted-foreground">
        این بخش جزئی از پلن فعلی شما نیست. برای دسترسی به این قابلیت، لطفاً پلن خود را ارتقا دهید.
      </div>
      <Button
        variant="default"
        size="sm"
        onClick={() => navigate("/dashboard/plans")}
        className="gap-1.5 cursor-pointer"
      >
        <SparklesIcon className="size-4" />
        ارتقای پلن
      </Button>
    </div>
  );
}

// Bottom mobile navbar — quick-access for the 5 key destinations. Visible
// ONLY on < lg screens (lg:hidden) so it never collides with the desktop
// sidebar. The center "انتشار" button is elevated (-mt-6) to act as a FAB.
function BottomNav({
  active,
  onNavigate,
}: {
  active: string;
  onNavigate: (view: string) => void;
}) {
  const items: {
    view: string;
    label: string;
    Icon: React.ComponentType<{ className?: string }>;
    elevated?: boolean;
  }[] = [
    { view: "home", label: "خانه", Icon: LayoutGridIcon },
    { view: "destinations", label: "کانال‌ها", Icon: SendIcon },
    { view: "content-editor", label: "انتشار", Icon: PlusIcon, elevated: true },
    { view: "notifications", label: "اعلان‌ها", Icon: BellIcon },
    { view: "profile", label: "پروفایل", Icon: UserIcon },
  ];
  return (
    <nav
      dir="rtl"
      aria-label="ناوبری پایین صفحه"
      className="fixed inset-x-0 bottom-0 z-30 flex items-stretch justify-between gap-1 border-t bg-background/95 px-2 backdrop-blur lg:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      {items.map((it) => {
        const Icon = it.Icon;
        const isActive = active === it.view;
        if (it.elevated) {
          return (
            <button
              key={it.view}
              type="button"
              onClick={() => onNavigate(it.view)}
              aria-label={it.label}
              aria-current={isActive ? "page" : undefined}
              className="flex flex-1 flex-col items-center justify-end gap-0.5 pb-1 pt-2 text-[11px] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="-mt-6 flex size-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform motion-safe:hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <Icon className="size-6" />
              </span>
              <span className={isActive ? "font-medium text-primary" : "text-muted-foreground"}>
                {it.label}
              </span>
            </button>
          );
        }
        return (
          <button
            key={it.view}
            type="button"
            onClick={() => onNavigate(it.view)}
            aria-label={it.label}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[11px] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              isActive ? "text-primary" : "text-muted-foreground",
            )}
          >
            <Icon className="size-5" />
            <span className={isActive ? "font-medium" : ""}>{it.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

// ---------------------------------------------------------------------
// Dashboard root
// ---------------------------------------------------------------------
export function Dashboard({ navigate, initialView, param }: DashboardProps) {
  const { user, signOut } = useSession();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  // Admin ↔ User mode toggle. Lets an admin "use the app as a regular user"
  // (user-mode hides admin-only nav + admin views render as inaccessible
  // surfaces). Defaults to "admin" so admins always start in the admin panel;
  // non-admins never see the toggle at all.
  const [mode, setMode] = useState<"admin" | "user">("admin");

  // Subscription gating (Item 9): fetch /api/me/usage once and keep the
  // parsed planFeatures around. Until loaded, treat as "all features
  // granted" so admins + new sessions see the full nav (better UX than
  // hiding everything until the fetch resolves).
  const [features, setFeatures] = useState<PlanFeatures | null>(null);
  const [featuresLoaded, setFeaturesLoaded] = useState(false);

  // Strip any ?query from initialView/param (in case the editor is opened
  // with ?action=publish — the editor itself surfaces the publish actions).
  const cleanView = useMemo(() => initialView.split("?")[0] ?? initialView, [initialView]);
  const cleanParam = useMemo(() => (param ? param.split("?")[0] : undefined), [param]);

  // Scroll-to-top on nav change (Item 6). Both the scrollable main wrapper
  // (when present on mobile/desktop with overflow) AND the window are reset
  // so the new view always starts at its top.
  const mainScrollRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (mainScrollRef.current) {
      mainScrollRef.current.scrollTo({ top: 0, behavior: "smooth" });
    }
    // Fallback: scroll the window itself (some layouts have no inner scroll).
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, [cleanView, cleanParam]);

  // Fetch the user's plan features once. We deliberately swallow errors —
  // on failure, the dashboard falls back to "all account essentials only"
  // (since features stay null → gated items are hidden for non-admins).
  useEffect(() => {
    let cancelled = false;
    fetch("/api/me/usage", { credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled || !d) return;
        setFeatures((d.planFeatures as PlanFeatures) ?? {});
      })
      .catch(() => undefined)
      .finally(() => { if (!cancelled) setFeaturesLoaded(true); });
    return () => { cancelled = true; };
  }, []);

  function onSignOut() {
    void signOut();
    navigate("/");
  }
  function onNavigate(view: string) {
    navigate(`/dashboard/${view}`);
    setSidebarOpen(false);
  }

  const isAdmin = user?.role === "admin";
  // Admins in admin mode (or while features are loading) bypass gating.
  // While features are still loading for a non-admin, we render the
  // "essentials only" nav (since features === null ⇒ all gated items
  // hidden), but the renderView path still allows the current view to
  // render so the user isn't blocked while the fetch resolves.
  const gatingActive = featuresLoaded && !isAdmin;
  const viewGranted = !gatingActive || isViewGranted(cleanView, isAdmin, features);

  function renderView(): ReactNode {
    // Subscription gate: if the user landed on a gated view (via URL),
    // show the upgrade card instead of the view.
    if (gatingActive && !viewGranted) {
      return <UpgradeRequired navigate={navigate} />;
    }
    switch (cleanView) {
      case "home":
        return <HomeView navigate={navigate} firstName={user?.firstName ?? ""} />;
      case "stats":
        return <StatsView navigate={navigate} />;
      case "content":
        return <ContentManagerView navigate={navigate} />;
      case "content-editor":
        return <ContentEditorView contentId={cleanParam} navigate={navigate} />;
      case "destinations":
        return <DestinationsView navigate={navigate} />;
      case "glass-buttons":
        // destinationId is optional — when absent, the view shows the
        // preset library (destination-less glass buttons).
        return <GlassButtonsView destinationId={cleanParam || undefined} navigate={navigate} />;
      case "plans":
        return <PlansView navigate={navigate} />;
      case "payment":
        if (!cleanParam) return <NotImplemented name="تسویه‌حساب (بدون پلن)" />;
        return <PaymentView planId={cleanParam} navigate={navigate} />;
      case "orders":
        return <OrdersView navigate={navigate} />;
      case "wallet":
        return <WalletView navigate={navigate} />;
      case "ledger":
        return <LedgerView navigate={navigate} />;
      case "referral":
        return <ReferralView navigate={navigate} />;
      case "subscriptions":
        return <SubscriptionsView navigate={navigate} />;
      case "profile":
        return <ProfileView navigate={navigate} />;
      case "training":
        return <Training navigate={navigate} />;
      // ===== Task 10-C views =====
      case "ai-caption":
        return <AiCaptionView navigate={navigate} />;
      case "ai-text":
        return <AiTextView />;
      case "smart-reply":
        return <SmartReplyView />;
      case "auto-responder":
        return <AutoResponderView />;
      case "inbox":
        return <InboxView />;
      case "gold":
        return <GoldView />;
      case "gold-bot":
        return <GoldBotView />;
      case "woo":
        return <WooView navigate={navigate} />;
      case "tickets":
        return <TicketsView navigate={navigate} />;
      case "ticket":
        if (!cleanParam) return <NotImplemented name="تیکت (بدون شناسه)" />;
        return <TicketDetailView ticketId={cleanParam} navigate={navigate} />;
      case "notifications":
        return <NotificationsView navigate={navigate} />;
      case "advertising":
        return <AdvertisingView navigate={navigate} />;
      // ===== Task 10-D — Bot Builder views =====
      case "bots":
        return <BotsListView navigate={navigate} />;
      case "bot-workflow":
        // botId is optional — when absent, the view shows all the user's
        // workflows across bots + a bot-less templates section.
        return <BotWorkflowView botId={cleanParam || undefined} navigate={navigate} />;
      case "bot-link":
        // botId is optional — when absent, the view shows all the user's
        // link codes across bots + a personal-codes section.
        return <BotLinkView botId={cleanParam || undefined} navigate={navigate} />;
      case "bot-history":
        // botId is optional — when absent, the view shows the unified
        // history across all the user's bots (filterable).
        return <BotHistoryView botId={cleanParam || undefined} navigate={navigate} />;
      case "bot-broadcast":
        // botId is optional — when absent, the view broadcasts to
        // destinations (channels) directly instead of bot users.
        return <BotBroadcastView botId={cleanParam || undefined} navigate={navigate} />;
      // ===== Task 10-D — Admin Panel views =====
      case "admin-stats":
        return <AdminStatsView navigate={navigate} />;
      case "admin-users":
        return <AdminUsersView navigate={navigate} />;
      case "admin-plans":
        return <AdminPlansView navigate={navigate} />;
      case "admin-audit":
        return <AdminAuditView navigate={navigate} />;
      case "admin-health":
        return <AdminHealthView navigate={navigate} />;
      case "admin-ads":
        return <AdminAdsView navigate={navigate} />;
      case "admin-discounts":
        return <AdminDiscountsView navigate={navigate} />;
      case "admin-bank-cards":
        return <AdminBankCardsView navigate={navigate} />;
      case "admin-orders":
        return <AdminOrdersView navigate={navigate} />;
      case "admin-orders-review":
        return <AdminOrdersReviewView navigate={navigate} />;
      case "admin-subscriptions":
        return <AdminSubscriptionsView navigate={navigate} />;
      case "admin-bots":
        return <AdminBotsView navigate={navigate} />;
      case "admin-woo":
        return <AdminWooView navigate={navigate} />;
      case "admin-gold":
        return <AdminGoldView navigate={navigate} />;
      case "admin-broadcast":
        return <AdminBroadcastView navigate={navigate} />;
      case "admin-tickets":
        return <AdminTicketsView navigate={navigate} />;
      case "admin-settings":
        return <AdminSettingsView navigate={navigate} />;
      default:
        return <NotImplemented name={cleanView} />;
    }
  }

  const userName = user ? `${user.firstName} ${user.lastName}` : "کاربر پُست‌یار";

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-b from-muted/30 via-background to-background" dir="rtl">
      {/* Sticky ad bar (top) — fixed across the dashboard. Other agents
          built this; we just mount it once at the root. */}
      <StickyAdBar placement="sticky_bar" position="top" />

      {/* Top bar */}
      <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <Button
          variant="ghost"
          size="icon"
          className="lg:hidden cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={() => setSidebarOpen((v) => !v)}
          aria-label="نمایش نوار کناری"
        >
          {sidebarOpen ? <XIcon className="size-5" /> : <MenuIcon className="size-5" />}
        </Button>
        <Logo size={28} />
        <HeaderClock className="hidden sm:block" />
        <div className="flex-1" />
        {/* Admin ↔ User mode toggle — admins only. Lets an admin switch back
            and forth between the admin panel and the regular-user surface. */}
        {user?.role === "admin" && (
          <Button
            variant={mode === "admin" ? "outline" : "default"}
            size="sm"
            onClick={() => setMode((m) => (m === "admin" ? "user" : "admin"))}
            aria-pressed={mode === "user"}
            className="gap-1.5 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {mode === "admin" ? (
              <>
                <LayoutGridIcon className="size-4" />
                <span className="hidden sm:inline">دیدن به‌عنوان کاربر</span>
                <span className="sm:hidden">کاربر</span>
              </>
            ) : (
              <>
                <ShieldCheckIcon className="size-4" />
                <span className="hidden sm:inline">بازگشت به پنل مدیریت</span>
                <span className="sm:hidden">مدیر</span>
              </>
            )}
          </Button>
        )}
        <NotificationBell />
        <div className="hidden text-xs text-muted-foreground sm:block">
          کاربر: {userName} • نقش: {roleFa(user?.role)}
        </div>
      </header>

      <div className="flex flex-1">
        {/* Sidebar — fixed on lg, drawer on smaller */}
        <aside
          className={cn(
            "fixed lg:static inset-y-0 right-0 z-30 w-64 border-l bg-card/40 backdrop-blur transition-transform lg:translate-x-0 lg:border-l-0 lg:bg-transparent lg:backdrop-blur-none",
            sidebarOpen ? "translate-x-0" : "translate-x-full lg:translate-x-0",
          )}
          style={{ top: "3.5rem" }}
        >
          <div className="flex h-full flex-col">
            <SideNav
              active={cleanView}
              onNavigate={onNavigate}
              onSignOut={onSignOut}
              userName={userName}
              userRole={user?.role}
              forceUserMode={user?.role === "admin" && mode === "user"}
              features={features}
            />
          </div>
        </aside>
        {sidebarOpen && (
          <div
            className="fixed inset-0 z-20 bg-black/40 lg:hidden"
            onClick={() => setSidebarOpen(false)}
            aria-hidden="true"
          />
        )}

        {/* Main — extra bottom padding on mobile so the fixed bottom navbar
            never covers content (lg:pb-6 restores the original desktop spacing). */}
        <main
          ref={mainScrollRef}
          className="flex-1 p-4 pb-24 lg:p-6 lg:pb-6"
          dir="rtl"
        >
          <div className="mx-auto flex max-w-6xl flex-col gap-4">
            {/* Ad slot at the very top of the dashboard main content area.
                Empty state renders nothing — non-intrusive. */}
            <AdSlot placement="user_dashboard_top" />
            {renderView()}
          </div>
        </main>
      </div>

      {/* Bottom mobile navbar — quick access to the 5 key destinations.
          Visible ONLY on < lg so it never collides with the desktop sidebar. */}
      <BottomNav active={cleanView} onNavigate={onNavigate} />

      <footer className="mt-auto border-t bg-background/80 py-3 text-center text-xs text-muted-foreground" dir="rtl">
        پُست‌یار © {toPersianDigits(new Date().getFullYear() - 621)} — نسخهٔ پیش‌نمایش
      </footer>
    </div>
  );
}

export default Dashboard;
