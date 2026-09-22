import { parseChatMessage } from "../../../dist/shared.js";
import { request } from "./request";

export const askAssistant = (content: string): Promise<string> =>
  request("POST", "/chat/ask", parseChatMessage, { content });
