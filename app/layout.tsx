import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { Libre_Caslon_Display, Libre_Caslon_Text } from "next/font/google";
import { cookies } from "next/headers";
import { Toaster } from "sonner";
import { SessionProvider } from "@/lib/ui/session-context";
import "./globals.css";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});
const caslonDisplay = Libre_Caslon_Display({ subsets: ["latin"], weight: "400", variable: "--font-caslon-display" });
// Canvas can't use CSS vars in ctx.font: read the family once via getComputedStyle(document.documentElement).getPropertyValue("--font-caslon-text").
const caslonText = Libre_Caslon_Text({ subsets: ["latin"], weight: "400", style: "italic", variable: "--font-caslon-text" });

export const metadata: Metadata = {
  title: "Conftellations",
  description: "Your conference, drawn as a constellation.",
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#05071A" };

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const jar = cookies(); // sync in Next 14: first render already has the right user
  return (
    <html lang="en" className={`${geistSans.variable} ${caslonDisplay.variable} ${caslonText.variable}`}>
      <body className="bg-abyss font-sans text-star antialiased">
        <SessionProvider initialUserId={jar.get("ptc_user")?.value} initialConfId={jar.get("ptc_conf")?.value}>
          {children}
        </SessionProvider>
        <Toaster
          position="top-center"
          theme="dark"
          offset={{ top: "calc(env(safe-area-inset-top) + 64px)" }}
          mobileOffset={{ top: "calc(env(safe-area-inset-top) + 64px)", left: "16px", right: "16px" }}
          toastOptions={{
            unstyled: true,
            classNames: {
              toast: "flex w-full items-center gap-3 rounded-card border border-hairline bg-ink/95 px-4 py-3 text-star backdrop-blur-xl",
              title: "text-meta text-star",
              description: "text-micro text-dust",
              actionButton: "ml-auto h-8 shrink-0 rounded-full bg-polaris px-3 text-micro font-semibold text-abyss",
              cancelButton: "h-8 shrink-0 rounded-full px-3 text-micro text-dust",
              error: "border-flare/60",
            },
          }}
        />
      </body>
    </html>
  );
}
