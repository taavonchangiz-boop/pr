"use client";
// POSTYAR — Dashboard
// ---------------------------------------------------------------------
// Sidebar with navigation links + a main area that routes to the available
// views. Wires views from Task 10-A (content / destinations / glass-
// buttons), Task 10-B (payment / wallet / ledger / referral /
// subscriptions / profile) and Task 10-C (AI tools / inbox / gold / woo /
// tickets / notifications / advertising).
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  ActivityIcon,
  BellIcon,
  BookOpenIcon,
  CreditCardIcon,
  FileTextIcon,
  GiftIcon,
  InboxIcon,
  LayoutGridIcon,
  ListOrderedIcon,
  LogOutIcon,
  MegaphoneIcon,
  MenuIcon,
  MessageCircleIcon,
  PackageIcon,
  PencilRulerIcon,
  RadioIcon,
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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSession } from "@/components/layout/session-provider";
import { cn } from "@/lib/utils";
import { toPersianDigits } from "@/lib/persian";

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

interface NavItem {
  view: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  group: "content" | "account" | "ai" | "channels" | "bots" | "admin";
  adminOnly?: boolean;
}

const NAV: NavItem[] = [
  { view: "home", label: "خانه", icon: LayoutGridIcon, group: "account" },
  { view: "subscriptions", label: "اشتراک", icon: PackageIcon, group: "account" },
  { view: "plans", label: "پلن‌ها", icon: SparklesIcon, group: "account" },
  { view: "payment", label: "تسویه‌حساب", icon: CreditCardIcon, group: "account" },
  { view: "orders", label: "سفارش‌ها", icon: ListOrderedIcon, group: "account" },
  { view: "wallet", label: "کیف پول", icon: WalletIcon, group: "account" },
  { view: "ledger", label: "دفتر کل", icon: BookOpenIcon, group: "account" },
  { view: "referral", label: "معرفی دوستان", icon: GiftIcon, group: "account" },
  { view: "advertising", label: "تبلیغات", icon: MegaphoneIcon, group: "account" },
  { view: "tickets", label: "تیکت‌ها", icon: TicketIcon, group: "account" },
  { view: "notifications", label: "اعلان‌ها", icon: BellIcon, group: "account" },
  { view: "profile", label: "پروفایل", icon: UserIcon, group: "account" },
  // محتوا و انتشار
  { view: "content", label: "مدیریت محتوا", icon: FileTextIcon, group: "content" },
  { view: "content-editor", label: "ویرایشگر محتوا", icon: SparklesIcon, group: "content" },
  { view: "destinations", label: "مقاصد", icon: SendIcon, group: "content" },
  { view: "glass-buttons", label: "دکمه‌های شیشه‌ای", icon: LayoutGridIcon, group: "content" },
  { view: "woo", label: "ووکامرس", icon: ShoppingCartIcon, group: "content" },
  // ابزار هوش مصنوعی
  { view: "ai-caption", label: "ساخت کپشن", icon: SparklesIcon, group: "ai" },
  { view: "ai-text", label: "متن هوشمند", icon: Wand2Icon, group: "ai" },
  { view: "smart-reply", label: "پاسخ هوشمند", icon: MessageCircleIcon, group: "ai" },
  { view: "auto-responder", label: "پاسخگوی خودکار", icon: ZapIcon, group: "ai" },
  { view: "inbox", label: "صندوق پیام‌ها", icon: InboxIcon, group: "ai" },
  // کانال‌ها و بازار
  { view: "gold", label: "قیمت طلا", icon: TrendingUpIcon, group: "channels" },
  { view: "gold-bot", label: "بات طلا", icon: TrendingUpIcon, group: "channels" },
  // بات‌ساز
  { view: "bots", label: "بات‌ها", icon: BotIcon, group: "bots" },
  { view: "bot-workflow", label: "گردش کار", icon: PencilRulerIcon, group: "bots" },
  { view: "bot-link", label: "کدهای اتصال", icon: RadioIcon, group: "bots" },
  { view: "bot-history", label: "تاریخچه ربات", icon: InboxIcon, group: "bots" },
  { view: "bot-broadcast", label: "پیام گروهی", icon: SendIcon, group: "bots" },
  // پنل مدیریت
  { view: "admin-users", label: "کاربران", icon: UsersIcon, group: "admin", adminOnly: true },
  { view: "admin-plans", label: "پلن‌ها", icon: PackageIcon, group: "admin", adminOnly: true },
  { view: "admin-audit", label: "ممیزی", icon: ShieldCheckIcon, group: "admin", adminOnly: true },
  { view: "admin-health", label: "وضعیت سامانه", icon: ActivityIcon, group: "admin", adminOnly: true },
  { view: "admin-ads", label: "تبلیغات", icon: MegaphoneIcon, group: "admin", adminOnly: true },
  { view: "admin-discounts", label: "تخفیف‌ها", icon: CreditCardIcon, group: "admin", adminOnly: true },
  { view: "admin-bank-cards", label: "کارت‌های بانکی", icon: CreditCardIcon, group: "admin", adminOnly: true },
  { view: "admin-orders", label: "سفارش‌ها", icon: ListOrderedIcon, group: "admin", adminOnly: true },
  { view: "admin-subscriptions", label: "اشتراک‌ها", icon: PackageIcon, group: "admin", adminOnly: true },
  { view: "admin-bots", label: "بات‌های سامانه", icon: BotIcon, group: "admin", adminOnly: true },
  { view: "admin-woo", label: "ووکامرس", icon: ShoppingCartIcon, group: "admin", adminOnly: true },
  { view: "admin-gold", label: "بات‌های طلا", icon: TrendingUpIcon, group: "admin", adminOnly: true },
  { view: "admin-broadcast", label: "اعلان گروهی", icon: MegaphoneIcon, group: "admin", adminOnly: true },
  { view: "admin-tickets", label: "تیکت‌ها", icon: TicketIcon, group: "admin", adminOnly: true },
  { view: "admin-settings", label: "تنظیمات", icon: SettingsIcon, group: "admin", adminOnly: true },
];

const ADMIN_GROUP_ITEMS = NAV.filter((n) => n.group === "admin");

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

function SideNav({
  active,
  onNavigate,
  onSignOut,
  userName,
  userRole,
}: {
  active: string;
  onNavigate: (view: string) => void;
  onSignOut: () => void;
  userName: string;
  userRole?: string;
}) {
  const accountNav = NAV.filter((n) => n.group === "account");
  const contentNav = NAV.filter((n) => n.group === "content");
  const aiNav = NAV.filter((n) => n.group === "ai");
  const channelsNav = NAV.filter((n) => n.group === "channels");
  const botsNav = NAV.filter((n) => n.group === "bots");
  const adminNav = ADMIN_GROUP_ITEMS.filter((n, i, arr) => arr.findIndex((x) => x.view === n.view) === i);
  const isAdmin = userRole === "admin";
  return (
    <nav className="flex h-full flex-col gap-1 overflow-y-auto p-2" dir="rtl">
      {accountNav.map((item) => (
        <NavLink key={item.view} item={item} active={active} onNavigate={onNavigate} />
      ))}
      <div className="my-2 border-t" />
      <div className="px-3 py-1 text-xs font-medium text-muted-foreground">بات‌ساز</div>
      {botsNav.map((item) => (
        <NavLink key={item.view} item={item} active={active} onNavigate={onNavigate} />
      ))}
      <div className="my-2 border-t" />
      <div className="px-3 py-1 text-xs font-medium text-muted-foreground">محتوا و انتشار</div>
      {contentNav.map((item) => (
        <NavLink key={item.view} item={item} active={active} onNavigate={onNavigate} />
      ))}
      <div className="my-2 border-t" />
      <div className="px-3 py-1 text-xs font-medium text-muted-foreground">ابزار هوش مصنوعی</div>
      {aiNav.map((item) => (
        <NavLink key={item.view} item={item} active={active} onNavigate={onNavigate} />
      ))}
      <div className="my-2 border-t" />
      <div className="px-3 py-1 text-xs font-medium text-muted-foreground">کانال‌ها و بازار</div>
      {channelsNav.map((item) => (
        <NavLink key={item.view} item={item} active={active} onNavigate={onNavigate} />
      ))}
      {isAdmin && adminNav.length > 0 && (
        <>
          <div className="my-2 border-t" />
          <div className="px-3 py-1 text-xs font-medium text-muted-foreground">پنل مدیریت</div>
          {adminNav.map((item) => (
            <NavLink key={item.view} item={item} active={active} onNavigate={onNavigate} />
          ))}
        </>
      )}
      <div className="flex-1" />
      <div className="mt-4 rounded-md border p-3 text-xs">
        <div className="text-muted-foreground">کاربر</div>
        <div className="mt-1 truncate font-medium">{userName}</div>
      </div>
      <Button variant="ghost" size="sm" onClick={onSignOut} className="mt-1 justify-start gap-2">
        <LogOutIcon className="size-4" />
        خروج
      </Button>
    </nav>
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
      onClick={() => onNavigate(item.view)}
      className={cn(
        "nav-item-link rounded-md px-3 py-2 text-sm transition-colors",
        isActive
          ? "bg-primary text-primary-foreground"
          : "hover:bg-muted text-foreground",
      )}
    >
      <Icon className="size-4" />
      <span>{item.label}</span>
    </button>
  );
}

function HomeView({ navigate }: { navigate: (to: string) => void }) {
  const cards: NavItem[] = NAV.filter((n) => n.view !== "home");
  return (
    <div className="flex flex-col gap-4" dir="rtl">
      <div>
        <h1 className="text-2xl font-bold">داشبورد پُست‌یار</h1>
        <p className="text-sm text-muted-foreground">
          برای دسترسی به بخش‌ها، روی کارت‌ها یا گزینه‌های نوار کناری بزنید.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((c) => {
          const Icon = c.icon;
          return (
            <button
              key={c.view}
              onClick={() => navigate(`/dashboard/${c.view}`)}
              className="flex flex-col items-start gap-2 rounded-lg border bg-card p-4 text-right transition-colors hover:bg-muted/50"
            >
              <div className="rounded-md bg-muted p-2">
                <Icon className="size-5" />
              </div>
              <div className="font-medium">{c.label}</div>
              <div className="text-xs text-muted-foreground">ورود به بخش {c.label}</div>
            </button>
          );
        })}
      </div>
      <div className="rounded-md border bg-muted/30 p-4 text-xs text-muted-foreground" dir="rtl">
        <div className="mb-1 flex items-center gap-2 font-medium text-foreground">
          <MessageCircleIcon className="size-4" />
          پیش‌نمایش
        </div>
        تمام بخش‌های داشبورد — محتوا، مقاصد، دکمه‌های شیشه‌ای، ووکامرس، پرداخت، کیف پول، دفتر کل،
        معرفی، اشتراک، پروفایل، ابزار هوش مصنوعی، صندوق پیام‌ها، طلا، تیکت، اعلان و تبلیغات —
        پیاده‌سازی شده‌اند و از نوار کناری در دسترس هستند.
      </div>
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

export function Dashboard({ navigate, initialView, param }: DashboardProps) {
  const { user, signOut } = useSession();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Strip any ?query from initialView/param (in case the editor is opened
  // with ?action=publish — the editor itself surfaces the publish actions).
  const cleanView = useMemo(() => initialView.split("?")[0] ?? initialView, [initialView]);
  const cleanParam = useMemo(() => (param ? param.split("?")[0] : undefined), [param]);

  useEffect(() => {
    // No-op; kept for parity with the future dashboard.
  }, [cleanView, cleanParam]);

  function onSignOut() {
    void signOut();
    navigate("/");
  }
  function onNavigate(view: string) {
    navigate(`/dashboard/${view}`);
    setSidebarOpen(false);
  }

  function renderView(): ReactNode {
    switch (cleanView) {
      case "home":
        return <HomeView navigate={navigate} />;
      case "content":
        return <ContentManagerView navigate={navigate} />;
      case "content-editor":
        return <ContentEditorView contentId={cleanParam} navigate={navigate} />;
      case "destinations":
        return <DestinationsView navigate={navigate} />;
      case "glass-buttons":
        if (!cleanParam) return <NotImplemented name="دکمه‌های شیشه‌ای (بدون مقصد)" />;
        return <GlassButtonsView destinationId={cleanParam} navigate={navigate} />;
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
        if (!cleanParam) return <NotImplemented name="گردش کار (بدون شناسه ربات)" />;
        return <BotWorkflowView botId={cleanParam} navigate={navigate} />;
      case "bot-link":
        if (!cleanParam) return <NotImplemented name="کدهای اتصال (بدون شناسه ربات)" />;
        return <BotLinkView botId={cleanParam} navigate={navigate} />;
      case "bot-history":
        if (!cleanParam) return <NotImplemented name="تاریخچه ربات (بدون شناسه ربات)" />;
        return <BotHistoryView botId={cleanParam} navigate={navigate} />;
      case "bot-broadcast":
        if (!cleanParam) return <NotImplemented name="پیام گروهی (بدون شناسه ربات)" />;
        return <BotBroadcastView botId={cleanParam} navigate={navigate} />;
      // ===== Task 10-D — Admin Panel views =====
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
    <div className="flex min-h-screen flex-col" dir="rtl">
      {/* Top bar */}
      <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b bg-background/95 px-4 backdrop-blur">
        <Button
          variant="ghost"
          size="icon"
          className="lg:hidden"
          onClick={() => setSidebarOpen((v) => !v)}
          aria-label="نمایش نوار کناری"
        >
          {sidebarOpen ? <XIcon className="size-5" /> : <MenuIcon className="size-5" />}
        </Button>
        <div className="flex items-center gap-2">
          <div className="rounded-md bg-primary p-1.5 text-primary-foreground">
            <SendIcon className="size-4" />
          </div>
          <span className="font-bold">پُست‌یار</span>
        </div>
        <div className="flex-1" />
        <div className="hidden text-xs text-muted-foreground sm:block">
          کاربر: {userName} • نقش: {roleFa(user?.role)}
        </div>
      </header>

      <div className="flex flex-1">
        {/* Sidebar — fixed on lg, drawer on smaller */}
        <aside
          className={cn(
            "fixed lg:static inset-y-0 right-0 z-30 w-64 border-l bg-background transition-transform lg:translate-x-0 lg:border-l-0",
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

        {/* Main */}
        <main className="flex-1 p-4 lg:p-6" dir="rtl">
          <div className="mx-auto max-w-6xl">
            {renderView()}
          </div>
        </main>
      </div>

      <footer className="mt-auto border-t py-3 text-center text-xs text-muted-foreground" dir="rtl">
        پُست‌یار © {toPersianDigits(new Date().getFullYear() - 621)} — نسخهٔ پیش‌نمایش
      </footer>
    </div>
  );
}

export default Dashboard;
