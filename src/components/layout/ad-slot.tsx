"use client";
// =====================================================================
// POSTYAR — AdSlot
// ---------------------------------------------------------------------
// Client component that fetches active campaigns for a placement key and
// renders them by kind:
//   banner_inline → wide banner card (image + title + description + CTA)
//   sidebar_card  → compact card
//   sticky_bar    → delegates to <StickyAdBar /> (which is self-contained)
//   fullscreen    → dismissible full-width strip
// Empty state: render null (no chrome, no "no ads" text — non-intrusive).
// Loading: render a skeleton. Error: render null.
//
// Each ad links open in a new tab; clicking the CTA fires-and-forgets a
// POST /api/ads/click/<id>.
//
// Usage (dashboard agent wires these into the dashboard):
//   <AdSlot placement="user_dashboard_top" />
//   <AdSlot placement="user_dashboard_sidebar" />
// =====================================================================
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ExternalLinkIcon, MegaphoneIcon, XIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { StickyAdBar } from "@/components/layout/sticky-ad-bar";

export type AdSlotProps = {
  placement: string;
  className?: string;
};

interface ServedCampaign {
  id: string;
  title: string;
  descriptionFa: string;
  link: string | null;
  imagePath: string | null;
  kind: string;
}

interface ServeResponse {
  campaigns: ServedCampaign[];
}

function trackClick(id: string): void {
  // Fire-and-forget; keepalive ensures the request survives page navigation.
  void fetch(`/api/ads/click/${encodeURIComponent(id)}`, {
    method: "POST",
    keepalive: true,
  }).catch(() => undefined);
}

export function AdSlot({ placement, className }: AdSlotProps) {
  const q = useQuery<ServeResponse>({
    queryKey: ["ad-serve", placement],
    queryFn: async () => {
      const r = await fetch(`/api/ads/serve/${encodeURIComponent(placement)}`, {
        headers: { Accept: "application/json" },
      });
      if (!r.ok) return { campaigns: [] };
      return (await r.json()) as ServeResponse;
    },
    staleTime: 30_000,
  });

  // Empty / error: render nothing. The dashboard layout must not show
  // empty ad placeholders.
  if (q.isError) return null;
  const campaigns = q.data?.campaigns ?? [];
  if (!q.isLoading && campaigns.length === 0) return null;

  // Determine kind from the first campaign (all campaigns in a placement
  // share the same kind, since kind is a property of the placement itself).
  const kind = campaigns[0]?.kind ?? "banner_inline";

  // Delegate sticky bars to the dedicated component (which is fully
  // self-contained — fetches its own data and handles dismiss).
  if (kind === "sticky_bar") {
    return <StickyAdBar placement={placement} position="top" className={className} />;
  }

  if (q.isLoading) {
    return <AdSlotSkeleton kind={kind} className={className} />;
  }

  if (kind === "fullscreen") {
    return <FullscreenStrip campaign={campaigns[0]} className={className} />;
  }
  if (kind === "sidebar_card") {
    return (
      <div className={cn("flex flex-col gap-3", className)} dir="rtl">
        {campaigns.map((c) => (
          <SidebarCard key={c.id} campaign={c} />
        ))}
      </div>
    );
  }
  // Default: banner_inline
  return (
    <div className={cn("flex flex-col gap-3", className)} dir="rtl">
      {campaigns.map((c) => (
        <BannerInline key={c.id} campaign={c} />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------
// Variants
// ---------------------------------------------------------------------

function BannerInline({ campaign }: { campaign: ServedCampaign }) {
  return (
    <a
      href={campaign.link ?? "#"}
      target={campaign.link ? "_blank" : undefined}
      rel={campaign.link ? "noopener noreferrer" : undefined}
      onClick={() => trackClick(campaign.id)}
      className="group block overflow-hidden rounded-lg border bg-card text-card-foreground shadow-sm cursor-pointer focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none motion-safe:transition-shadow hover:shadow-md"
      dir="rtl"
    >
      <div className="flex flex-col gap-0 sm:flex-row sm:items-stretch">
        {campaign.imagePath ? (
          <div className="sm:w-40 sm:shrink-0">
            <img
              src={campaign.imagePath}
              alt={campaign.title}
              loading="lazy"
              className="h-32 w-full object-cover sm:h-full"
            />
          </div>
        ) : null}
        <div className="flex min-w-0 flex-1 flex-col gap-1 p-3">
          <div className="flex items-center gap-2 text-sm font-medium">
            <MegaphoneIcon className="size-4 text-muted-foreground" />
            <span className="truncate">{campaign.title}</span>
          </div>
          {campaign.descriptionFa && (
            <p className="line-clamp-2 text-xs text-muted-foreground">{campaign.descriptionFa}</p>
          )}
          {campaign.link && (
            <span className="mt-auto inline-flex items-center gap-1 text-xs text-primary motion-safe:transition-colors group-hover:underline">
              مشاهده تبلیغ
              <ExternalLinkIcon className="size-3" />
            </span>
          )}
        </div>
      </div>
    </a>
  );
}

function SidebarCard({ campaign }: { campaign: ServedCampaign }) {
  return (
    <a
      href={campaign.link ?? "#"}
      target={campaign.link ? "_blank" : undefined}
      rel={campaign.link ? "noopener noreferrer" : undefined}
      onClick={() => trackClick(campaign.id)}
      className="group block overflow-hidden rounded-lg border bg-card text-card-foreground shadow-sm cursor-pointer focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none motion-safe:transition-shadow hover:shadow-md"
      dir="rtl"
    >
      {campaign.imagePath && (
        <img
          src={campaign.imagePath}
          alt={campaign.title}
          loading="lazy"
          className="h-24 w-full object-cover"
        />
      )}
      <div className="flex flex-col gap-1 p-3">
        <div className="truncate text-sm font-medium">{campaign.title}</div>
        {campaign.descriptionFa && (
          <p className="line-clamp-2 text-xs text-muted-foreground">{campaign.descriptionFa}</p>
        )}
        {campaign.link && (
          <span className="mt-1 inline-flex items-center gap-1 text-xs text-primary motion-safe:transition-colors group-hover:underline">
            مشاهده
            <ExternalLinkIcon className="size-3" />
          </span>
        )}
      </div>
    </a>
  );
}

function FullscreenStrip({ campaign, className }: { campaign: ServedCampaign; className?: string }) {
  // Per-session dismiss (so the user isn't bombarded on every navigation).
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;
  return (
    <div
      className={cn(
        "relative w-full overflow-hidden rounded-lg border bg-card text-card-foreground shadow-sm",
        className,
      )}
      dir="rtl"
    >
      <button
        type="button"
        onClick={() => setDismissed(true)}
        aria-label="بستن"
        className="absolute left-2 top-2 z-10 inline-flex size-7 items-center justify-center rounded-md bg-background/80 text-foreground cursor-pointer focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none motion-safe:transition-colors hover:bg-background"
      >
        <XIcon className="size-3.5" />
      </button>
      <a
        href={campaign.link ?? "#"}
        target={campaign.link ? "_blank" : undefined}
        rel={campaign.link ? "noopener noreferrer" : undefined}
        onClick={() => trackClick(campaign.id)}
        className="block cursor-pointer focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        {campaign.imagePath ? (
          <div className="relative">
            <img
              src={campaign.imagePath}
              alt={campaign.title}
              loading="lazy"
              className="h-48 w-full object-cover sm:h-64"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
            <div className="absolute inset-x-0 bottom-0 flex flex-col gap-1 p-4 text-white">
              <div className="text-base font-semibold drop-shadow">{campaign.title}</div>
              {campaign.descriptionFa && (
                <p className="line-clamp-2 text-xs text-white/90 drop-shadow">{campaign.descriptionFa}</p>
              )}
              {campaign.link && (
                <span className="mt-1 inline-flex items-center gap-1 text-xs text-white motion-safe:transition-colors group-hover:underline">
                  مشاهده تبلیغ
                  <ExternalLinkIcon className="size-3" />
                </span>
              )}
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-1 p-4">
            <div className="flex items-center gap-2 text-sm font-medium">
              <MegaphoneIcon className="size-4 text-muted-foreground" />
              <span className="truncate">{campaign.title}</span>
            </div>
            {campaign.descriptionFa && (
              <p className="text-xs text-muted-foreground">{campaign.descriptionFa}</p>
            )}
          </div>
        )}
      </a>
    </div>
  );
}

function AdSlotSkeleton({ kind, className }: { kind: string; className?: string }) {
  if (kind === "sidebar_card") {
    return (
      <div className={cn("flex flex-col gap-3", className)} dir="rtl">
        <Skeleton className="h-40 w-full rounded-lg" />
      </div>
    );
  }
  if (kind === "fullscreen") {
    return <Skeleton className={cn("h-48 w-full rounded-lg sm:h-64", className)} />;
  }
  return <Skeleton className={cn("h-32 w-full rounded-lg", className)} />;
}

export default AdSlot;
