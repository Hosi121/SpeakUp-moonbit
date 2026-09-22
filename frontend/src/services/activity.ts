import { createContext, useContext, useSyncExternalStore } from "react";
import { createActivityLoader } from "../../../dist/shell.js";
export const Activity = createContext(
  createActivityLoader({ enabled: false, load() {} }),
);
export const useActivityController = () => useContext(Activity);
export function useActivity() {
  const controller = useActivityController();
  return useSyncExternalStore(controller.subscribe, controller.get_snapshot);
}
