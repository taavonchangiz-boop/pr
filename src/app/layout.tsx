// POSTYAR root layout: RTL, Vazirmatn, Persian metadata, PWA manifest,
// theme provider, Toaster. NO Google Fonts anywhere.
import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { Providers } from "@/components/layout/providers";
import { Toaster as Sonner } from "@/components/ui/sonner";

const APP_NAME = "پُست‌یار";
const APP_DESC = "پلتفرم پُست‌یار برای مدیریت محتوا، زمان‌بندی انتشار، بات‌ساز تلگرام/باله/روبیکا، پرداخت، کیف پول، ارجاع، تبلیغات، هوش مصنوعی، طلا و ووکامرس.";

export const metadata: Metadata = {
  metadataBase: new URL("https://postyar.example"),
  title: {
    default: `${APP_NAME} | پلتفرم مدیریت انتشار، بات‌ساز و پرداخت`,
    template: `%s | ${APP_NAME}`,
  },
  description: APP_DESC,
  applicationName: APP_NAME,
  keywords: ["پست یار", "مدیریت محتوا", "زمان‌بندی انتشار", "بات تلگرام", "بات باله", "بات روبیکا", "پرداخت باه", "کیف پول", "هوش مصنوعی", "طلای ۱۸", "ووکامرس"],
  authors: [{ name: "پُست‌یار" }],
  creator: "پُست‌یار",
  manifest: "/manifest/manifest.webmanifest",
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    locale: "fa_IR",
    url: "/",
    siteName: APP_NAME,
    title: `${APP_NAME} — پلتفرم مدیریت انتشار و بات‌ساز`,
    description: APP_DESC,
  },
  twitter: {
    card: "summary_large_image",
    title: APP_NAME,
    description: APP_DESC,
  },
  icons: {
    icon: [{ url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
    apple: [{ url: "/icons/icon-512.png", sizes: "512x512" }],
  },
  category: "technology",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#0d4f4f" },
    { media: "(prefers-color-scheme: dark)", color: "#0a3a3a" },
  ],
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: APP_NAME,
  applicationCategory: "BusinessApplication",
  operatingSystem: "Web",
  inLanguage: "fa-IR",
  description: APP_DESC,
  offers: { "@type": "Offer", price: "0", priceCurrency: "IRR" },
  publisher: { "@type": "Organization", name: APP_NAME },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fa-IR" dir="rtl" suppressHydrationWarning>
      <body className="font-sans antialiased bg-background text-foreground">
        <Providers>
          <div className="app-shell">
            <main>{children}</main>
          </div>
        </Providers>
        <Toaster />
        <Sonner richColors closeButton position="top-center" />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      </body>
    </html>
  );
}
