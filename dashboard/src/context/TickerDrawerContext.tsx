"use client";

import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

interface TickerDrawerState {
  symbol: string | null;
  openTicker: (symbol: string) => void;
  closeTicker: () => void;
}

const TickerDrawerContext = createContext<TickerDrawerState>({
  symbol: null,
  openTicker: () => {},
  closeTicker: () => {},
});

export function TickerDrawerProvider({ children }: { children: ReactNode }) {
  const [symbol, setSymbol] = useState<string | null>(null);

  const openTicker = useCallback((sym: string) => {
    setSymbol(sym.toUpperCase());
  }, []);

  const closeTicker = useCallback(() => {
    setSymbol(null);
  }, []);

  return (
    <TickerDrawerContext.Provider value={{ symbol, openTicker, closeTicker }}>
      {children}
    </TickerDrawerContext.Provider>
  );
}

export function useTickerDrawer() {
  return useContext(TickerDrawerContext);
}
