// =====================================================================
// POSTYAR — Persian GLOBAL error boundary (addendum § Persian
// 403/404/500, § no stack trace leakage)
// ---------------------------------------------------------------------
// This file REPLACES RootLayout when the root layout itself throws
// during render. It must therefore include its own <html> and <body>
// and its own minimal styling. We keep the Vazirmatn @font-face chain
// inline (same as globals.css) so the font still loads from the local
// /fonts/ assets and there is NO Google Fonts fallback.
// =====================================================================
"use client";
import { useEffect } from "react";

// Local Vazirmatn only — NO Google Fonts, NO CDN (addendum § fonts).
// Built as a plain string and injected via dangerouslySetInnerHTML so
// the curly braces in CSS do not collide with JSX expression braces.
const FONT_AND_STYLE_HTML =
  '@font-face{font-family:Vazirmatn;font-style:normal;font-weight:400;font-display:swap;src:url("/fonts/Vazirmatn-Regular.woff2") format("woff2")}' +
  '@font-face{font-family:Vazirmatn;font-style:normal;font-weight:700;font-display:swap;src:url("/fonts/Vazirmatn-Bold.woff2") format("woff2")}' +
  '@font-face{font-family:Vazirmatn;font-style:normal;font-weight:900;font-display:swap;src:url("/fonts/Vazirmatn-Black.woff2") format("woff2")}' +
  "body{margin:0;background:#0a3a3a;color:#e8f5f5;font-family:Vazirmatn,system-ui,sans-serif;display:flex;min-height:100vh;flex-direction:column;align-items:center;justify-content:center;padding:1.5rem;text-align:center}" +
  ".code{font-size:5rem;font-weight:900;line-height:1;margin:0 0 .5rem;color:#5eead8}" +
  ".title{font-size:1.5rem;font-weight:700;margin:0 0 .75rem;color:#e8f5f5}" +
  ".msg{font-size:.875rem;line-height:1.75;margin:0 0 1.5rem;color:#a0c4c4;max-width:28rem}" +
  ".btn{display:inline-block;padding:.625rem 1.25rem;border-radius:.5rem;background:#0d4f4f;color:#e8f5f5;text-decoration:none;font-weight:600;font-size:.875rem;margin:.25rem}";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    if (typeof console !== "undefined" && typeof console.error === "function") {
      console.error("[postyar] global error:", error?.digest ?? "no-digest");
    }
  }, [error]);

  return (
    <html lang="fa-IR" dir="rtl">
      <head>
        <style
          dangerouslySetInnerHTML={{ __html: FONT_AND_STYLE_HTML }}
        />
      </head>
      <body>
        <main role="alert" aria-live="assertive">
          <p className="code" aria-hidden="true">
            ۵۰۰
          </p>
          <h1 className="title">خطای سامانه</h1>
          <p className="msg">
            خطایی پیش‌بینی‌نشده در بارگذاری برنامه رخ داد. می‌توانید دوباره
            تلاش کنید. جزئیات فنی فقط در سامانهٔ پشتیبانی ثبت می‌شود و هیچ
            اطلاعات محرمانه‌ای نمایش داده نمی‌شود.
          </p>
          <div>
            <button className="btn" onClick={() => reset()}>
              تلاش دوباره
            </button>
            <a className="btn" href="/">
              بازگشت به خانه
            </a>
          </div>
        </main>
      </body>
    </html>
  );
}
