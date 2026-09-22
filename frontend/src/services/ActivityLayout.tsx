import { useEffect, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import type { InboxDto } from "../../../dist/shared.js";
import { Activity } from "./activity";
import { fetchInbox } from "./features";

export function ActivityLayout() {
  useLocation(); // Login/logout navigation re-evaluates the local credential.
  const token = localStorage.getItem("token");
  const [state, setState] = useState({
    revision: 0,
    inbox: null as InboxDto | null,
    error: "",
    connected: false,
    clockOffset: 0,
  });
  useEffect(() => {
    let disposed = false;
    let socket: WebSocket | undefined;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let debounce: ReturnType<typeof setTimeout> | undefined;
    let attempts = 0;
    let sequence = 0;
    setState({
      revision: 0,
      inbox: null,
      error: "",
      connected: false,
      clockOffset: 0,
    });
    if (!token) return;
    const refresh = () => {
      clearTimeout(debounce);
      debounce = setTimeout(() => {
        const current = ++sequence;
        const started = Date.now();
        void fetchInbox()
          .then((inbox) => {
            if (!disposed && sequence === current)
              setState((s) => ({
                ...s,
                inbox,
                error: "",
                revision: s.revision + 1,
                // The shared clock accepts integer epoch milliseconds.
                clockOffset: Math.round(inbox.now - (started + Date.now()) / 2),
              }));
          })
          .catch(() => {
            if (!disposed && sequence === current)
              setState((s) => ({
                ...s,
                error: "通知を取得できませんでした。",
                revision: s.revision + 1,
              }));
          });
      }, 100);
    };
    const connect = () => {
      if (disposed) return;
      const base = new URL(
        import.meta.env.VITE_API_URL ?? "/",
        location.origin,
      );
      base.protocol =
        base.protocol === "https:" || base.protocol === "wss:" ? "wss:" : "ws:";
      base.pathname = "/activity";
      socket = new WebSocket(base);
      socket.onopen = () =>
        socket?.send(JSON.stringify({ token: `Bearer ${token}` }));
      socket.onmessage = (event) => {
        if (event.data !== '{"type":"refresh"}') return;
        attempts = 0;
        setState((s) => ({ ...s, connected: true }));
        refresh();
      };
      socket.onclose = () => {
        if (disposed) return;
        setState((s) => ({ ...s, connected: false }));
        retry = setTimeout(
          connect,
          Math.min(30000, 1000 * 2 ** Math.min(attempts++, 5)),
        );
      };
      socket.onerror = () => socket?.close();
    };
    const focus = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", focus);
    window.addEventListener("focus", focus);
    // Reconcile durable state after a missed post-commit hint, without polling the call path.
    const recovery = setInterval(focus, 60000);
    // StrictMode may mount and immediately dispose the effect.
    retry = setTimeout(connect, 0);
    refresh();
    return () => {
      disposed = true;
      clearTimeout(retry);
      clearTimeout(debounce);
      clearInterval(recovery);
      document.removeEventListener("visibilitychange", focus);
      window.removeEventListener("focus", focus);
      if (socket) {
        socket.onclose = null;
        socket.onerror = null;
        socket.onmessage = null;
        socket.onopen = null;
        socket.close();
      }
    };
  }, [token]);
  return (
    <Activity.Provider value={state}>
      <Outlet />
    </Activity.Provider>
  );
}
