import { useEffect, useRef, useSyncExternalStore } from "react";

/** Own a controller for the keyed view's lifetime without storing application state. */
export function useOwnedController<T>(create: () => T): T {
  const ref = useRef<{ value: T } | null>(null);
  if (!ref.current) ref.current = { value: create() };
  return ref.current.value;
}

/** React owns mounting and rendering; the controller owns state and effects. */
export function useController<T>(controller: {
  get_snapshot: () => T;
  subscribe: (listener: () => void) => () => void;
  start: () => void;
  stop: () => void;
}): T {
  const snapshot = useSyncExternalStore(
    controller.subscribe,
    controller.get_snapshot,
  );
  useEffect(() => {
    controller.start();
    return controller.stop;
  }, [controller]);
  return snapshot;
}
