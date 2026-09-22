import { mapEvent as mapEventDto } from "../../../dist/shared.js";
import api from "./api";
import { Event, EventDetails } from "../types/types";
import type {
  ChatThemeResponseDto,
  CreateEventDto,
  EventDto,
} from "../types/dto";
import { toApiError } from "./errorUtils";

const toCreateEventDto = (eventData: EventDetails): CreateEventDto => ({
  event_start: eventData.eventStart,
  theme: eventData.theme,
  topics: eventData.topics,
});

export const createEvent = async (eventData: EventDetails): Promise<Event> => {
  try {
    const payload = toCreateEventDto(eventData);
    const response = await api.post<EventDto>("/events", payload);
    return mapEventDto(response.data);
  } catch (error) {
    throw toApiError(error, "イベントの作成に失敗しました");
  }
};

export const generateTheme = async (): Promise<string> => {
  try {
    const prompt = "イベントのテーマを提案してください。";
    const response = await api.post<ChatThemeResponseDto>("/chat/theme", {
      content: prompt,
    });
    return response.data.choices[0].message.content;
  } catch (error) {
    throw toApiError(error, "テーマの生成に失敗しました");
  }
};
