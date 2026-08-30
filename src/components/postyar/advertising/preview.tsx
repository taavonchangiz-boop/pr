"use client";
// =====================================================================
// POSTYAR — AdPreview
// ---------------------------------------------------------------------
// Live preview component used both in the user-facing «کمپین جدید» form
// (renders the in-progress campaign as the user types/uploads) AND in the
// admin's pending-campaign review dialog (so the admin sees how the ad
// would actually look in the assigned placement before approving).
//
// The preview respects the placement kind:
//   - sticky_bar    → thin strip
//   - banner_inline → wide card (image + title + description + CTA)
//   - sidebar_card  → compact card
//   - fullscreen    → big strip with dismiss (visual only)
//   - slider        → rounded-2xl with nav-dots underneath
//
// If `imageUrl` is null, the preview shows a placeholder box so the user
// can still see the title/description rendering before they upload.
//
// RTL everywhere. No indigo/blue. Lucide icons only.
// =====================================================================
import {
  ExternalLinkIcon,
  ImageOffIcon,
  MegaphoneIcon,
  XIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { toPersianDigits } from "@/lib/persian";

export interface AdPreviewPlacement {
  key: string;
  labelFa: string;
  descriptionFa?: string;
  kind: string;
  recommendedWidth: number;
  recommendedHeight: number;
  maxFileBytes: number;
}

export interface AdPreviewData {
  title: string;
  descriptionFa: string;
  link: string;
  imageUrl: string | null;
  placement: AdPreviewPlacement | null;
}

export const AD_KIND_LABELS: Record<string, string> = {
  sticky_bar: "نوار چسبان",
  banner_inline: "بنر درون‌خطی",
  sidebar_card: "کارت کناری",
  fullscreen: "تمام‌صفحه",
  slider: "اسلایدر",
};

export function adKindLabelFa(k: string | undefined | null): string {
  if (!k) return "";
  return AD_KIND_LABELS[k] ?? k;
}

/** Returns a Persian hint string for the recommended size, e.g. «۱۲۰۰×۲۴۰ پیکسل».
 *  Empty string when the placement has no recommended size. */
export function recommendedSizeHint(p: AdPreviewPlacement | null): string {
  if (!p) return "";
  if (p.recommendedWidth > 0 && p.recommendedHeight > 0) {
    return `${toPersianDigits(p.recommendedWidth)}×${toPersianDigits(p.recommendedHeight)} پیکسل`;
  }
  return "";
}

/** Same shape as recommendedSizeHint but with the «سایز پیشنهادی: » prefix,
 *  ready to drop into a Badge. */
export function recommendedSizeBadgeLabel(p: AdPreviewPlacement | null): string {
  const hint = recommendedSizeHint(p);
  return hint ? `سایز پیشنهادی: ${hint}` : "";
}

export function AdPreview({ data }: { data: AdPreviewData }) {
  const kind = data.placement?.kind ?? "banner_inline";
  const sizeHint = recommendedSizeBadgeLabel(data.placement);
  const title = data.title.trim() || "عنوان نمونه";
  const description = data.descriptionFa.trim();
  const link = data.link.trim();
  const linkLabel = link ? link.replace(/^https?:\/\//, "").replace(/\/$/, "") : "لینک مقصد";

  return (
    <section
      dir="rtl"
      className="flex flex-col gap-2 rounded-lg border bg-muted/30 p-3"
      aria-label="پیش‌نمایش زنده تبلیغ"
    >
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
          <MegaphoneIcon className="size-4" />
          <span>پیش‌نمایش زنده</span>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {data.placement && (
            <Badge variant="outline" className="text-[10px]">
              {data.placement.labelFa} • {adKindLabelFa(kind)}
            </Badge>
          )}
          {sizeHint && (
            <Badge variant="secondary" className="text-[10px] tabular-nums">
              {sizeHint}
            </Badge>
          )}
        </div>
      </header>

      <div className="overflow-hidden rounded-md border bg-card">
        {kind === "sticky_bar" && (
          <PreviewStickyBar title={title} description={description} linkLabel={linkLabel} hasLink={!!link} imageUrl={data.imageUrl} />
        )}
        {kind === "banner_inline" && (
          <PreviewBannerInline title={title} description={description} linkLabel={linkLabel} hasLink={!!link} imageUrl={data.imageUrl} />
        )}
        {kind === "sidebar_card" && (
          <PreviewSidebarCard title={title} description={description} linkLabel={linkLabel} hasLink={!!link} imageUrl={data.imageUrl} />
        )}
        {kind === "fullscreen" && (
          <PreviewFullscreen title={title} description={description} linkLabel={linkLabel} hasLink={!!link} imageUrl={data.imageUrl} />
        )}
        {kind === "slider" && (
          <PreviewSlider title={title} description={description} linkLabel={linkLabel} hasLink={!!link} imageUrl={data.imageUrl} />
        )}
      </div>

      {data.placement?.maxFileBytes && data.placement.maxFileBytes > 0 ? (
        <p className="text-[10px] text-muted-foreground">
          حداکثر حجم مجاز تصویر: {toPersianDigits((data.placement.maxFileBytes / (1024 * 1024)).toFixed(1))} مگابایت
        </p>
      ) : null}
    </section>
  );
}

// ---------------------------------------------------------------------
// Variants — mirror the <AdSlot> real renderers but in a static, non-click
// preview (no click tracking, no target=_blank so the preview never opens
// a real tab while the user is typing).
// ---------------------------------------------------------------------

function PlaceholderImage({ imageUrl, alt, className }: { imageUrl: string | null; alt: string; className?: string }) {
  if (imageUrl) {
    return <img src={imageUrl} alt={alt} className={className} loading="lazy" />;
  }
  return (
    <div className={`flex items-center justify-center bg-muted text-muted-foreground ${className ?? ""}`}>
      <ImageOffIcon className="size-6 opacity-60" />
    </div>
  );
}

function PreviewStickyBar({ title, description, linkLabel, hasLink, imageUrl }: {
  title: string; description: string; linkLabel: string; hasLink: boolean; imageUrl: string | null;
}) {
  return (
    <div className="flex items-center gap-2 p-2" dir="rtl">
      {imageUrl && (
        <div className="size-10 shrink-0 overflow-hidden rounded">
          <PlaceholderImage imageUrl={imageUrl} alt={title} className="size-10 object-cover" />
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="truncate text-xs font-medium">{title}</div>
        {description && <div className="truncate text-[10px] text-muted-foreground">{description}</div>}
      </div>
      {hasLink && (
        <span className="inline-flex shrink-0 items-center gap-1 text-[10px] text-primary">
          {linkLabel}
          <ExternalLinkIcon className="size-3" />
        </span>
      )}
      <button
        type="button"
        tabIndex={-1}
        aria-hidden="true"
        className="ms-1 inline-flex size-6 items-center justify-center rounded text-muted-foreground"
      >
        <XIcon className="size-3.5" />
      </button>
    </div>
  );
}

function PreviewBannerInline({ title, description, linkLabel, hasLink, imageUrl }: {
  title: string; description: string; linkLabel: string; hasLink: boolean; imageUrl: string | null;
}) {
  return (
    <div className="flex flex-col gap-0 sm:flex-row sm:items-stretch" dir="rtl">
      {imageUrl && (
        <div className="sm:w-40 sm:shrink-0">
          <PlaceholderImage imageUrl={imageUrl} alt={title} className="h-32 w-full object-cover sm:h-full" />
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-1 p-3">
        <div className="flex items-center gap-2 text-sm font-medium">
          <MegaphoneIcon className="size-4 text-muted-foreground" />
          <span className="truncate">{title}</span>
        </div>
        {description && <p className="line-clamp-2 text-xs text-muted-foreground">{description}</p>}
        {hasLink && (
          <span className="mt-auto inline-flex items-center gap-1 text-xs text-primary">
            {linkLabel}
            <ExternalLinkIcon className="size-3" />
          </span>
        )}
      </div>
    </div>
  );
}

function PreviewSidebarCard({ title, description, linkLabel, hasLink, imageUrl }: {
  title: string; description: string; linkLabel: string; hasLink: boolean; imageUrl: string | null;
}) {
  return (
    <div className="flex flex-col gap-1 p-2" dir="rtl">
      {imageUrl && (
        <PlaceholderImage imageUrl={imageUrl} alt={title} className="h-24 w-full rounded object-cover" />
      )}
      <div className="truncate text-sm font-medium">{title}</div>
      {description && <p className="line-clamp-2 text-xs text-muted-foreground">{description}</p>}
      {hasLink && (
        <span className="mt-1 inline-flex items-center gap-1 text-xs text-primary">
          {linkLabel}
          <ExternalLinkIcon className="size-3" />
        </span>
      )}
    </div>
  );
}

function PreviewFullscreen({ title, description, linkLabel, hasLink, imageUrl }: {
  title: string; description: string; linkLabel: string; hasLink: boolean; imageUrl: string | null;
}) {
  if (imageUrl) {
    return (
      <div className="relative" dir="rtl">
        <PlaceholderImage imageUrl={imageUrl} alt={title} className="h-48 w-full object-cover sm:h-64" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 flex flex-col gap-1 p-4 text-white">
          <div className="text-base font-semibold drop-shadow">{title}</div>
          {description && <p className="line-clamp-2 text-xs text-white/90 drop-shadow">{description}</p>}
          {hasLink && (
            <span className="mt-1 inline-flex items-center gap-1 text-xs text-white">
              {linkLabel}
              <ExternalLinkIcon className="size-3" />
            </span>
          )}
        </div>
        <button
          type="button"
          tabIndex={-1}
          aria-hidden="true"
          className="absolute left-2 top-2 z-10 inline-flex size-7 items-center justify-center rounded-md bg-background/80 text-foreground"
        >
          <XIcon className="size-3.5" />
        </button>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-1 p-4" dir="rtl">
      <div className="flex items-center gap-2 text-sm font-medium">
        <MegaphoneIcon className="size-4 text-muted-foreground" />
        <span className="truncate">{title}</span>
      </div>
      {description && <p className="text-xs text-muted-foreground">{description}</p>}
    </div>
  );
}

function PreviewSlider({ title, description, linkLabel, hasLink, imageUrl }: {
  title: string; description: string; linkLabel: string; hasLink: boolean; imageUrl: string | null;
}) {
  return (
    <div className="relative" dir="rtl">
      {imageUrl ? (
        <div className="relative">
          <PlaceholderImage imageUrl={imageUrl} alt={title} className="h-56 w-full rounded-2xl object-cover sm:h-72" />
          <div className="absolute inset-0 rounded-2xl bg-gradient-to-t from-black/75 via-black/25 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 flex flex-col gap-1 p-4 text-white">
            <div className="flex items-center gap-2 text-base font-semibold drop-shadow">
              <MegaphoneIcon className="size-4 text-white/80" />
              <span className="truncate">{title}</span>
            </div>
            {description && <p className="line-clamp-2 text-xs text-white/90 drop-shadow">{description}</p>}
            {hasLink && (
              <span className="mt-1 inline-flex items-center gap-1 text-xs text-white">
                {linkLabel}
                <ExternalLinkIcon className="size-3" />
              </span>
            )}
          </div>
        </div>
      ) : (
        <div className="flex h-56 flex-col items-center justify-center gap-1 bg-muted p-4 text-center text-muted-foreground sm:h-72">
          <MegaphoneIcon className="size-6 opacity-60" />
          <div className="text-sm font-medium text-foreground/80">{title}</div>
        </div>
      )}
      {/* Nav-dots — visual cue that this is a slider slot. */}
      <div className="absolute inset-x-0 bottom-2 z-10 flex items-center justify-center gap-1.5" aria-hidden="true">
        <span className="size-2 rounded-full bg-white" />
        <span className="size-2 rounded-full bg-white/50" />
        <span className="size-2 rounded-full bg-white/50" />
      </div>
    </div>
  );
}

export default AdPreview;
