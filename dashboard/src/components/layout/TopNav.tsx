"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useBotStatus } from "@/hooks/useBotStatus";

const navItems = [
  { href: "/", label: "Overview" },
  { href: "/charts", label: "Charts" },
  { href: "/trades", label: "Trades" },
  { href: "/reddit", label: "Reddit" },
  { href: "/news", label: "News" },
  { href: "/performance", label: "Metrics" },
  { href: "/settings", label: "System" },
];

export default function TopNav() {
  const pathname = usePathname();
  const { data: status } = useBotStatus();

  const isOnline = status?.status === "online";

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-white border-b border-[#e5e5e5]">
      <div className="flex items-center justify-between px-5 h-12">
        <div className="flex items-center gap-3">
          <span className="text-[#111] font-bold text-sm tracking-tight">
            CandleBot
          </span>
          <span className="text-[#999] text-xs hidden sm:inline">
            Autonomous Trading
          </span>
        </div>
        <div className="flex items-center gap-4 text-xs text-[#555]">
          {status && (
            <>
              <span className="hidden md:inline">{status.uptime}</span>
              <span className="hidden lg:inline">
                {status?.activity?.bars_received?.toLocaleString() ?? "0"} bars
              </span>
            </>
          )}
          <div className="flex items-center gap-2">
            <div
              className={`w-2 h-2 rounded-full ${isOnline ? "bg-[#16a34a]" : "bg-[#dc2626]"}`}
              style={{ animation: "blink 2s ease-in-out infinite" }}
            />
            <span className={isOnline ? "text-[#16a34a] font-medium" : "text-[#dc2626] font-medium"}>
              {isOnline ? "Online" : "Offline"}
            </span>
          </div>
        </div>
      </div>

      <nav className="flex items-center px-5 h-10 gap-1 overflow-x-auto border-t border-[#f0f0f0]">
        {navItems.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`
                px-3 py-1.5 text-xs rounded-md transition-colors whitespace-nowrap
                ${
                  active
                    ? "text-[#111] bg-[#f0f0f0] font-medium"
                    : "text-[#999] hover:text-[#555] hover:bg-[#f8f8f8]"
                }
              `}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
