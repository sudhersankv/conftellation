import type { Metadata, Viewport } from "next";
import { Caveat, DM_Sans, Space_Grotesk } from "next/font/google";
import { cookies } from "next/headers";
import { Toaster } from "sonner";
import { SessionProvider } from "@/lib/ui/session-context";
import "./globals.css";

const heading = Space_Grotesk({ subsets: ["latin"], weight: ["500", "700"], variable: "--font-heading", display: "swap" });
const body = DM_Sans({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-body", display: "swap" });
const hand = Caveat({ subsets: ["latin"], weight: ["600"], variable: "--font-hand", display: "swap" });

export const metadata: Metadata = {
  title: "Conftellations",
  description: "Every conference you've been to, connected.",
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#FFF7E8" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const jar = cookies();
  return (
    <html lang="en" className={`${heading.variable} ${body.variable} ${hand.variable}`}>
      <body className="bg-bg font-sans text-text antialiased">
        <SessionProvider initialUserId={jar.get("ptc_user")?.value} initialConfId={jar.get("ptc_conf")?.value}>
          {children}
        </SessionProvider>
        <Toaster
          position="top-center"
          theme="light"
          offset={{ top: "calc(env(safe-area-inset-top) + 64px)" }}
          toastOptions={{
            unstyled: true,
            classNames: {
              toast: "flex w-full max-w-md items-center gap-3 rounded-xl border-2 border-border bg-surface px-4 py-3 text-sm text-text shadow-hard",
              title: "font-heading text-sm font-bold text-text",
              description: "text-xs text-muted",
              actionButton: "ml-auto h-8 shrink-0 rounded-full border-2 border-border bg-accent px-3 font-heading text-xs font-bold text-ink shadow-hardSm",
              cancelButton: "h-8 shrink-0 rounded-full px-3 text-xs text-muted",
              error: "!bg-[#FFE3E4]",
            },
          }}
        />
      </body>
    </html>
  );
}
