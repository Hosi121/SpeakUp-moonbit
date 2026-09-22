import { ApiError, getPayloadMessage } from "./errorUtils.ts";

export type HttpMethod = "GET" | "POST" | "PUT";
export type RequestOptions = {
  signal?: AbortSignal;
  authenticated?: boolean;
};

/** One body read; the caller decodes successful text with its concrete schema. */
export function createHttpClient(
  baseUrl: string,
  readToken: () => string | null,
) {
  const base = baseUrl.replace(/\/+$/, "");
  return async function send(
    method: HttpMethod,
    path: string,
    data?: object,
    options: RequestOptions = {},
  ): Promise<string> {
    if (!path.startsWith("/") || path.startsWith("//") || path.includes("\\")) {
      throw new ApiError("APIのパスが不正です", { code: "ERR_INVALID_URL" });
    }
    const headers: Record<string, string> = { Accept: "application/json" };
    if (options.authenticated !== false) {
      const token = readToken();
      if (token) headers.Authorization = `Bearer ${token}`;
    }
    let body: BodyInit | undefined;
    if (data instanceof FormData) {
      body = data; // The browser supplies the multipart boundary and content type.
    } else if (data !== undefined) {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify(data);
    }
    let response: Response, text: string;
    try {
      response = await fetch(`${base}${path}`, {
        method,
        headers,
        body,
        signal: options.signal,
        credentials: "same-origin",
      });
      text = await response.text();
    } catch (cause) {
      if (options.signal?.aborted) {
        throw new ApiError("通信を中止しました", {
          code: "ERR_CANCELED",
          cause,
        });
      }
      throw new ApiError("サーバーに接続できませんでした", {
        code: "ERR_NETWORK",
        cause,
      });
    }
    if (!response.ok) {
      let data: unknown = text;
      try {
        data = JSON.parse(text);
      } catch {
        /* The server may return plain text. */
      }
      throw new ApiError(
        getPayloadMessage(data) ?? `通信に失敗しました（${response.status}）`,
        {
          status: response.status,
          code: response.status >= 500 ? "ERR_BAD_RESPONSE" : "ERR_BAD_REQUEST",
          data,
        },
      );
    }
    return text;
  };
}
