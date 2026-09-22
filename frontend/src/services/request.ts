import api from "./api";
import { toApiError } from "./errorUtils";
export async function request<T>(
  method: "GET" | "POST" | "PUT",
  url: string,
  decode: (text: string) => T,
  data?: object,
): Promise<T> {
  try {
    const response = await api.request<unknown>({
      method,
      url,
      data,
      responseType: "text",
    });
    if (typeof response.data !== "string") throw new Error("不正な応答です");
    return decode(response.data);
  } catch (error) {
    throw toApiError(error, "データを取得・保存できませんでした");
  }
}
export async function command(
  method: "POST" | "PUT",
  url: string,
  data: object,
): Promise<void> {
  try {
    await api.request<unknown>({ method, url, data });
  } catch (error) {
    throw toApiError(error, "保存できませんでした");
  }
}
