"use client";
// POSTYAR client-side routing shell — hash-based since the spec requires the
// entire app to live at /. Each module is a view component registered below.
import { useEffect, useState, useCallback, useMemo, type ReactNode } from "react";
import { useSession } from "@/components/layout/session-provider";
import { Landing } from "@/components/postyar/landing/landing";
import { Rules } from "@/components/postyar/landing/rules";
import { Training } from "@/components/postyar/landing/training";
import { Auth } from "@/components/postyar/auth/auth";
import { Dashboard } from "@/components/postyar/dashboard/dashboard";
import { Toaster } from "@/components/ui/toaster";

// NOTE: `training` is NOT a public route — it is reachable from inside the
// authenticated dashboard via `#/dashboard/training` (the dashboard's
// renderView switch owns the actual <Training> rendering). The public routes
// exposed here are limited to: landing, rules (and auth).
type Route =
  | "landing"
  | "auth"
  | "dashboard"
  | "rules";

function parseHash(): { route: Route; view?: string; param?: string } {
  const h = window.location.hash.replace(/^#\/?/, "");
  const [route, view, param] = h.split("/");
  // PUBLIC routes — accessible logged-in OR logged-out
  if (route === "rules") return { route: "rules" };
  if (!route || route === "landing" || route === "" ) return { route: "landing" };
  if (route === "auth" || route === "login" || route === "register") return { route: "auth" };
  if (route === "dashboard") return { route: "dashboard", view: view ?? "home", param };
  return { route: "landing" };
}

export function PostyarApp() {
  const { user, loading } = useSession();
  const [route, setRoute] = useState<Route>("landing");
  const [view, setView] = useState<string | undefined>();
  const [param, setParam] = useState<string | undefined>();

  useEffect(() => {
    const onHash = () => {
      const p = parseHash();
      setRoute(p.route);
      setView(p.view);
      setParam(p.param);
    };
    onHash();
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const navigate = useCallback((to: string) => {
    window.location.hash = to;
  }, []);

  useEffect(() => {
    if (loading) return;
    if (user && route !== "dashboard") {
      // Authed users default to dashboard (unless they explicitly want landing)
      if (route === "auth") navigate("/dashboard");
    }
    if (!user && route === "dashboard") {
      navigate("/auth");
    }
  }, [user, loading, route, navigate]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-muted-foreground animate-pulse">در حال بارگذاری پُست‌یار…</div>
      </div>
    );
  }

  // PUBLIC routes — rendered BEFORE the auth gate so logged-out users can view them.
  // NOTE: training is intentionally NOT public — authenticated users access it
  // via /dashboard/training, which is handled by the Dashboard component itself.
  if (route === "rules") return <Rules navigate={navigate} />;

  if (!user) {
    if (route === "auth") return <Auth navigate={navigate} />;
    return <Landing navigate={navigate} />;
  }

  if (route === "dashboard") {
    return <Dashboard navigate={navigate} initialView={view ?? "home"} param={param} />;
  }

  return <Landing navigate={navigate} />;
}
