import type { Metadata } from "next";
import { Inter, Source_Serif_4, Fraunces } from "next/font/google";

import { PrivateBanner } from "@/components/private-banner";
import { Providers } from "./providers";

import "./globals.css";

const inter = Inter({
  subsets: ["latin", "cyrillic", "cyrillic-ext"],
  variable: "--font-inter",
  display: "swap",
});

const serif = Source_Serif_4({
  subsets: ["latin", "cyrillic", "cyrillic-ext"],
  variable: "--font-serif-display",
  display: "swap",
  axes: ["opsz"],
});

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  display: "swap",
  axes: ["opsz", "SOFT"],
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? "https://tumar.app"),
  title: "Tumar · A family vault for the diaspora",
  description:
    "Send KZTE, tokenized stocks, and SOL to one wallet your family controls together. Built on Solana.",
  openGraph: {
    title: "Tumar",
    description: "A family vault for the diaspora.",
    type: "website",
  },
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/favicon-32.png", type: "image/png", sizes: "32x32" },
      { url: "/icon-192.png", type: "image/png", sizes: "192x192" },
      { url: "/icon-512.png", type: "image/png", sizes: "512x512" },
    ],
    apple: [{ url: "/apple-icon.png", sizes: "180x180" }],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${serif.variable} ${fraunces.variable}`}>
      <body>
        <Providers>
          <PrivateBanner />
          {children}
        </Providers>
      </body>
    </html>
  );
}
