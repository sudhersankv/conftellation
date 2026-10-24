import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { Libre_Caslon_Display, Libre_Caslon_Text } from "next/font/google";
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
  return (
    <html lang="en" className={`${geistSans.variable} ${caslonDisplay.variable} ${caslonText.variable}`}>
      <body className="bg-abyss font-sans text-star antialiased">{children}</body>
    </html>
  );
}
