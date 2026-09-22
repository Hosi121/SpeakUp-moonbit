import type { ReactNode } from "react";
import {
  SessionBottomNavigation,
  type SessionBottomNavigationProps,
} from "../utils/SessionBottomNavigation";

export function SessionBottomNavigationTemplate({
  children,
  ...props
}: SessionBottomNavigationProps & { children: ReactNode }) {
  return (
    <div className="app-shell">
      <main className="page call-page stack">{children}</main>
      <SessionBottomNavigation {...props} />
    </div>
  );
}
