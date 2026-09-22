import type { RealtimePorts, SocketPort } from "../../../dist/presenter.js";
import { isVisible } from "./browser.ts";
import { notifyActivity } from "./activityEvents.ts";

export function socket(
  path: string,
  receive: (kind: string, text: string) => void,
): SocketPort {
  const url = new URL(import.meta.env.VITE_API_URL ?? "/", location.origin);
  url.protocol =
    url.protocol === "https:" || url.protocol === "wss:" ? "wss:" : "ws:";
  url.pathname = path;
  const ws = new WebSocket(url);
  ws.onopen = () => receive("open", "");
  ws.onmessage = (event) =>
    receive(
      typeof event.data === "string" ? "text" : "binary",
      typeof event.data === "string" ? event.data : "",
    );
  ws.onerror = () => receive("error", "");
  ws.onclose = () => receive("close", "");
  return {
    send: (text) => {
      if (ws.readyState !== WebSocket.OPEN) return false;
      try {
        ws.send(text);
        return true;
      } catch {
        return false;
      }
    },
    // Keep onclose attached for network/error closure; explicit cleanup detaches all.
    close: () => {
      ws.onopen = null;
      ws.onmessage = null;
      ws.onerror = null;
      ws.onclose = null;
      ws.close();
    },
  };
}
export const realtimePorts = (): RealtimePorts => ({
  socket,
  visible: isVisible,
  notify: notifyActivity,
  on_focus: (callback) => {
    document.addEventListener("visibilitychange", callback);
    window.addEventListener("focus", callback);
    return () => {
      document.removeEventListener("visibilitychange", callback);
      window.removeEventListener("focus", callback);
    };
  },
});
