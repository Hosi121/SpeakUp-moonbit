import { parseEvent, parseChatMessage } from "../../../dist/shared.js";
import type { Event, EventDetails } from "../types/types";
import { request } from "./request";

export const createEvent = (data: EventDetails): Promise<Event> =>
  request("POST", "/events", parseEvent, {
    event_start: data.eventStart,
    theme: data.theme,
    topics: data.topics,
  });
export const generateTheme = (): Promise<string> =>
  request("POST", "/chat/theme", parseChatMessage, {
    content: "イベントのテーマを提案してください。",
  });
