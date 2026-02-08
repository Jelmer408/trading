"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useBotStatus } from "@/hooks/useBotStatus";

const navItems = [
  { href: "/", label: "OVERVIEW" },
  { href: "/charts", label: "CHARTS" },
  { href: "/trades", label: "TRADES" },
  { href: "/news", label: "NEWS" },
  { href: "/performance", label: "METRICS" },
  { href: "/settings", label: "SYSTEM" },
];

export default function TopNav() {
  const pathname = usePathname();
  const { data: status } = useBotStatus();

  const isOnline = status?.status === "online";

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-[#000] border-b border-[#161616]">
      <div className="flex items-center justify-between px-4 h-10 border-b border-[#0e0e0e]">
        <div className="flex items-center gap-3">
          <span className="text-[#e8e8e8] font-bold text-sm tracking-[0.08em]">
            CANDLEBOT
          </span>
          <span className="text-[#2a2a2a] text-[10px] tracking-[0.08em] hidden sm:inline">
            AUTONOMOUS TRADING
          </span>
        </div>
        <div className="flex items-center gap-4 text-[10px] tracking-[0.08em] text-[#555]">
          {status && (
            <>
              <span className="hidden md:inline">{status.uptime}</span>
              <span className="hidden lg:inline">
                {status.activity.bars_received.toLocaleString()} bars
              </span>
            </>
          )}
          <div className="flex items-center gap-2">
            <div
              className={`w-[5px] h-[5px] rounded-full ${isOnline ? "bg-[#3fcf6d]" : "bg-[#e5484d]"}`}
              style={{ animation: "blink 2s ease-in-out infinite" }}
            />
            <span className={isOnline ? "text-[#888]" : "text-[#e5484d]"}>
              {isOnline ? "ONLINE" : "OFFLINE"}
            </span>
          </div>
        </div>
      </div>

      <nav className="flex items-center px-4 h-[36px] gap-0 overflow-x-auto">
        {navItems.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`
                px-4 h-full flex items-center text-[10px] tracking-[0.1em]
                border-r border-[#161616] transition-colors whitespace-nowrap
                ${
                  active
                    ? "text-[#e8e8e8] bg-[#0a0a0a] border-b border-b-[#e8e8e8]"
                    : "text-[#555] hover:text-[#999] hover:bg-[#060606]"
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
