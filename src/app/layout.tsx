import type { Metadata } from "next";
import { Geist, Geist_Mono, Inter } from "next/font/google";
import "./globals.css";
import { LayoutClient } from "@/components/layout/LayoutClient";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["200", "300", "400", "500", "600", "700", "800", "900"],
});

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
      className={`${geistSans.variable} ${geistMono.variable} ${inter.variable}`}
    >
      <body>
        <LayoutClient>{children}</LayoutClient>
      </body>
    </html>
  );
}
