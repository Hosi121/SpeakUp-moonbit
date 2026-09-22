export type {
  EventThemeDto,
  EventDto,
  UserDto,
  UserProfileDto,
} from "../../../dist/shared.js";

export interface CreateEventDto {
  event_start: string;
  theme: string;
  topics: string[];
}

export interface ChatMessageDto {
  role: string;
  content: string;
}

export interface ChatChoiceDto {
  message: ChatMessageDto;
  index: number;
  finish_reason: string;
}

export interface ChatResponseDto {
  choices: ChatChoiceDto[];
}

export type ChatThemeResponseDto = ChatResponseDto;

export interface MemoDto {
  memo1?: string;
  memo2?: string;
}

export interface AvatarDto {
  avatar_url: string;
}
