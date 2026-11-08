import type { ReactNode } from "react";
import { Brand } from "./Brand";
import { ThemeToggle } from "./ThemeToggle";

export function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <div className="shell">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="topbar">
        <Brand />
        <div className="topbar-end">
          <ThemeToggle />
        </div>
      </header>
      <main id="main" className="main">
        {children}
      </main>
    </div>
  );
}
