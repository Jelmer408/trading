import type { Metadata } from "next";
import { JetBrains_Mono } from "next/font/google";
import "./globals.css";
import TopNav from "@/components/layout/TopNav";

const mono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "CANDLEBOT /// CONTROL",
  description: "Autonomous trading system control panel",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={mono.variable}>
        <TopNav />
        <main className="pt-[88px] px-4 pb-8 max-w-[1400px] mx-auto">
          {children}
        </main>
      </body>
    </html>
  );
}
