/** A single body read and explicit cancellation; interpretation belongs to MoonBit. */
export function createTextTransport(
  baseUrl: string,
  readToken: () => string | null,
) {
  const base = baseUrl.replace(/\/+$/, "");
  return (
    method: string,
    path: string,
    body: string | FormData | undefined,
    authenticated: boolean,
    done: (status: number, text: string, failed: boolean) => void,
  ): (() => void) => {
    const abort = new AbortController();
    if (!path.startsWith("/") || path.startsWith("//") || path.includes("\\")) {
      done(0, "", true);
      return () => {};
    }
    const headers: Record<string, string> = { Accept: "application/json" };
    const token = authenticated ? readToken() : null;
    if (token) headers.Authorization = `Bearer ${token}`;
    if (typeof body === "string" && body)
      headers["Content-Type"] = "application/json";
    void fetch(base + path, {
      method,
      headers,
      body: body || undefined,
      signal: abort.signal,
      credentials: "same-origin",
    })
      .then(async (response) => ({
        status: response.status,
        text: await response.text(),
      }))
      .then(
        (value) => done(value.status, value.text, false),
        () => done(0, "", true),
      );
    return () => abort.abort();
  };
}
