// Concrete browser primitives for the generated TS2Mbt binding.
// The MoonBit controller decides when to request, retry, acknowledge and cancel.
export { onActivity } from "./activityEvents.ts";

export function requestText(
  method: string,
  path: string,
  body: string,
  done: (status: number, text: string, failed: boolean) => void,
): () => void {
  const abort = new AbortController();
  const headers: Record<string, string> = { Accept: "application/json" };
  const token = localStorage.getItem("token");
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body) headers["Content-Type"] = "application/json";
  const base = (import.meta.env.VITE_API_URL ?? "/api").replace(/\/+$/, "");
  void fetch(base + path, {
    method,
    headers,
    body: body || undefined,
    signal: abort.signal,
    credentials: "same-origin",
  })
    .then(async (response) => {
      const text = await response.text();
      return { status: response.status, text };
    })
    .then(
      (result) => done(result.status, result.text, false),
      () => done(0, "", true),
    );
  return () => abort.abort();
}

export const randomId = (): string => crypto.randomUUID();
export const formatTime = (value: string): string =>
  new Date(value).toLocaleString();
export const numberValue = (value: string): number => Number(value);
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
