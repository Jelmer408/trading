"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useBotStatus } from "@/hooks/useBotStatus";

const navItems = [
  { href: "/", label: "OVERVIEW" },
  { href: "/charts", label: "CHARTS" },
  { href: "/trades", label: "TRADES" },
  { href: "/performance", label: "METRICS" },
  { href: "/settings", label: "SYSTEM" },
];

export default function TopNav() {
  const pathname = usePathname();
  const { data: status } = useBotStatus();

  const isOnline = status?.status === "online";

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-[#000] border-b border-[#1a1a1a]">
      {/* Top strip */}
      <div className="flex items-center justify-between px-4 h-10 border-b border-[#111]">
        <div className="flex items-center gap-3">
          <span className="text-[#00ff41] font-bold text-sm tracking-[0.15em]">
            /// CANDLEBOT
          </span>
          <span className="text-[#333] text-[10px] tracking-[0.1em] hidden sm:inline">
            AUTONOMOUS TRADING SYSTEM
          </span>
        </div>
        <div className="flex items-center gap-4 text-[10px] tracking-[0.1em] text-[#555]">
          {status && (
            <>
              <span className="hidden md:inline">
                UPTIME {status.uptime}
              </span>
              <span className="hidden lg:inline">
                BARS {status.activity.bars_received.toLocaleString()}
              </span>
            </>
          )}
          <div className="flex items-center gap-2">
            <div
              className={`w-[6px] h-[6px] ${
                isOnline ? "bg-[#00ff41]" : "bg-[#ff0040]"
              }`}
              style={{ animation: "blink 2s ease-in-out infinite" }}
            />
            <span className={isOnline ? "text-[#00ff41]" : "text-[#ff0040]"}>
              {isOnline ? "ONLINE" : "OFFLINE"}
            </span>
          </div>
        </div>
      </div>

      {/* Nav tabs */}
      <nav className="flex items-center px-4 h-[38px] gap-0 overflow-x-auto">
        {navItems.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`
                px-4 h-full flex items-center text-[11px] tracking-[0.12em]
                border-r border-[#1a1a1a] transition-colors whitespace-nowrap
                ${
                  active
                    ? "text-[#00ff41] bg-[#001a08] border-b-2 border-b-[#00ff41]"
                    : "text-[#555] hover:text-[#999] hover:bg-[#0a0a0a]"
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
