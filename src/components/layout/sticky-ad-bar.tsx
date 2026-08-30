"use client";
// =====================================================================
// POSTYAR — StickyAdBar
// ---------------------------------------------------------------------
// A thin, fixed-position sticky bar that shows a single active sticky-bar
// ad campaign. The dashboard agent mounts this at the dashboard root:
//   <StickyAdBar placement="sticky_bar" position="top" />
// It fetches its own data from /api/ads/serve/<placement> (public) so it
// is fully self-contained. Dismissal is per-session (localStorage key
// `postyar_ad_dismissed_<id>`); the bar reappears for a new campaign or a
// new session.
// =====================================================================
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ExternalLinkIcon, MegaphoneIcon, XIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type StickyAdBarProps = {
  /** Placement key (must exist in AdPlacement and be of kind `sticky_bar`). */
  placement: string;
  /** Bar position. Defaults to "top". */
  position?: "top" | "bottom";
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

function dismissKey(id: string): string {
  return `postyar_ad_dismissed_${id}`;
}

function isDismissed(id: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.sessionStorage.getItem(dismissKey(id)) === "1";
  } catch {
    return false;
  }
}

function setDismissed(id: string): void {
  try {
    window.sessionStorage.setItem(dismissKey(id), "1");
  } catch {
    /* storage may be unavailable (private mode) — fail silently */
  }
}

export function StickyAdBar({ placement, position = "top", className }: StickyAdBarProps) {
  const [mounted, setMounted] = useState(false);
  // Dismissed state lives in component state so a re-render can hide the bar
  // immediately on click (no need to refetch).
  const [dismissedId, setDismissedId] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const q = useQuery<ServeResponse>({
    queryKey: ["ad-serve", "sticky", placement],
    queryFn: async () => {
      const r = await fetch(`/api/ads/serve/${encodeURIComponent(placement)}`, {
        headers: { Accept: "application/json" },
      });
      if (!r.ok) return { campaigns: [] };
      return (await r.json()) as ServeResponse;
    },
    staleTime: 30_000,
    // SSR is off (this is a client component); keep the query disabled until
    // mounted to avoid hydration noise.
    enabled: mounted,
  });

  // Don't render anything on the server — fixed bars with state don't SSR well.
  if (!mounted) return null;

  const campaign = q.data?.campaigns?.[0] ?? null;
  if (!campaign) return null;
  // Per-session dismiss: if the current campaign was dismissed, hide the bar.
  if (dismissedId === campaign.id) return null;
  if (isDismissed(campaign.id)) return null;

  const isBottom = position === "bottom";
  const positionClass = isBottom
    ? "fixed inset-x-0 bottom-0 z-40 pb-[env(safe-area-inset-bottom)]"
    : "fixed inset-x-0 top-0 z-40 pt-[env(safe-area-inset-top)]";

  function onDismiss() {
    setDismissedId(campaign!.id);
    setDismissed(campaign!.id);
  }

  function onLinkClick() {
    if (!campaign) return;
    // Fire-and-forget click increment.
    void fetch(`/api/ads/click/${encodeURIComponent(campaign.id)}`, {
      method: "POST",
      keepalive: true,
    }).catch(() => undefined);
  }

  return (
    <div
      dir="rtl"
      className={cn(
        "border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80",
        "shadow-sm motion-safe:transition-transform",
        positionClass,
        className,
      )}
      role="region"
      aria-label="تبلیغ"
    >
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-3 py-2">
        {/* Thumbnail — visually right in RTL (flex order: first child = right) */}
        {campaign.imagePath ? (
          <img
            src={campaign.imagePath}
            alt={campaign.title}
            loading="lazy"
            className="size-10 shrink-0 rounded-md border object-cover"
          />
        ) : (
          <div className="flex size-10 shrink-0 items-center justify-center rounded-md border bg-muted text-muted-foreground">
            <MegaphoneIcon className="size-5" />
          </div>
        )}

        {/* Center: title + description */}
        <div className="min-w-0 flex-1 flex flex-col gap-0.5">
          <div className="truncate text-sm font-medium">{campaign.title}</div>
          {campaign.descriptionFa && (
            <div className="truncate text-xs text-muted-foreground">{campaign.descriptionFa}</div>
          )}
        </div>

        {/* CTA link (left in RTL) */}
        {campaign.link && (
          <a
            href={campaign.link}
            target="_blank"
            rel="noopener noreferrer"
            onClick={onLinkClick}
            className="inline-flex shrink-0 items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground cursor-pointer focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none motion-safe:transition-colors hover:bg-primary/90"
          >
            مشاهده
            <ExternalLinkIcon className="size-3.5" />
          </a>
        )}

        {/* Dismiss button */}
        <button
          type="button"
          onClick={onDismiss}
          aria-label="بستن"
          className="inline-flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground cursor-pointer focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none motion-safe:transition-colors hover:bg-muted hover:text-foreground"
        >
          <XIcon className="size-4" />
        </button>
      </div>
    </div>
  );
}

export default StickyAdBar;
