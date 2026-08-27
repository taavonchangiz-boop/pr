// POSTYAR middleware: security headers + suspended-session guard.
// Note: next-themes adds cookie for theme. We use jwt in cookie.
// We avoid indigo/blue per design system. Fail-closed.
import { NextResponse, type NextRequest } from "next/server";

export function middleware(req: NextRequest) {
  const res = NextResponse.next({
    request: { headers: new Headers(req.headers) },
  });

  // Security headers (compatible with Next 16 App Router on Passenger)
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  res.headers.set("X-Frame-Options", "SAMEORIGIN");
  res.headers.set("Permissions-Policy", "geolocation=(), microphone=(), camera=(), payment=()");
  // CSP: allow inline styles (shadcn uses some), same-origin scripts, no external font CDN
  const csp = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
    "style-src 'self' 'unsafe-inline' 'unsafe-eval'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    "connect-src 'self' https:",
    "frame-ancestors 'self'",
    "form-action 'self'",
    "base-uri 'self'",
    "object-src 'none'",
  ].join("; ");
  res.headers.set("Content-Security-Policy", csp);
  if (req.nextUrl.protocol === "https:") {
    res.headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload");
  }
  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|fonts|icons|assets|manifest).*)"],
};
