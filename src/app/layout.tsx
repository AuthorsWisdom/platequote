import type { Metadata } from "next";
import { Fraunces, Outfit } from "next/font/google";
import { SiteHeader } from "@/components/site-header";
import "./globals.css";

const outfit = Outfit({
  subsets: ["latin"],
  variable: "--font-outfit",
});

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
});

export const metadata: Metadata = {
  title: "PlateQuote",
  description: "Slice an STL, price it from the shop's rates, and pay in the PayPal sandbox.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${outfit.variable} ${fraunces.variable}`}>
      <body className="min-h-screen bg-background text-foreground antialiased">
        <SiteHeader />
        <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
      </body>
    </html>
  );
}
