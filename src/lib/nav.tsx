import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

export type Page =
  | "dashboard"
  | "generate"
  | "saved"
  | "recent"
  | "meal-plan"
  | "language"
  | "account";

interface NavState {
  page: Page;
  navigate: (page: Page) => void;
}

const NavContext = createContext<NavState | undefined>(undefined);

export function NavProvider({ children }: { children: ReactNode }) {
  const [page, setPage] = useState<Page>("dashboard");
  const value = useMemo<NavState>(() => ({ page, navigate: setPage }), [page]);
  return <NavContext.Provider value={value}>{children}</NavContext.Provider>;
}

export function useNav() {
  const ctx = useContext(NavContext);
  if (!ctx) throw new Error("useNav must be used within NavProvider");
  return ctx;
}
