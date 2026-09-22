import type { ReactNode } from "react";
import {
  MainBottomNavigation,
  type mainBottomNavigation,
} from "../utils/MainBottomNavigation";

export function BottomNavigationTemplate({
  value,
  children,
}: {
  value: mainBottomNavigation;
  children: ReactNode;
}) {
  return (
    <div className="app-shell">
      <main>{children}</main>
      <MainBottomNavigation value={value} />
    </div>
  );
}
