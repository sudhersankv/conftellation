import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { cookies } from "next/headers";
import { Toaster } from "sonner";
import { SessionProvider } from "@/lib/ui/session-context";
import "./globals.css";

const geist = localFont({ src: "./fonts/GeistVF.woff", variable: "--font-geist-sans", weight: "100 900" });

export const metadata: Metadata = {
  title: "Conftellations",
  description: "Every conference you've been to, connected.",
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#0B0B12" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const jar = cookies();
  return (
    <html lang="en" className={geist.variable}>
      <body className="bg-bg font-sans text-text antialiased">
        <SessionProvider initialUserId={jar.get("ptc_user")?.value} initialConfId={jar.get("ptc_conf")?.value}>
          {children}
        </SessionProvider>
        <Toaster
          position="top-center"
          theme="dark"
          offset={{ top: "calc(env(safe-area-inset-top) + 64px)" }}
          toastOptions={{
            unstyled: true,
            classNames: {
              toast: "flex w-full max-w-md items-center gap-3 rounded-lg border border-border bg-surface2 px-4 py-3 text-sm text-text shadow-xl",
              title: "text-sm text-text",
              description: "text-xs text-muted",
              actionButton: "ml-auto h-8 shrink-0 rounded-md bg-accent px-3 text-xs font-semibold text-bg",
              cancelButton: "h-8 shrink-0 rounded-md px-3 text-xs text-muted",
              error: "border-danger/60",
            },
          }}
        />
      </body>
    </html>
  );
}
