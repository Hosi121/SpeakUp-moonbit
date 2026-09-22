import { useEffect, useMemo, type ReactNode } from "react";
import { useLocation } from "../navigation/location";
import { createActivityLoader } from "../../../dist/shell.js";
import { Activity } from "./activity";

export function ActivityLayout({ children }: { children: ReactNode }) {
  useLocation();
  const token = localStorage.getItem("token");
  const controller = useMemo(
    () =>
      createActivityLoader({
        enabled: !!token,
        load: (ready, failed) => {
          void import("./features").then(
            (module) => ready(module.activityController()),
            () => failed("通知機能を読み込めませんでした。"),
          );
        },
      }),
    [token],
  );
  useEffect(() => {
    controller.start();
    return controller.stop;
  }, [controller]);
  return <Activity.Provider value={controller}>{children}</Activity.Provider>;
}
