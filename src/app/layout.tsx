import type { Metadata, Viewport } from "next";
import "@fontsource/plus-jakarta-sans/600.css";
import "@fontsource/plus-jakarta-sans/700.css";
import "@fontsource/plus-jakarta-sans/800.css";
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "./globals.css";
import { ThemeProvider, themeAntiFlashScript } from "@/components/theme/ThemeProvider";
import { ToastProvider } from "@/components/ui/Toast";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
  title: {
    default: "KELEME — Study Smarter",
    template: "%s · KELEME",
  },
  description:
    "Study notes, textbooks, past matric papers and practice questions for Ethiopian students in grades 9 to 12.",
  manifest: "/manifest.json",
  applicationName: "KELEME",
  appleWebApp: { capable: true, title: "KELEME", statusBarStyle: "default" },
  formatDetection: { telephone: false },
  openGraph: {
    type: "website",
    siteName: "KELEME",
    title: "KELEME — Study Smarter",
    description: "Notes, textbooks, matric papers and practice questions for grades 9 to 12.",
  },
};

export const viewport: Viewport = {
  themeColor: "#2563eb",
  width: "device-width",
  initialScale: 1,
  // Not maximum-scale=1: pinch-zoom is how a student reads a dense diagram on
  // a small screen, and disabling it is an accessibility failure.
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Runs before hydration so returning users never see a flash of the
            default theme while React boots. */}
        <script dangerouslySetInnerHTML={{ __html: themeAntiFlashScript }} />
      </head>
      <body className="min-h-full antialiased">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[200] focus:rounded-lg focus:bg-accent focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-[var(--accent-contrast)]"
        >
          Skip to content
        </a>
        <ThemeProvider>
          <ToastProvider>{children}</ToastProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
