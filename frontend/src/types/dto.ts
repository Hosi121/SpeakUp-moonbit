import type { ConversationExample, FriendSummaryDto } from "../../../dist/shared.js";
export type ConversationExampleDto = ConversationExample;
export type { EventThemeDto, EventDto, UserDto, UserProfileDto, FriendSummaryDto, SessionDto, ConversationHistoryDto } from "../../../dist/shared.js";




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







export interface SessionHistoryDto {
  avatar: string;
  user: string;
  theme: string;
  date: string;
  rank: number;
  friend_state: "friend" | "pending" | "unapplied";
}

export interface TopicDto {
  theme: string;
  topics: string[];
}

export interface NotificationDto {
  id: number;
  time: string;
  user: string;
  type: string;
  message: string;
  profile_icon: string;
}







export interface FriendListDto {
  friends: FriendSummaryDto[];
}

export interface FriendInfoDto {
  username: string;
  avatar_url: string;
}

export interface AvatarDto {
  avatar_url: string;
}
