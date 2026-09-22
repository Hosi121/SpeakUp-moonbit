import { useMemo, useSyncExternalStore } from "react";

const navigationEvent = "speakup:navigate";
const snapshot = () => window.location.href;
function subscribe(notify: () => void) {
  window.addEventListener("popstate", notify);
  window.addEventListener("hashchange", notify);
  window.addEventListener(navigationEvent, notify);
  return () => {
    window.removeEventListener("popstate", notify);
    window.removeEventListener("hashchange", notify);
    window.removeEventListener(navigationEvent, notify);
  };
}

export function useLocation(): URL {
  const href = useSyncExternalStore(subscribe, snapshot);
  return useMemo(() => new URL(href), [href]);
}

export function navigate(to: string, options: { replace?: boolean } = {}) {
  const url = new URL(to, window.location.href);
  if (url.origin !== window.location.origin) {
    throw new Error("アプリ内の URL を指定してください");
  }
  if (url.href === window.location.href) return;
  if (options.replace) window.history.replaceState(null, "", url);
  else window.history.pushState(null, "", url);
  // pushState/replaceState do not emit popstate.
  window.dispatchEvent(new Event(navigationEvent));
}
