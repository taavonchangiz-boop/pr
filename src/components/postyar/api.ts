"use client";
// POSTYAR content API client + types (shared by views)
export type ContentRow = {
  id: string;
  title: string;
  body: string;
  status: string;
  mediaIds: string[];
  destinationIds: string[];
  scheduledAt: string | null;
  publishedAt: string | null;
  failureReason: string | null;
  createdAt: string;
  updatedAt: string;
};

export type DestinationRow = {
  id: string;
  provider: "telegram" | "bale" | "rubika";
  label: string;
  chatId: string;
  status: string;
  lastError: string | null;
  lastCheckedAt: string | null;
  createdAt: string;
  updatedAt: string;
  /** Masked token preview (last 4 chars). NEVER the raw token. */
  tokenPreview: string;
  /**
   * Legacy alias kept for backward compatibility with previous spec.
   * Same value as `tokenPreview`.
   */
  maskedToken?: string;
};

export type GlassButtonRow = {
  id: string;
  label: string;
  url: string | null;
  callbackData: string | null;
  rowOrder: number;
  enabled: boolean;
  createdAt?: string;
  updatedAt?: string;
};

export type MediaUploadResult = {
  id: string;
  publicId: string;
  kind: "image" | "video";
  mime: string;
  sizeBytes: number;
  width?: number | null;
  height?: number | null;
};

export type ContentListResponse = {
  items: ContentRow[];
  total: number;
  page: number;
  pageSize: number;
};

export type ScheduleJalali =
  | "now"
  | { jy: number; jm: number; jd: number; hour: number; minute: number };

export type ScheduleResult = {
  ok: boolean;
  jobs: Array<{ destinationId: string; created: boolean; jobId: string }>;
  scheduledAtIso: string;
};

export type BotRow = {
  id: string;
  provider: "telegram" | "bale" | "rubika";
  name: string;
  username: string | null;
  status: string;
  maskedToken: string;
  lastError: string | null;
};

export type PlanQuota = {
  publishPerMonth?: number;
  aiPerMonth?: number;
  channels?: number;
  automation?: number;
  [key: string]: number | undefined;
};

// =====================================================================
// Granular plan features (ITEM 31). Mirrors src/lib/payments/plans.ts.
// Persisted in Plan.features as JSON { featureKey: boolean | number }.
// =====================================================================
export type PlanBooleanFeatureKey =
  | "publish"
  | "schedule"
  | "multiChannel"
  | "bot"
  | "workflow"
  | "linkCodes"
  | "broadcast"
  | "glassButtons"
  | "caption"
  | "smartText"
  | "smartReply"
  | "autoResponder"
  | "inbox"
  | "woo"
  | "goldBot"
  | "goldMonitor"
  | "advertising"
  | "referral"
  | "wallet"
  | "tickets"
  | "stats"
  | "automation"
  | "apiAccess";

export type PlanNumericFeatureKey =
  | "publishPerMonth"
  | "aiPerMonth"
  | "channels"
  | "bots"
  | "destinations"
  | "contentItems"
  | "glassButtonsPerDest"
  | "workflowSteps";

export type PlanFeatureKey = PlanBooleanFeatureKey | PlanNumericFeatureKey;

export type PlanFeatures = Partial<Record<PlanFeatureKey, boolean | number>>;

export type PlanRow = {
  id: string;
  code: string;
  nameFa: string;
  descriptionFa: string;
  priceRials: number;
  priceRialsFa: string;
  intervalMonths: number;
  quota: PlanQuota;
  features: PlanFeatures;
  imageUrl: string | null;
  discountPct: number;
  renewalDiscountPct: number;
  renewalDiscountWindowDays: number;
  sortOrder: number;
  active: boolean;
  isPublic: boolean;
};

export type SubscriptionRow = {
  id: string;
  planId: string;
  planNameFa: string;
  status: string;
  startedAt: string;
  endsAt: string;
};

export type QuotaDimensionState = { used: number; limit: number };
export type QuotaState = {
  publishPerMonth: QuotaDimensionState;
  aiPerMonth: QuotaDimensionState;
  channels: QuotaDimensionState;
  automation: QuotaDimensionState;
  planNameFa?: string;
  endsAt?: string;
};

export type OrderProvider = "card" | "bank" | "bale" | null;

export type OrderRow = {
  id: string;
  kind: string;
  kindFa?: string;
  amountRials: number;
  amountFa?: string;
  status: string;
  provider: OrderProvider;
  providerFa?: string | null;
  descriptionFa: string;
  createdAt: string;
};

export type OrderDetailRow = {
  id: string;
  kind: string;
  amountRials: number;
  amountFa: string;
  descriptionFa: string;
  status: string;
  provider: OrderProvider;
  providerRef: string | null;
  planId: string | null;
  planName: string | null;
  createdAt: string;
  updatedAt: string;
  cardReceipt: {
    id: string;
    status: string;
    mediaId: string | null;
    storagePath: string;
    publicId: string;
    reviewedAt: string | null;
  } | null;
  bankRef: {
    authority: string | null;
    mode: "direct" | "intermediary" | null;
    traceNo: string | null;
    paidAt: string | null;
  } | null;
  baleRef: {
    botId: string | null;
    chargeId: string | null;
    paidAt: string | null;
  } | null;
};

export type WalletTxnRow = {
  id: string;
  amountRials: number;
  amountFa: string;
  direction: "credit" | "debit";
  reason: string;
  orderId: string | null;
  balanceAfter: number;
  createdAt: string;
};

export type LedgerEntryRow = {
  id: string;
  eventType: string;
  amountRials: number;
  amountFa: string;
  orderId: string | null;
  currency: string;
  createdAt: string;
};

export type BankCardRow = {
  id: string;
  cardNumberMask: string;
  holderName: string;
  bankName: string;
  active: boolean;
  createdAt: string;
};

export type DiscountPreviewResult = {
  ok: boolean;
  discountId?: string;
  amountOff?: number;
  newAmount?: number;
  errorFa?: string;
  code?: string;
  descriptionFa?: string;
};

export type BankPaymentResult = {
  ok: boolean;
  redirectUrl?: string;
  authority?: string;
  mode?: "direct" | "intermediary";
  errorFa?: string;
};

export type BalePaymentResult = {
  ok: boolean;
  botInvoiceUrl?: string;
  providerRef?: string;
  invoicePayload?: string;
  errorFa?: string;
};

export type Paginated<T> = {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
};

export type ReferralStatsRow = {
  referralCode: string;
  totalReferrals: number;
  totalRewardRials: number;
  totalRewardFa: string;
  policyFa?: string;
  referred: Array<{
    maskedEmail: string;
    maskedMobile: string;
    amountRials: number;
    amountFa: string;
    createdAt: string;
  }>;
};

export type ProfileRow = {
  firstName: string;
  lastName: string;
  email: string;
  mobile: string;
  activityType: string;
  businessName: string;
  referralCode: string;
  bio?: string;
  notifyPrefs?: Record<string, boolean>;
};

export type NotifyPrefsRow = Record<string, boolean>;

export type NotificationRow = {
  id: string;
  category: string;
  titleFa: string;
  bodyFa: string;
  link: string | null;
  readAt: string | null;
  createdAt: string;
};

export type TicketRow = {
  id: string;
  subject: string;
  status: string;
  category: string;
  categoryFa?: string;
  priority: string;
  priorityFa?: string;
  ownerId?: string;
  ownerNameFa?: string;
  assignedToId?: string | null;
  assignedToNameFa?: string | null;
  departmentId?: string | null;
  departmentNameFa?: string | null;
  createdAt: string;
  createdAtFa?: string;
  updatedAt: string;
  updatedAtFa?: string;
  replyCount?: number;
  replies?: TicketReplyRow[];
};

export type TicketReplyRow = {
  id: string;
  body: string;
  isStaff: boolean;
  createdAt: string;
};

export type TicketAttachmentRow = {
  id: string;
  fileName: string;
  mime: string;
  sizeBytes: number;
  createdAt: string;
  createdAtFa?: string;
};

export type TicketDepartmentRow = {
  id: string;
  nameFa: string;
  descriptionFa: string;
  priority: number;
  active: boolean;
  ticketCount: number;
  createdAt: string;
  createdAtFa: string;
  updatedAt: string;
  updatedAtFa: string;
};

export type GoldPriceRow = {
  instrument: string;
  priceRials: number;
  fetchedAt: string;
  stale: boolean;
};

export type AiJobRow = {
  id: string;
  provider: string;
  model: string;
  task: string;
  status: string;
  output: string | null;
  createdAt: string;
};

export type AdCampaignRow = {
  id: string;
  title: string;
  descriptionFa: string;
  status: string;
  impressions: number;
  clicks: number;
  startAt: string | null;
  endAt: string | null;
};

export type GoldBotRow = {
  id: string;
  enabled: boolean;
  instrument: string;
  direction: string;
  thresholdPct: number;
  intervalMin: number;
  destinationId: string | null;
  lastFiredAt: string | null;
  lastFiredAtFa: string | null;
  createdAt: string;
  updatedAt: string;
};

export type WooStoreRow = {
  id: string;
  storeUrl: string;
  status: string;
  lastSyncAt: string | null;
  createdAt: string;
  consumerKeyMasked: string;
};

export type WooSyncResult = {
  ok: boolean;
  syncedCount?: number;
  drafts?: Array<{ title: string; body: string; imageUrl: string | null; sourceUrl: string | null }>;
  errorFa?: string;
};

export type InboxThread = {
  threadId: string;
  botId: string;
  botName: string;
  provider: string;
  providerUserId: string;
  maskedSender: string;
  lastMessage: string;
  lastDirection: "inbound" | "outbound";
  lastAt: string;
  unread: boolean;
};

export type InboxMessage = {
  id: string;
  direction: "inbound" | "outbound";
  providerUserId: string;
  text: string | null;
  createdAt: string;
};

export type AutoResponderConfig = {
  id?: string;
  enabled: boolean;
  destinationId: string | null;
  rules: AutoResponderRule[];
  fallbackFa: string;
  aiProvider: string | null;
  aiModel: string | null;
  loopGuardSeconds: number;
  dailyLimit: number;
  usedToday?: number;
};

export type AutoResponderRule = {
  keywords: string[];
  matchMode?: "exact" | "contains" | "regex";
  responseMode?: "static" | "ai";
  staticResponse?: string;
  aiPromptSuffix?: string;
};

export type AiCaptionResult = {
  ok: boolean;
  caption?: string;
  alternatives?: string[];
  hashtags?: string[];
  provider?: string;
  model?: string;
  tokensIn?: number;
  tokensOut?: number;
  aiJobId?: string;
  errorFa?: string;
};

export type AiTextResult = {
  ok: boolean;
  text?: string;
  provider?: string;
  model?: string;
  tokensIn?: number;
  tokensOut?: number;
  aiJobId?: string;
  errorFa?: string;
};

export type SmartReplyResult = {
  ok: boolean;
  suggestion?: string;
  alternatives?: string[];
  provider?: string;
  model?: string;
  tokensIn?: number;
  tokensOut?: number;
  aiJobId?: string;
  errorFa?: string;
};

export type GoldPriceView = {
  ok: boolean;
  instrument: string;
  priceRials: number | null;
  priceRialsFa?: string;
  fetchedAt?: string;
  source?: string;
  stalePriceRials?: number | null;
  errorFa?: string;
};

export type GoldPrices = Record<string, GoldPriceView>;

export type TicketDetailRow = {
  ticket: TicketRow;
  replies: TicketReplyView[];
};

export type TicketReplyView = {
  id: string;
  body: string;
  isStaff: boolean;
  authorNameFa: string;
  createdAt: string;
  createdAtFa: string;
  attachments?: TicketAttachmentRow[];
};

export type NotificationView = {
  id: string;
  category: string;
  titleFa: string;
  bodyFa: string;
  link: string | null;
  readAt: string | null;
  createdAt: string;
  createdAtFa: string;
};

export type AdDetailRow = {
  id: string;
  title: string;
  descriptionFa: string;
  link: string | null;
  imagePath: string | null;
  imageUrl: string | null;
  placement: string;
  startAt: string | null;
  endAt: string | null;
  priceRials: number;
  priceFa: string;
  status: string;
  impressions: number;
  clicks: number;
  createdAt: string;
  reviewedAt: string | null;
};

// =====================================================================
// Task 10-D types — Bot Builder + Admin Panel
// =====================================================================
export type BotListRow = BotRow & {
  destinationId?: string | null;
  config?: Record<string, unknown>;
  tokenPreview?: string;
  createdAt?: string;
  updatedAt?: string;
};

export type WorkflowStepType = "start" | "message" | "condition" | "action" | "end";
export type ConditionKind =
  | "subscription_active"
  | "plan"
  | "referral"
  | "keyword"
  | "order_status"
  | "provider_context"
  | "user_state";
export type ActionKind =
  | "send_message"
  | "show_menu"
  | "create_ticket"
  | "show_subscription"
  | "show_wallet"
  | "initiate_payment"
  | "show_gold"
  | "invoke_ai"
  | "show_order"
  | "send_content"
  | "create_notification";

export interface WorkflowButton {
  label: string;
  kind: "url" | "callback";
  url?: string;
  callbackData?: string;
}

export interface WorkflowStep {
  id: string;
  type: WorkflowStepType;
  text?: string;
  buttons?: WorkflowButton[];
  condition?: { kind: ConditionKind; value?: string; thenStepId?: string; elseStepId?: string };
  action?: { kind: ActionKind; config?: Record<string, unknown>; nextStepId?: string };
  nextStepId?: string;
  config?: Record<string, unknown>;
}

export type WorkflowRow = {
  id: string;
  botId?: string;
  name: string;
  enabled: boolean;
  steps: WorkflowStep[];
  triggerKind: "message" | "command" | "callback";
  triggerValue: string | null;
  createdAt: string;
  updatedAt: string;
};

export type LinkCodeRow = {
  id: string;
  createdAt: string;
  expiresAt: string;
  consumed: boolean;
  consumedAt: string | null;
  consumedByProviderUserIdMasked: string | null;
};

export type BotHistoryRow = {
  id: string;
  direction: "inbound" | "outbound";
  providerUserId: string | null;
  text: string | null;
  raw: Record<string, unknown> | null;
  userId: string | null;
  createdAt: string;
};

export type BotHistoryResponse = Paginated<BotHistoryRow> & { totalPages: number };

export type BroadcastResult = {
  ok: boolean;
  sent: number;
  failed: number;
  failures?: Array<{ providerUserId: string; errorFa: string }>;
};

export type LinkCodeResult = {
  ok: boolean;
  code: string;
  expiresAt: string;
  linkCodeId: string;
  instructionsFa?: string;
};

export type AdminUserRow = {
  id: string;
  email: string;
  mobileMasked: string;
  firstName: string;
  lastName: string;
  businessName: string | null;
  activityType: string;
  role: "user" | "support" | "admin";
  status: "active" | "suspended";
  referralCode: string;
  referredById: string | null;
  createdAt: string;
  createdAtFa: string;
  isSuperAdmin?: boolean;
};

export type AdminPlanRow = {
  id: string;
  code: string;
  nameFa: string;
  descriptionFa: string;
  priceRials: number;
  priceRialsFa: string;
  intervalMonths: number;
  quota: PlanQuota;
  features: PlanFeatures;
  imageUrl: string | null;
  discountPct: number;
  renewalDiscountPct: number;
  renewalDiscountWindowDays: number;
  sortOrder: number;
  active: boolean;
  isPublic: boolean;
  subscriptionCount: number;
  createdAt: string;
  createdAtFa: string;
};

/** Input body for POST /api/admin/plans (create). */
export type AdminPlanInput = {
  code: string;
  nameFa: string;
  descriptionFa?: string;
  priceRials: number;
  intervalMonths: number;
  quota?: PlanQuota;
  features?: PlanFeatures;
  imageUrl?: string | null;
  discountPct?: number;
  renewalDiscountPct?: number;
  renewalDiscountWindowDays?: number;
  sortOrder?: number;
  active?: boolean;
  isPublic?: boolean;
};

/** Input body for PATCH /api/admin/plans/[id] (partial update). */
export type AdminPlanPatch = Partial<Omit<AdminPlanInput, "code">>;

export type AdminAuditRow = {
  id: string;
  userId: string | null;
  actor: string;
  action: string;
  targetType: string;
  targetId: string | null;
  ip: string | null;
  meta: unknown;
  createdAt: string;
  createdAtFa: string;
  userName: string | null;
  userEmail: string | null;
};

export type AdminHealthCheck = {
  component: string;
  status: "ok" | "warn" | "down";
  message?: string;
};

export type AdminHealthResponse = {
  overall: "ok" | "warn" | "down";
  checkedAtFa: string;
  checks: AdminHealthCheck[];
};

export type AdminAdRow = AdDetailRow & {
  ownerId?: string;
  ownerName?: string | null;
  ownerEmail?: string | null;
};

export type AdminDiscountRow = {
  id: string;
  code: string;
  kind: "percent" | "fixed";
  value: number;
  valueFa: string;
  maxUses: number;
  uses: number;
  perUserLimit: number;
  expiresAt: string | null;
  expiresAtFa: string | null;
  active: boolean;
  planIds: string[];
  usageCount: number;
};

export type AdminBankCardRow = BankCardRow;

export type AdminOrderRow = {
  id: string;
  userId: string;
  userEmail: string;
  userMobile?: string;
  userFullName: string;
  kind: string;
  kindFa: string;
  amountRials: number;
  amountFa: string;
  status: string;
  statusFa?: string;
  provider: OrderProvider;
  providerFa: string | null;
  descriptionFa: string;
  planId?: string | null;
  createdAt: string;
  createdAtFa: string;
  updatedAt?: string;
  receiptUrl?: string | null;
  hasCardReceipt?: boolean;
  receiptStatus?: string | null;
  receiptReviewedAt?: string | null;
};

export type AdminOrdersQuery = {
  page?: number;
  pageSize?: number;
  status?: string;
  kind?: string;
  provider?: string;
  q?: string;
  from?: string;
  to?: string;
};

export type AdminSubscriptionRow = {
  id: string;
  userId: string;
  userEmail: string;
  userFullName: string;
  planId: string;
  planName: string;
  status: string;
  startedAt: string;
  startedAtFa: string;
  endsAt: string;
  endsAtFa: string;
  priceFa: string;
};

export type AdminBotRow = {
  id: string;
  ownerId: string;
  ownerName: string | null;
  ownerEmail: string | null;
  provider: string;
  name: string;
  username: string | null;
  status: string;
  lastError: string | null;
  destinationId: string | null;
  createdAt: string;
  createdAtFa: string;
  updatedAt: string;
};

export type AdminTicketRow = {
  id: string;
  subject: string;
  category: string;
  categoryFa: string;
  status: string;
  priority: string;
  priorityFa: string;
  ownerId: string;
  ownerNameFa: string;
  assignedToId: string | null;
  assignedToNameFa: string | null;
  departmentId: string | null;
  departmentNameFa: string | null;
  createdAt: string;
  createdAtFa: string;
  updatedAt: string;
  updatedAtFa: string;
  replyCount: number;
};

export type AdminSettingRow = {
  key: string;
  value: string;
  updatedAt: string;
  updatedAtFa: string;
};

/** One setting definition — mirrors /api/admin/settings GET `groups[].keys[]`. */
export type AdminSettingDef = {
  key: string;
  labelFa: string;
  descFa: string;
  sensitive?: boolean;
  options?: { value: string; labelFa: string }[];
  default?: string;
};

/** One settings group — mirrors /api/admin/settings GET `groups[]`. */
export type AdminSettingGroup = {
  id: "general" | "sms_panel" | "email_panel" | "bank_gateway" | "gold_config" | "ai_config" | "security";
  titleFa: string;
  descriptionFa: string;
  keys: AdminSettingDef[];
};

/** Extended GET response — items + groups + allow-list. */
export type AdminSettingsResponse = {
  items: AdminSettingRow[];
  allowedKeys: string[];
  groups: AdminSettingGroup[];
};

/** GoldPriceConfig row (admin gold config). */
export type GoldSource =
  | "free_talaapi"
  | "free_tgju"
  | "free_bonmarket"
  | "custom_json"
  | "custom_token";

export type AdminGoldConfigRow = {
  source: GoldSource;
  endpoint: string | null;
  token: string | null;
  selector18k: string | null;
  selectorEmami: string | null;
  selectorBahar: string | null;
  selectorOunce: string | null;
  refreshMinutes: number;
  active: boolean;
  updatedAt: string;
  updatedAtFa: string;
};

export type AdminGoldConfigInput = {
  source: GoldSource;
  endpoint?: string | null;
  token?: string | null;
  selector18k?: string | null;
  selectorEmami?: string | null;
  selectorBahar?: string | null;
  selectorOunce?: string | null;
  refreshMinutes?: number;
  active?: boolean;
};

export type AdminGoldRefreshPrice = {
  instrument: string;
  instrumentFa: string;
  priceRials: number | null;
  priceRialsFa: string | null;
  errorFa?: string | null;
};

export type AdminGoldRefreshResult = {
  ok: boolean;
  fetchedAt: string;
  fetchedAtFa: string;
  prices: AdminGoldRefreshPrice[];
  errorFa?: string;
};

export type AdminWooStoreRow = {
  id: string;
  userId: string;
  ownerName: string | null;
  ownerEmail: string | null;
  storeUrl: string;
  status: string;
  consumerKeyMasked: string;
  lastSyncAt: string | null;
  lastSyncAtFa: string | null;
  createdAt: string;
};

export type AdminGoldBotRow = {
  id: string;
  userId: string;
  ownerName: string | null;
  ownerEmail: string | null;
  enabled: boolean;
  instrument: string;
  direction: string;
  thresholdPct: number;
  intervalMin: number;
  destinationId: string | null;
  lastFiredAt: string | null;
  lastFiredAtFa: string | null;
  createdAt: string;
  updatedAt: string;
};

async function jsonOrThrow(r: Response) {
  if (!r.ok) {
    const data = await r.json().catch(() => ({}));
    throw new Error(data?.errorFa ?? `خطای ${r.status}`);
  }
  return r.json();
}

export const api = {
  async getPlans(): Promise<PlanRow[]> {
    const data = await jsonOrThrow(await fetch("/api/plans"));
    return (data?.items ?? data?.plans ?? data ?? []) as PlanRow[];
  },
  async getMe() {
    const r = await fetch("/api/auth/me", { credentials: "same-origin" });
    return r.json();
  },
  async signOut() {
    await fetch("/api/auth/signout", { method: "POST", credentials: "same-origin" });
  },
  async getDestinations(): Promise<DestinationRow[]> {
    const data = await jsonOrThrow(await fetch("/api/destinations", { credentials: "same-origin" })) as { items?: DestinationRow[] };
    return (data.items ?? []).map((d) => ({ ...d, maskedToken: d.tokenPreview ?? d.maskedToken ?? "••••" }));
  },
  async getDestination(id: string): Promise<DestinationRow> {
    const data = await jsonOrThrow(await fetch(`/api/destinations/${id}`, { credentials: "same-origin" })) as { destination?: DestinationRow };
    const d = data.destination;
    if (!d) throw new Error("مقصد یافت نشد.");
    return { ...d, maskedToken: d.tokenPreview ?? d.maskedToken ?? "••••" };
  },
  async createDestination(body: { provider: string; label: string; botToken: string; chatId: string }): Promise<DestinationRow> {
    const data = await jsonOrThrow(await fetch("/api/destinations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), credentials: "same-origin" })) as { destination?: DestinationRow };
    const d = data.destination;
    if (!d) throw new Error("ساخت مقصد ناموفق بود.");
    return { ...d, maskedToken: d.tokenPreview ?? d.maskedToken ?? "••••" };
  },
  async updateDestination(id: string, body: { label?: string; chatId?: string; status?: "active" | "inactive"; botToken?: string }): Promise<DestinationRow> {
    const data = await jsonOrThrow(await fetch(`/api/destinations/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), credentials: "same-origin" })) as { destination?: DestinationRow };
    const d = data.destination;
    if (!d) throw new Error("به‌روزرسانی مقصد ناموفق بود.");
    return { ...d, maskedToken: d.tokenPreview ?? d.maskedToken ?? "••••" };
  },
  async testDestination(id: string): Promise<{ ok: boolean; errorFa?: string; raw?: unknown }> {
    return jsonOrThrow(await fetch(`/api/destinations/${id}/test`, { method: "POST", credentials: "same-origin" }));
  },
  async deleteDestination(id: string): Promise<void> {
    const r = await fetch(`/api/destinations/${id}`, { method: "DELETE", credentials: "same-origin" });
    if (!r.ok) {
      const data = await r.json().catch(() => ({}));
      throw new Error(data?.errorFa ?? `خطای ${r.status}`);
    }
  },
  async listButtons(destinationId: string): Promise<GlassButtonRow[]> {
    const data = await jsonOrThrow(await fetch(`/api/destinations/${destinationId}/buttons`, { credentials: "same-origin" })) as { items?: GlassButtonRow[] };
    return data.items ?? [];
  },
  async createButton(destinationId: string, body: Partial<GlassButtonRow>): Promise<GlassButtonRow> {
    const data = await jsonOrThrow(await fetch(`/api/destinations/${destinationId}/buttons`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), credentials: "same-origin" })) as { button?: GlassButtonRow };
    if (!data.button) throw new Error("ساخت دکمه ناموفق بود.");
    return data.button;
  },
  async updateButton(destinationId: string, buttonId: string, body: Partial<GlassButtonRow>): Promise<GlassButtonRow> {
    const data = await jsonOrThrow(await fetch(`/api/destinations/${destinationId}/buttons/${buttonId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), credentials: "same-origin" })) as { button?: GlassButtonRow };
    if (!data.button) throw new Error("به‌روزرسانی دکمه ناموفق بود.");
    return data.button;
  },
  async deleteButton(destinationId: string, buttonId: string): Promise<void> {
    const r = await fetch(`/api/destinations/${destinationId}/buttons/${buttonId}`, { method: "DELETE", credentials: "same-origin" });
    if (!r.ok) {
      const data = await r.json().catch(() => ({}));
      throw new Error(data?.errorFa ?? `خطای ${r.status}`);
    }
  },
  async getBots(): Promise<BotRow[]> {
    const data = await jsonOrThrow(await fetch("/api/bots", { credentials: "same-origin" })) as { items?: BotListRow[] };
    return (data.items ?? []).map((b) => ({
      id: b.id,
      provider: b.provider,
      name: b.name,
      username: b.username ?? null,
      status: b.status,
      maskedToken: typeof b.tokenPreview === "string" ? b.tokenPreview : (typeof b.maskedToken === "string" ? b.maskedToken : "••••"),
      lastError: b.lastError ?? null,
    }));
  },
  async getBotsFull(): Promise<BotListRow[]> {
    const data = await jsonOrThrow(await fetch("/api/bots", { credentials: "same-origin" })) as { items?: BotListRow[] };
    return (data.items ?? []).map((b) => ({
      ...b,
      maskedToken: typeof b.tokenPreview === "string" ? b.tokenPreview : (typeof b.maskedToken === "string" ? b.maskedToken : "••••"),
    }));
  },
  async createBot(body: { provider: string; name: string; botToken: string; username?: string }): Promise<BotRow & { tokenPreview?: string }> {
    const data = await jsonOrThrow(await fetch("/api/bots", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), credentials: "same-origin" })) as { ok?: boolean; bot?: (BotRow & { tokenPreview?: string }) };
    if (!data.bot) throw new Error("ساخت ربات ناموفق بود.");
    return { ...data.bot, maskedToken: typeof data.bot.tokenPreview === "string" ? data.bot.tokenPreview : (data.bot.maskedToken ?? "••••") };
  },
  async deleteBot(id: string) {
    await fetch(`/api/bots/${id}`, { method: "DELETE", credentials: "same-origin" });
  },
  async activateBot(id: string) {
    return jsonOrThrow(await fetch(`/api/bots/${id}/activate`, { method: "POST", credentials: "same-origin" }));
  },
  async deactivateBot(id: string) {
    return jsonOrThrow(await fetch(`/api/bots/${id}/deactivate`, { method: "POST", credentials: "same-origin" }));
  },
  async testBot(id: string) {
    return jsonOrThrow(await fetch(`/api/bots/${id}/test`, { method: "POST", credentials: "same-origin" }));
  },
  async getWalletBalance(): Promise<{ balanceRials: number; balanceFa: string }> {
    const data = await jsonOrThrow(await fetch("/api/wallet", { credentials: "same-origin" }));
    // Server returns { balance: { balanceRials, balanceFa }, history: {...} }
    return data.balance ?? { balanceRials: 0, balanceFa: "۰ ریال" };
  },
  async getWalletHistory(page: number = 1, pageSize: number = 20): Promise<Paginated<WalletTxnRow>> {
    const url = `/api/wallet?page=${page}&pageSize=${pageSize}`;
    const data = await jsonOrThrow(await fetch(url, { credentials: "same-origin" }));
    return data.history ?? { items: [], total: 0, page, pageSize };
  },
  async getNotifications(page: number = 1, pageSize: number = 50): Promise<Paginated<NotificationView>> {
    const data = await jsonOrThrow(await fetch(`/api/notifications?limit=${pageSize}&offset=${(page - 1) * pageSize}`, { credentials: "same-origin" }));
    return { items: data.items ?? [], total: data.total ?? 0, page, pageSize };
  },
  async getUnreadCount(): Promise<number> {
    const data = await jsonOrThrow(await fetch("/api/notifications/unread-count", { credentials: "same-origin" }));
    return data.count ?? 0;
  },
  async markRead(id: string) {
    await fetch("/api/notifications", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ notificationId: id }), credentials: "same-origin" });
  },
  async markAllNotificationsRead(): Promise<{ updated: number }> {
    const data = await jsonOrThrow(await fetch("/api/notifications", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ all: true }), credentials: "same-origin" }));
    return { updated: data.updated ?? 0 };
  },
  async getMySubscription(): Promise<{ subscription: SubscriptionRow | null; quota: QuotaState }> {
    return jsonOrThrow(await fetch("/api/subscriptions", { credentials: "same-origin" }));
  },
  async createOrder(body: { kind: "subscription" | "wallet_credit" | "ad_campaign"; planId?: string; amount?: number; provider?: OrderProvider; discountCode?: string; idempotencyKey: string }): Promise<{ ok: boolean; order: { id: string; amountRials: number; status: string; descriptionFa: string }; discount?: { amountOff: number; newAmount: number } | null }> {
    return jsonOrThrow(await fetch("/api/orders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), credentials: "same-origin" }));
  },
  async getOrders(): Promise<OrderRow[]> {
    const data = await jsonOrThrow(await fetch("/api/orders", { credentials: "same-origin" }));
    return data.orders ?? [];
  },
  async getOrder(id: string): Promise<OrderDetailRow> {
    const data = await jsonOrThrow(await fetch(`/api/orders/${id}`, { credentials: "same-origin" })) as { order?: OrderDetailRow };
    if (!data.order) throw new Error("سفارش یافت نشد.");
    return data.order;
  },
  async getGoldPrice(): Promise<GoldPrices> {
    const data = await jsonOrThrow(await fetch("/api/gold", { credentials: "same-origin" })) as { items?: GoldPrices };
    return data.items ?? {};
  },
  async getGoldPriceByInstrument(instrument: string): Promise<GoldPriceView> {
    return jsonOrThrow(await fetch(`/api/gold?instrument=${encodeURIComponent(instrument)}`, { credentials: "same-origin" }));
  },
  async generateCaption(body: { topic: string; tone: string; audience: string; length: string; platform: string; purpose: string }): Promise<AiCaptionResult> {
    return jsonOrThrow(await fetch("/api/ai/generate-caption", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), credentials: "same-origin" })) as Promise<AiCaptionResult>;
  },
  async generateText(body: { mode: string; input: string; opts?: Record<string, unknown> }): Promise<AiTextResult> {
    return jsonOrThrow(await fetch("/api/ai/generate-text", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), credentials: "same-origin" })) as Promise<AiTextResult>;
  },
  async smartReply(body: { message: string; context?: { recentThread?: Array<{ role: string; text: string }>; channel?: string; provider?: string }; contextText?: string }): Promise<SmartReplyResult> {
    // The backend expects { message, context: { recentThread, channel, provider } }.
    // For convenience, we accept a `contextText` flat string and turn it into a single user thread entry.
    const payload: Record<string, unknown> = { message: body.message };
    if (body.context) payload.context = body.context;
    else if (body.contextText && body.contextText.trim()) {
      payload.context = { recentThread: [{ role: "system", text: body.contextText.trim() }] };
    }
    return jsonOrThrow(await fetch("/api/ai/smart-reply", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload), credentials: "same-origin" })) as Promise<SmartReplyResult>;
  },
  async getTickets(): Promise<TicketRow[]> {
    const data = await jsonOrThrow(await fetch("/api/tickets?limit=100", { credentials: "same-origin" }));
    return data.items ?? [];
  },
  async createTicket(body: {
    subject: string;
    body: string;
    category: string;
    priority?: "low" | "normal" | "high" | "urgent";
    departmentId?: string | null;
  }): Promise<{ ok: boolean; ticket: TicketRow }> {
    const data = await jsonOrThrow(await fetch("/api/tickets", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), credentials: "same-origin" }));
    if (!data.ticket) throw new Error(data.errorFa ?? "ایجاد تیکت ناموفق بود.");
    return { ok: true, ticket: data.ticket };
  },
  /**
   * User-facing: list ACTIVE ticket departments (for the create-ticket
   * dialog dropdown). Hits /api/tickets/departments which is open to any
   * signed-in user. Returns only `active=true` rows sorted by priority asc.
   */
  async getTicketDepartmentsForUser(): Promise<{ items: TicketDepartmentRow[] }> {
    return jsonOrThrow(await fetch("/api/tickets/departments", { credentials: "same-origin" }));
  },
  async getTicketDetail(id: string): Promise<{ ticket: TicketRow; replies: TicketReplyView[] }> {
    const data = await jsonOrThrow(await fetch(`/api/tickets/${id}`, { credentials: "same-origin" }));
    if (!data.ticket) throw new Error(data.errorFa ?? "تیکت یافت نشد.");
    return { ticket: data.ticket, replies: data.replies ?? [] };
  },
  async replyTicket(id: string, body: string, opts?: { close?: boolean }): Promise<{ ok: boolean; reply: TicketReplyView }> {
    const data = await jsonOrThrow(await fetch(`/api/tickets/${id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body, close: opts?.close }), credentials: "same-origin" }));
    if (!data.reply) throw new Error(data.errorFa ?? "ثبت پاسخ ناموفق بود.");
    return { ok: true, reply: data.reply };
  },
  async getAds(): Promise<AdDetailRow[]> {
    const data = await jsonOrThrow(await fetch("/api/ads", { credentials: "same-origin" }));
    return data.items ?? [];
  },
  async getAd(id: string): Promise<AdDetailRow> {
    const data = await jsonOrThrow(await fetch(`/api/ads/${id}`, { credentials: "same-origin" })) as { ad?: AdDetailRow };
    if (!data.ad) throw new Error("تبلیغ یافت نشد.");
    return data.ad;
  },
  async createAd(body: { title: string; descriptionFa?: string; link?: string; placement?: string; startAt?: string; endAt?: string; imageBase64?: string; priceRials?: number }): Promise<{ ok: boolean; ad: AdDetailRow }> {
    const data = await jsonOrThrow(await fetch("/api/ads", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), credentials: "same-origin" }));
    if (!data.ad) throw new Error(data.errorFa ?? "ساخت تبلیغ ناموفق بود.");
    return { ok: true, ad: data.ad };
  },
  async updateAd(id: string, body: { title?: string; descriptionFa?: string; link?: string; placement?: string; startAt?: string; endAt?: string; imageBase64?: string }): Promise<{ ok: boolean; ad: AdDetailRow }> {
    const data = await jsonOrThrow(await fetch(`/api/ads/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), credentials: "same-origin" }));
    if (!data.ad) throw new Error(data.errorFa ?? "به‌روزرسانی تبلیغ ناموفق بود.");
    return { ok: true, ad: data.ad };
  },
  async submitAdForReview(id: string): Promise<{ ok: boolean; ad: AdDetailRow }> {
    const data = await jsonOrThrow(await fetch(`/api/ads/${id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}), credentials: "same-origin" }));
    if (!data.ad) throw new Error(data.errorFa ?? "ارسال برای بررسی ناموفق بود.");
    return { ok: true, ad: data.ad };
  },
  async getWooStores(): Promise<WooStoreRow[]> {
    const data = await jsonOrThrow(await fetch("/api/woo/stores", { credentials: "same-origin" })) as { items?: WooStoreRow[] };
    return data.items ?? [];
  },
  async createWooStore(body: { storeUrl: string; consumerKey: string; consumerSecret: string }): Promise<{ ok: boolean; store: WooStoreRow }> {
    const data = await jsonOrThrow(await fetch("/api/woo/stores", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), credentials: "same-origin" }));
    if (!data.store) throw new Error(data.errorFa ?? "افزودن فروشگاه ناموفق بود.");
    return { ok: true, store: data.store };
  },
  async testWooStore(id: string): Promise<{ ok: boolean; storeName?: string; errorFa?: string }> {
    // Test connection via system_status — POST echo through admin route if available,
    // otherwise we treat the sync endpoint as a smoke test (it fetches products).
    try {
      const r = await fetch(`/api/woo/stores/${id}/sync`, { method: "POST", credentials: "same-origin" });
      if (!r.ok) {
        const data = await r.json().catch(() => ({}));
        return { ok: false, errorFa: data?.errorFa ?? `خطای ${r.status}` };
      }
      const data = (await r.json()) as { ok?: boolean; syncedCount?: number; errorFa?: string };
      return { ok: data.ok === true, errorFa: data.errorFa };
    } catch {
      return { ok: false, errorFa: "ارتباط با فروشگاه ناموفق بود." };
    }
  },
  async syncWooStore(id: string): Promise<WooSyncResult> {
    const r = await fetch(`/api/woo/stores/${id}/sync`, { method: "POST", credentials: "same-origin" });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      return { ok: false, errorFa: data?.errorFa ?? `خطای ${r.status}` };
    }
    return data as WooSyncResult;
  },
  async getAdminHealth() {
    return jsonOrThrow(await fetch("/api/admin/health", { credentials: "same-origin" }));
  },
  async getAdminUsers() {
    return jsonOrThrow(await fetch("/api/admin/users", { credentials: "same-origin" }));
  },
  async getAdminAudit() {
    return jsonOrThrow(await fetch("/api/admin/audit", { credentials: "same-origin" }));
  },
  // ============================================================
  // CONTENT + PUBLISHING (added by Task 10-A)
  // ============================================================
  async listContent(params?: { status?: string; page?: number; pageSize?: number; q?: string }): Promise<ContentListResponse> {
    const qs = new URLSearchParams();
    if (params?.status) qs.set("status", params.status);
    if (params?.page) qs.set("page", String(params.page));
    if (params?.pageSize) qs.set("pageSize", String(params.pageSize));
    if (params?.q) qs.set("q", params.q);
    const tail = qs.toString();
    const url = tail ? `/api/content?${tail}` : "/api/content";
    return jsonOrThrow(await fetch(url, { credentials: "same-origin" })) as Promise<ContentListResponse>;
  },
  async getContent(contentId: string): Promise<ContentRow> {
    const data = await jsonOrThrow(await fetch(`/api/content/${contentId}`, { credentials: "same-origin" })) as { content?: ContentRow };
    if (!data.content) throw new Error("محتوا یافت نشد.");
    return data.content;
  },
  async createContent(body: { title: string; body: string; mediaIds?: string[]; destinationIds?: string[]; status?: string }): Promise<ContentRow> {
    const data = await jsonOrThrow(await fetch("/api/content", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), credentials: "same-origin" })) as { content?: ContentRow };
    if (!data.content) throw new Error("ساخت محتوا ناموفق بود.");
    return data.content;
  },
  async updateContent(contentId: string, body: { title?: string; body?: string; mediaIds?: string[]; destinationIds?: string[]; status?: string }): Promise<ContentRow> {
    const data = await jsonOrThrow(await fetch(`/api/content/${contentId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), credentials: "same-origin" })) as { content?: ContentRow };
    if (!data.content) throw new Error("به‌روزرسانی محتوا ناموفق بود.");
    return data.content;
  },
  async deleteContent(contentId: string, opts?: { hard?: boolean }): Promise<void> {
    const qs = opts?.hard ? "?hard=1" : "";
    const r = await fetch(`/api/content/${contentId}${qs}`, { method: "DELETE", credentials: "same-origin" });
    if (!r.ok) {
      const data = await r.json().catch(() => ({}));
      throw new Error(data?.errorFa ?? `خطای ${r.status}`);
    }
  },
  async publishContent(contentId: string, destinationIds: string[], when: ScheduleJalali): Promise<ScheduleResult> {
    return jsonOrThrow(await fetch("/api/publish/schedule", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contentId, destinationIds, scheduledAtJalali: when }),
      credentials: "same-origin",
    })) as Promise<ScheduleResult>;
  },
  async uploadMedia(file: File, kind: "image" | "video" = "image"): Promise<MediaUploadResult> {
    const form = new FormData();
    form.append("file", file);
    form.append("kind", kind);
    const r = await fetch("/api/media-upload", { method: "POST", body: form, credentials: "same-origin" });
    if (!r.ok) {
      const data = await r.json().catch(() => ({}));
      throw new Error(data?.errorFa ?? `خطای ${r.status}`);
    }
    return r.json() as Promise<MediaUploadResult>;
  },
  // ============================================================
  // PAYMENT + WALLET + LEDGER + REFERRAL + PROFILE (added by Task 10-B)
  // ============================================================
  async getReferralStats(): Promise<ReferralStatsRow> {
    return jsonOrThrow(await fetch("/api/referral", { credentials: "same-origin" }));
  },
  async getLedger(page: number = 1, pageSize: number = 20): Promise<Paginated<LedgerEntryRow>> {
    return jsonOrThrow(await fetch(`/api/ledger?page=${page}&pageSize=${pageSize}`, { credentials: "same-origin" }));
  },
  async getBankCards(): Promise<BankCardRow[]> {
    const data = await jsonOrThrow(await fetch("/api/payments/card", { credentials: "same-origin" }));
    return data.items ?? [];
  },
  async validateDiscount(input: { code: string; planId?: string; amount: number }): Promise<DiscountPreviewResult> {
    const qs = new URLSearchParams();
    qs.set("code", input.code);
    if (input.planId) qs.set("planId", input.planId);
    qs.set("amount", String(input.amount));
    const r = await fetch(`/api/discounts?${qs.toString()}`, { credentials: "same-origin" });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      return { ok: false, errorFa: data?.errorFa ?? `خطای ${r.status}` };
    }
    return data as DiscountPreviewResult;
  },
  async uploadReceipt(input: { orderId: string; mediaId: string }): Promise<{ ok: boolean; status: string }> {
    return jsonOrThrow(await fetch("/api/payments/card/receipt", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
      credentials: "same-origin",
    }));
  },
  async createBankRequest(input: { orderId: string; mode?: "direct" | "intermediary" }): Promise<BankPaymentResult> {
    return jsonOrThrow(await fetch("/api/payments/bank", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
      credentials: "same-origin",
    }));
  },
  async createBaleRequest(input: { orderId: string; botId: string; chatId: string }): Promise<BalePaymentResult> {
    return jsonOrThrow(await fetch("/api/payments/bale", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
      credentials: "same-origin",
    }));
  },
  // ============================================================
  // PROFILE (Task 10-B) — 7 persisted fields + change password + notify prefs
  // ============================================================
  async getProfile(): Promise<ProfileRow> {
    const data = await jsonOrThrow(await fetch("/api/auth/me/profile", { credentials: "same-origin" })) as { profile?: ProfileRow };
    if (!data.profile) throw new Error("پروفایل یافت نشد.");
    return data.profile;
  },
  async updateProfile(input: {
    firstName?: string;
    lastName?: string;
    email?: string;
    mobile?: string;
    activityType?: string;
    businessName?: string;
    referralCode?: string;
    bio?: string;
  }): Promise<ProfileRow> {
    const data = await jsonOrThrow(await fetch("/api/auth/me/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
      credentials: "same-origin",
    })) as { profile?: ProfileRow };
    if (!data.profile) throw new Error("به‌روزرسانی پروفایل ناموفق بود.");
    return data.profile;
  },
  async changePassword(input: { currentPassword: string; newPassword: string }): Promise<{ ok: boolean }> {
    return jsonOrThrow(await fetch("/api/auth/me/password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
      credentials: "same-origin",
    }));
  },
  async getNotifyPrefs(): Promise<NotifyPrefsRow> {
    const data = await jsonOrThrow(await fetch("/api/auth/me/notify-prefs", { credentials: "same-origin" }));
    return data.prefs ?? {};
  },
  async updateNotifyPrefs(input: NotifyPrefsRow): Promise<NotifyPrefsRow> {
    const data = await jsonOrThrow(await fetch("/api/auth/me/notify-prefs", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
      credentials: "same-origin",
    }));
    return data.prefs ?? input;
  },
  // ============================================================
  // TASK 10-C — AI / GOLD / WOO / TICKETS / NOTIFICATIONS / ADS / INBOX
  // ============================================================
  async getGoldBots(): Promise<GoldBotRow[]> {
    const data = await jsonOrThrow(await fetch("/api/gold/bot", { credentials: "same-origin" })) as { items?: GoldBotRow[] };
    return data.items ?? [];
  },
  async createGoldBot(body: { enabled?: boolean; instrument: string; direction: string; thresholdPct: number; intervalMin?: number; destinationId?: string }): Promise<{ ok: boolean; bot: GoldBotRow }> {
    const data = await jsonOrThrow(await fetch("/api/gold/bot", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), credentials: "same-origin" }));
    if (!data.bot) throw new Error(data.errorFa ?? "ساخت بات طلا ناموفق بود.");
    return { ok: true, bot: data.bot };
  },
  async updateGoldBot(body: { id: string; enabled?: boolean; direction?: string; thresholdPct?: number; intervalMin?: number; destinationId?: string | null }): Promise<{ ok: boolean; bot: GoldBotRow }> {
    const data = await jsonOrThrow(await fetch("/api/gold/bot", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), credentials: "same-origin" }));
    if (!data.bot) throw new Error(data.errorFa ?? "به‌روزرسانی بات طلا ناموفق بود.");
    return { ok: true, bot: data.bot };
  },
  async deleteGoldBot(id: string): Promise<{ ok: boolean }> {
    const data = await jsonOrThrow(await fetch(`/api/gold/bot?id=${encodeURIComponent(id)}`, { method: "DELETE", credentials: "same-origin" }));
    return { ok: data.ok === true };
  },
  async getInboxThreads(): Promise<{ items: InboxThread[] }> {
    const data = await jsonOrThrow(await fetch("/api/inbox", { credentials: "same-origin" }));
    return { items: data.items ?? [] };
  },
  async getInboxMessages(threadId: string): Promise<{ items: InboxMessage[]; botId: string; providerUserId: string }> {
    const data = await jsonOrThrow(await fetch(`/api/inbox/${encodeURIComponent(threadId)}`, { credentials: "same-origin" }));
    return {
      items: data.items ?? [],
      botId: data.botId ?? "",
      providerUserId: data.providerUserId ?? "",
    };
  },
  async sendInboxReply(threadId: string, message: string): Promise<{ ok: boolean; sent?: number; failed?: number; errorFa?: string }> {
    const data = await jsonOrThrow(await fetch(`/api/inbox/${encodeURIComponent(threadId)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message }),
      credentials: "same-origin",
    }));
    return { ok: data.ok === true, sent: data.sent, failed: data.failed, errorFa: data.errorFa };
  },
  async getAutoResponder(): Promise<AutoResponderConfig> {
    const data = await jsonOrThrow(await fetch("/api/auto-responder", { credentials: "same-origin" }));
    // Server returns the config directly; we normalize to defaults if absent.
    return {
      id: data.id,
      enabled: data.enabled ?? false,
      destinationId: data.destinationId ?? null,
      rules: Array.isArray(data.rules) ? data.rules : [],
      fallbackFa: data.fallbackFa ?? "",
      aiProvider: data.aiProvider ?? null,
      aiModel: data.aiModel ?? null,
      loopGuardSeconds: data.loopGuardSeconds ?? 60,
      dailyLimit: data.dailyLimit ?? 100,
      usedToday: data.usedToday ?? 0,
    };
  },
  async updateAutoResponder(input: Partial<Omit<AutoResponderConfig, "id" | "usedToday">>): Promise<AutoResponderConfig> {
    const data = await jsonOrThrow(await fetch("/api/auto-responder", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
      credentials: "same-origin",
    }));
    return {
      id: data.id,
      enabled: data.enabled ?? false,
      destinationId: data.destinationId ?? null,
      rules: Array.isArray(data.rules) ? data.rules : [],
      fallbackFa: data.fallbackFa ?? "",
      aiProvider: data.aiProvider ?? null,
      aiModel: data.aiModel ?? null,
      loopGuardSeconds: data.loopGuardSeconds ?? 60,
      dailyLimit: data.dailyLimit ?? 100,
      usedToday: data.usedToday ?? 0,
    };
  },
  // ============================================================
  // TASK 10-D — Bot Builder + Admin Panel
  // ============================================================
  // ----- Bot Workflows -----
  async getBotWorkflows(botId: string): Promise<WorkflowRow[]> {
    const data = await jsonOrThrow(await fetch(`/api/bots/${botId}/workflows`, { credentials: "same-origin" })) as { items?: WorkflowRow[] };
    return (data.items ?? []).map((w) => ({
      ...w,
      steps: Array.isArray(w.steps) ? (w.steps as WorkflowStep[]) : [],
      triggerKind: (w.triggerKind ?? "message") as WorkflowRow["triggerKind"],
      triggerValue: w.triggerValue ?? null,
    }));
  },
  async createBotWorkflow(botId: string, body: {
    name: string;
    steps: WorkflowStep[];
    enabled?: boolean;
    triggerKind?: "message" | "command" | "callback";
    triggerValue?: string | null;
  }): Promise<WorkflowRow> {
    const data = await jsonOrThrow(await fetch(`/api/bots/${botId}/workflows`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      credentials: "same-origin",
    })) as { ok?: boolean; workflow?: Partial<WorkflowRow> };
    if (!data.workflow?.id) throw new Error("ساخت گردش کار ناموفق بود.");
    return {
      id: data.workflow.id,
      name: data.workflow.name ?? body.name,
      enabled: data.workflow.enabled ?? body.enabled ?? true,
      steps: body.steps,
      triggerKind: data.workflow.triggerKind ?? body.triggerKind ?? "message",
      triggerValue: data.workflow.triggerValue ?? body.triggerValue ?? null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  },
  async updateBotWorkflow(botId: string, workflowId: string, body: {
    name?: string;
    enabled?: boolean;
    steps?: WorkflowStep[];
    triggerKind?: "message" | "command" | "callback";
    triggerValue?: string | null;
  }): Promise<Partial<WorkflowRow>> {
    return jsonOrThrow(await fetch(`/api/bots/${botId}/workflows/${workflowId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      credentials: "same-origin",
    }));
  },
  async deleteBotWorkflow(botId: string, workflowId: string): Promise<void> {
    await fetch(`/api/bots/${botId}/workflows/${workflowId}`, { method: "DELETE", credentials: "same-origin" });
  },
  // ----- Bot Link Codes -----
  async generateLinkCode(botId: string): Promise<LinkCodeResult> {
    return jsonOrThrow(await fetch(`/api/bots/${botId}/link-code`, { method: "POST", credentials: "same-origin" }));
  },
  async getLinkCodes(botId: string): Promise<LinkCodeRow[]> {
    const data = await jsonOrThrow(await fetch(`/api/bots/${botId}/link-codes`, { credentials: "same-origin" }));
    return data.items ?? [];
  },
  // ----- Bot History -----
  async getBotHistory(botId: string, params?: {
    page?: number; pageSize?: number; direction?: "inbound" | "outbound"; providerUserId?: string;
  }): Promise<BotHistoryResponse> {
    const qs = new URLSearchParams();
    if (params?.page) qs.set("page", String(params.page));
    if (params?.pageSize) qs.set("pageSize", String(params.pageSize));
    if (params?.direction) qs.set("direction", params.direction);
    if (params?.providerUserId) qs.set("providerUserId", params.providerUserId);
    const tail = qs.toString();
    const url = tail ? `/api/bots/${botId}/history?${tail}` : `/api/bots/${botId}/history`;
    const data = await jsonOrThrow(await fetch(url, { credentials: "same-origin" }));
    return {
      items: data.items ?? [],
      total: data.total ?? 0,
      page: data.page ?? 1,
      pageSize: data.pageSize ?? 50,
      totalPages: data.totalPages ?? 1,
    };
  },
  // ----- Bot Broadcast -----
  async broadcastBot(botId: string, body: {
    message: string;
    audienceProviderUserIds?: string[];
  }): Promise<BroadcastResult> {
    return jsonOrThrow(await fetch(`/api/bots/${botId}/broadcast`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      credentials: "same-origin",
    }));
  },
  // ============================================================
  // ADMIN — typed wrappers (the previous bare getAdmin* are kept
  // for backward compat; these return strongly typed payloads).
  // ============================================================
  async getAdminUsersTyped(params?: { search?: string; status?: string; role?: string; limit?: number; offset?: number }): Promise<{ items: AdminUserRow[]; total: number }> {
    const qs = new URLSearchParams();
    if (params?.search) qs.set("search", params.search);
    if (params?.status) qs.set("status", params.status);
    if (params?.role) qs.set("role", params.role);
    if (params?.limit) qs.set("limit", String(params.limit));
    if (params?.offset) qs.set("offset", String(params.offset));
    const tail = qs.toString();
    const url = tail ? `/api/admin/users?${tail}` : "/api/admin/users";
    return jsonOrThrow(await fetch(url, { credentials: "same-origin" }));
  },
  async adminUserPatch(id: string, body: { status?: "active" | "suspended"; role?: "user" | "support" | "admin" }): Promise<{ ok: boolean; user: { id: string; status: string; role: string } }> {
    return jsonOrThrow(await fetch(`/api/admin/users/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      credentials: "same-origin",
    }));
  },
  /**
   * Admin-only: set a new password for a user. The admin cannot reset their
   * own password through this endpoint (the server rejects it with 400);
   * the regular /api/auth/me/password flow must be used for self-service.
   */
  async adminResetUserPassword(id: string, newPassword: string): Promise<{ ok: boolean }> {
    return jsonOrThrow(await fetch(`/api/admin/users/${id}/reset-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ newPassword }),
      credentials: "same-origin",
    }));
  },
  async getAdminPlansTyped(): Promise<{ items: AdminPlanRow[] }> {
    return jsonOrThrow(await fetch("/api/admin/plans", { credentials: "same-origin" }));
  },
  async adminCreatePlan(body: AdminPlanInput): Promise<{ ok: boolean; planId: string }> {
    return jsonOrThrow(await fetch("/api/admin/plans", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      credentials: "same-origin",
    }));
  },
  async adminUpdatePlan(id: string, body: AdminPlanPatch): Promise<{ ok: boolean }> {
    return jsonOrThrow(await fetch(`/api/admin/plans/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      credentials: "same-origin",
    }));
  },
  async adminDeletePlan(id: string): Promise<{ ok: boolean }> {
    return jsonOrThrow(await fetch(`/api/admin/plans/${id}`, { method: "DELETE", credentials: "same-origin" }));
  },
  async getAdminAuditTyped(params?: { actor?: string; action?: string; targetType?: string; limit?: number; offset?: number }): Promise<{ items: AdminAuditRow[]; total: number }> {
    const qs = new URLSearchParams();
    if (params?.actor) qs.set("actor", params.actor);
    if (params?.action) qs.set("action", params.action);
    if (params?.targetType) qs.set("targetType", params.targetType);
    if (params?.limit) qs.set("limit", String(params.limit));
    if (params?.offset) qs.set("offset", String(params.offset));
    const tail = qs.toString();
    const url = tail ? `/api/admin/audit?${tail}` : "/api/admin/audit";
    return jsonOrThrow(await fetch(url, { credentials: "same-origin" }));
  },
  async getAdminHealthTyped(): Promise<AdminHealthResponse> {
    return jsonOrThrow(await fetch("/api/admin/health", { credentials: "same-origin" }));
  },
  async getAdminAdsTyped(): Promise<{ items: AdminAdRow[] }> {
    return jsonOrThrow(await fetch("/api/admin/ads", { credentials: "same-origin" }));
  },
  async adminApproveAd(id: string): Promise<{ ok: boolean; ad: AdminAdRow }> {
    return jsonOrThrow(await fetch(`/api/admin/ads/${id}/approve`, { method: "POST", credentials: "same-origin" }));
  },
  async adminRejectAd(id: string): Promise<{ ok: boolean; ad: AdminAdRow }> {
    return jsonOrThrow(await fetch(`/api/admin/ads/${id}/reject`, { method: "POST", credentials: "same-origin" }));
  },
  async getAdminDiscountsTyped(): Promise<{ items: AdminDiscountRow[] }> {
    return jsonOrThrow(await fetch("/api/admin/discounts", { credentials: "same-origin" }));
  },
  async adminCreateDiscount(body: {
    code: string; kind: "percent" | "fixed"; value: number;
    maxUses?: number; perUserLimit?: number; expiresAt?: string | null;
    active?: boolean; planIds?: string[];
  }): Promise<{ ok: boolean; discount: AdminDiscountRow }> {
    return jsonOrThrow(await fetch("/api/admin/discounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      credentials: "same-origin",
    }));
  },
  async adminUpdateDiscount(id: string, body: Partial<{
    kind: "percent" | "fixed"; value: number; maxUses: number;
    perUserLimit: number; expiresAt: string | null; active: boolean; planIds: string[];
  }>): Promise<{ ok: boolean; discount: AdminDiscountRow }> {
    return jsonOrThrow(await fetch(`/api/admin/discounts/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      credentials: "same-origin",
    }));
  },
  async adminDeleteDiscount(id: string): Promise<{ ok: boolean }> {
    return jsonOrThrow(await fetch(`/api/admin/discounts/${id}`, { method: "DELETE", credentials: "same-origin" }));
  },
  async getAdminBankCardsTyped(): Promise<{ items: AdminBankCardRow[]; allowedBanks: string[] }> {
    return jsonOrThrow(await fetch("/api/admin/bank-cards", { credentials: "same-origin" }));
  },
  async adminAddBankCard(body: { cardNumber: string; holderName: string; bankName: string }): Promise<{ ok: boolean; card: AdminBankCardRow }> {
    return jsonOrThrow(await fetch("/api/admin/bank-cards", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      credentials: "same-origin",
    }));
  },
  async adminDeleteBankCard(id: string): Promise<{ ok: boolean }> {
    return jsonOrThrow(await fetch(`/api/admin/bank-cards/${id}`, { method: "DELETE", credentials: "same-origin" }));
  },
  async adminToggleBankCard(id: string, active: boolean): Promise<{ ok: boolean; card: AdminBankCardRow }> {
    return jsonOrThrow(await fetch(`/api/admin/bank-cards/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active }),
      credentials: "same-origin",
    }));
  },
  async adminApproveOrder(id: string, notes?: string): Promise<{ ok: boolean; paidRials?: number; orderId?: string; status?: string }> {
    return jsonOrThrow(await fetch(`/api/admin/orders/${id}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(notes ? { notes } : {}),
      credentials: "same-origin",
    }));
  },
  async adminRejectOrder(id: string, reason?: string): Promise<{ ok: boolean }> {
    return jsonOrThrow(await fetch(`/api/admin/orders/${id}/reject`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(reason ? { reason } : {}),
      credentials: "same-origin",
    }));
  },
  async getAdminSubscriptionsTyped(params?: { page?: number; pageSize?: number; status?: string }): Promise<{ items: AdminSubscriptionRow[]; total: number; page: number; pageSize: number }> {
    const qs = new URLSearchParams();
    if (params?.page) qs.set("page", String(params.page));
    if (params?.pageSize) qs.set("pageSize", String(params.pageSize));
    if (params?.status) qs.set("status", params.status);
    const tail = qs.toString();
    const url = tail ? `/api/admin/subscriptions?${tail}` : "/api/admin/subscriptions";
    return jsonOrThrow(await fetch(url, { credentials: "same-origin" }));
  },
  async getAdminOrdersTyped(params?: AdminOrdersQuery): Promise<{ orders: AdminOrderRow[]; items: AdminOrderRow[]; total: number; page: number; pageSize: number }> {
    const qs = new URLSearchParams();
    if (params?.page) qs.set("page", String(params.page));
    if (params?.pageSize) qs.set("pageSize", String(params.pageSize));
    if (params?.status) qs.set("status", params.status);
    if (params?.kind) qs.set("kind", params.kind);
    if (params?.provider) qs.set("provider", params.provider);
    if (params?.q) qs.set("q", params.q);
    if (params?.from) qs.set("from", params.from);
    if (params?.to) qs.set("to", params.to);
    const tail = qs.toString();
    const url = tail ? `/api/admin/orders?${tail}` : "/api/admin/orders";
    // Best-effort: returns empty list if the admin list endpoint isn't built yet.
    try {
      const data = await jsonOrThrow(await fetch(url, { credentials: "same-origin" }));
      const orders: AdminOrderRow[] = data.orders ?? data.items ?? [];
      return {
        orders,
        items: orders, // backward-compat alias for legacy callers
        total: data.total ?? 0,
        page: data.page ?? 1,
        pageSize: data.pageSize ?? 20,
      };
    } catch {
      return { orders: [], items: [], total: 0, page: 1, pageSize: 20 };
    }
  },
  async getAdminBotsTyped(): Promise<{ items: AdminBotRow[] }> {
    return jsonOrThrow(await fetch("/api/admin/bots", { credentials: "same-origin" }));
  },
  async getAdminWooTyped(): Promise<{ items: AdminWooStoreRow[] }> {
    return jsonOrThrow(await fetch("/api/admin/woo", { credentials: "same-origin" }));
  },
  async getAdminGoldTyped(): Promise<{ items: AdminGoldBotRow[] }> {
    return jsonOrThrow(await fetch("/api/admin/gold", { credentials: "same-origin" }));
  },
  async adminBroadcast(body: {
    filter: string; titleFa: string; bodyFa: string; link?: string;
  }): Promise<{ ok: boolean; sent: number }> {
    return jsonOrThrow(await fetch("/api/admin/notifications/broadcast", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      credentials: "same-origin",
    }));
  },
  async getAdminTicketsTyped(params?: { limit?: number; offset?: number; status?: string; assignedToId?: string | null; departmentId?: string | null }): Promise<{ items: AdminTicketRow[]; total: number }> {
    const qs = new URLSearchParams();
    if (params?.limit) qs.set("limit", String(params.limit));
    if (params?.offset) qs.set("offset", String(params.offset));
    if (params?.status) qs.set("status", params.status);
    if (params?.assignedToId !== undefined) qs.set("assignedToId", params.assignedToId ?? "null");
    if (params?.departmentId !== undefined) qs.set("departmentId", params.departmentId ?? "null");
    const tail = qs.toString();
    const url = tail ? `/api/admin/tickets?${tail}` : "/api/admin/tickets";
    return jsonOrThrow(await fetch(url, { credentials: "same-origin" }));
  },
  async adminAssignTicket(ticketId: string, supportUserId: string): Promise<{ ok: boolean }> {
    return jsonOrThrow(await fetch("/api/admin/tickets", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: ticketId, supportUserId }),
      credentials: "same-origin",
    }));
  },
  async adminAssignTicketFields(ticketId: string, body: {
    departmentId?: string | null;
    assignedToId?: string | null;
    priority?: "low" | "normal" | "high" | "urgent";
  }): Promise<{ ok: boolean }> {
    return jsonOrThrow(await fetch(`/api/admin/tickets/${ticketId}/assign`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      credentials: "same-origin",
    }));
  },
  async getTicketDepartments(): Promise<{ items: TicketDepartmentRow[] }> {
    return jsonOrThrow(await fetch("/api/admin/tickets/departments", { credentials: "same-origin" }));
  },
  async adminCreateDepartment(body: {
    nameFa: string;
    descriptionFa?: string;
    priority?: number;
    active?: boolean;
  }): Promise<{ ok: boolean; department: TicketDepartmentRow }> {
    return jsonOrThrow(await fetch("/api/admin/tickets/departments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      credentials: "same-origin",
    }));
  },
  async adminUpdateDepartment(id: string, body: Partial<{
    nameFa: string;
    descriptionFa: string;
    priority: number;
    active: boolean;
  }>): Promise<{ ok: boolean }> {
    return jsonOrThrow(await fetch(`/api/admin/tickets/departments/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      credentials: "same-origin",
    }));
  },
  async adminDeleteDepartment(id: string): Promise<{ ok: boolean }> {
    return jsonOrThrow(await fetch(`/api/admin/tickets/departments/${id}`, {
      method: "DELETE",
      credentials: "same-origin",
    }));
  },
  /**
   * POST a reply with optional attachments (multipart/form-data).
   * The fetch is `credentials: "same-origin"` so the session cookie is sent.
   * The returned `reply` carries the same shape as the JSON reply route, but
   * `attachments` is always populated when files are attached.
   */
  async replyTicketWithAttachments(
    ticketId: string,
    body: string,
    files: File[],
    opts?: { close?: boolean },
  ): Promise<{ ok: boolean; reply: TicketReplyView }> {
    const fd = new FormData();
    fd.append("body", body);
    if (opts?.close) fd.append("close", "true");
    for (const f of files) {
      fd.append("files", f, f.name);
    }
    const r = await fetch(`/api/tickets/${ticketId}/replies`, {
      method: "POST",
      body: fd,
      credentials: "same-origin",
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      throw new Error((data as { errorFa?: string })?.errorFa ?? `خطای ${r.status}`);
    }
    if (!(data as { reply?: TicketReplyView }).reply) {
      throw new Error((data as { errorFa?: string })?.errorFa ?? "ثبت پاسخ ناموفق بود.");
    }
    return { ok: true, reply: (data as { reply: TicketReplyView }).reply };
  },
  /**
   * Returns the URL to stream a single attachment. The endpoint enforces
   * owner-or-staff authorization; do NOT expose this URL to non-authorized
   * users (the API will 403 them anyway, but better to not even render).
   */
  getTicketAttachmentUrl(ticketId: string, attachmentId: string): string {
    return `/api/tickets/${ticketId}/attachments/${attachmentId}`;
  },
  async getAdminSettingsTyped(): Promise<AdminSettingsResponse> {
    return jsonOrThrow(await fetch("/api/admin/settings", { credentials: "same-origin" }));
  },
  async adminUpdateSetting(key: string, value: string): Promise<{ ok: boolean; setting: AdminSettingRow }> {
    return jsonOrThrow(await fetch("/api/admin/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, value }),
      credentials: "same-origin",
    }));
  },
  /**
   * Batch save — accepts an array of {key, value} and upserts them in one
   * PATCH request. Used by the grouped settings UI's per-card save.
   */
  async adminBatchUpdateSettings(items: Array<{ key: string; value: string }>): Promise<{ ok: boolean; count: number }> {
    return jsonOrThrow(await fetch("/api/admin/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items }),
      credentials: "same-origin",
    }));
  },
  /**
   * Delete a single SystemSetting row (revert to env / built-in default).
   */
  async adminResetSetting(key: string): Promise<{ ok: boolean }> {
    return jsonOrThrow(await fetch("/api/admin/settings", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key }),
      credentials: "same-origin",
    }));
  },
  /**
   * GET the gold price config row (GoldPriceConfig model). Returns null
   * when no row exists yet (the API defaults to { source: "free_talaapi"
   * } server-side).
   */
  async getAdminGoldConfig(): Promise<AdminGoldConfigRow> {
    return jsonOrThrow(await fetch("/api/admin/gold/config", { credentials: "same-origin" }));
  },
  async adminUpdateGoldConfig(body: AdminGoldConfigInput): Promise<{ ok: boolean; config: AdminGoldConfigRow }> {
    return jsonOrThrow(await fetch("/api/admin/gold/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      credentials: "same-origin",
    }));
  },
  async adminRefreshGoldPrices(): Promise<AdminGoldRefreshResult> {
    return jsonOrThrow(await fetch("/api/admin/gold/refresh", {
      method: "POST",
      credentials: "same-origin",
    }));
  },
};
