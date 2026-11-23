import type { Metadata, Viewport } from "next";
import { Geist_Mono, Inter } from "next/font/google";
import "./globals.css";
import { LayoutClient } from "@/components/layout/LayoutClient";

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

// Mobile-first viewport. Never disable zoom (maximumScale/userScalable) —
// it breaks accessibility and pinch-zoom on iOS.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#1b2a4a",
};

export const metadata: Metadata = {
  title: {
    default: "PGSO-PSMS",
    template: `%s | PGSO-PSMS`,
  },
  description:
    "An integrated web-based property and supply management system with business analytics for operational monitoring and asset accountability.",
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "https://pgso.dev",
    siteName: "PGSO-PSMS",
  },
  robots: {
    index: false,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistMono.variable} ${inter.variable}`}
    >
      <body>
        <LayoutClient>{children}</LayoutClient>
      </body>
    </html>
  );
}
