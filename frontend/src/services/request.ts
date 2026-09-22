import api from "./api";
import { toApiError } from "./errorUtils";
import type { HttpMethod, RequestOptions } from "./httpClient";
export type { RequestOptions } from "./httpClient";
export async function request<T>(
  method: HttpMethod,
  url: string,
  decode: (text: string) => T,
  data?: object,
  options?: RequestOptions,
): Promise<T> {
  try {
    return decode(await api(method, url, data, options));
  } catch (error) {
    throw toApiError(error, "データを取得・保存できませんでした");
  }
}
export async function command(
  method: "POST" | "PUT",
  url: string,
  data: object,
  options?: RequestOptions,
): Promise<void> {
  try {
    await api(method, url, data, options);
  } catch (error) {
    throw toApiError(error, "保存できませんでした");
  }
}
