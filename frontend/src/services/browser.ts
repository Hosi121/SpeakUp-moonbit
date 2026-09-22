import { createTextTransport } from "./transport.ts";
// Concrete browser primitives for the generated TS2Mbt binding.
// The MoonBit controller decides when to request, retry, acknowledge and cancel.
export { onActivity } from "./activityEvents.ts";

export function requestText(
  method: string,
  path: string,
  body: string,
  done: (status: number, text: string, failed: boolean) => void,
): () => void {
  return sendText(method, path, body, done, true);
}
export function requestPublic(
  method: string,
  path: string,
  body: string,
  done: (status: number, text: string, failed: boolean) => void,
): () => void {
  return sendText(method, path, body, done, false);
}
function sendText(
  method: string,
  path: string,
  body: string,
  done: (status: number, text: string, failed: boolean) => void,
  authenticated: boolean,
): () => void {
  return createTextTransport(import.meta.env.VITE_API_URL ?? "/api", () =>
    localStorage.getItem("token"),
  )(method, path, body, authenticated, done);
}

export const randomId = (): string => crypto.randomUUID();
export const formatTime = (value: string): string =>
  new Date(value).toLocaleString();
export const numberValue = (value: string): number => Number(value);
export const now = (): number => Date.now();
export const dateValue = (value: string): number => new Date(value).getTime();
export const isoDate = (value: string): string => {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : "";
};
export const encode = (value: string): string => encodeURIComponent(value);
export const token = (): string => localStorage.getItem("token") ?? "";
export function storeToken(value: string): void {
  if (value) localStorage.setItem("token", value);
  else localStorage.removeItem("token");
}
export function go(path: string, replace: boolean): void {
  const url = new URL(path, window.location.href);
  if (url.origin !== window.location.origin)
    throw new Error("アプリ内の URL を指定してください");
  if (url.href === window.location.href) return;
  if (replace) history.replaceState(null, "", url);
  else history.pushState(null, "", url);
  window.dispatchEvent(new Event("speakup:navigate"));
}
export function timeout(delay: number, callback: () => void): () => void {
  const timer = setTimeout(callback, delay);
  return () => clearTimeout(timer);
}
export const isVisible = (): boolean => document.visibilityState === "visible";

export function onVisibility(listener: (visible: boolean) => void): () => void {
  const notify = () => listener(isVisible());
  document.addEventListener("visibilitychange", notify);
  return () => document.removeEventListener("visibilitychange", notify);
}

// Check the handwritten host against the contract consumed by TS2Mbt.
type Conforms<Implementation extends Contract, Contract> = Implementation;
export type BrowserContract = Conforms<
  typeof import("./browser"),
  typeof import("../../../bindings/browser")
>;
