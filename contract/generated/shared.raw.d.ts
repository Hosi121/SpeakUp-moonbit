import type * as json from "moonbitlang/core/json";

export type Result<T, E> = { $tag: "Ok"; _0: T } | { $tag: "Err"; _0: E };

export type Json = null | boolean | number | string | Array<Json> | { [key: string]: Json };

export interface ToJson {
  readonly __ToJsonBrand?: never;
}

export function from_memo(value: MemoDto): UserNotes;

export function map_conversation(value: ConversationHistoryDto): ConversationHistoryItem;

export function map_event(value: EventDto): Event;

export function map_friend(value: FriendSummaryDto): FriendSummary;

export function map_profile(value: UserProfileDto): UserProfile;

export function map_session(value: SessionDto): SessionData;

export function map_user(value: UserDto): User;

export function normalize_avatar(s: string, s2: string): string;

export function parse_signal(s: string): ParsedSignal;

export function to_memo(value: UserNotes): MemoDto;

export interface ConversationExample extends ToJson, json.FromJson {
  english: string;
  japanese: string;
}

export function ConversationExample_to_json(self : ConversationExample): Json;

export function ConversationExample_from_json(arg0: Json, arg1: json.JsonPath): Result<ConversationExample, json.JsonDecodeError>;

export interface ConversationHistoryDto extends ToJson, json.FromJson {
  date: string;
  previous_date: string;
  sessions: number;
  completion_rate: string;
  comment: string;
  examples: Array<ConversationExample>;
}

export function ConversationHistoryDto_to_json(self : ConversationHistoryDto): Json;

export function ConversationHistoryDto_from_json(arg0: Json, arg1: json.JsonPath): Result<ConversationHistoryDto, json.JsonDecodeError>;

export interface ConversationHistoryItem {
  date: string;
  previousDate: string;
  sessions: number;
  completionRate: string;
  comment: string;
  examples: Array<ConversationExample>;
}

export interface Event {
  id: number;
  eventStart: string;
  eventEnd: string;
  themeId: number;
  theme: EventTheme;
}

export interface EventDto extends ToJson, json.FromJson {
  id: number;
  event_start: string;
  event_end: string;
  theme_id: number;
  theme: EventThemeDto;
}

export function EventDto_to_json(self : EventDto): Json;

export function EventDto_from_json(arg0: Json, arg1: json.JsonPath): Result<EventDto, json.JsonDecodeError>;

export interface EventTheme {
  themeText: string;
  topic1: string;
  topic2: string;
  topic3: string;
}

export interface EventThemeDto extends ToJson, json.FromJson {
  theme_text: string;
  topic1: string;
  topic2: string;
  topic3: string;
}

export function EventThemeDto_to_json(self : EventThemeDto): Json;

export function EventThemeDto_from_json(arg0: Json, arg1: json.JsonPath): Result<EventThemeDto, json.JsonDecodeError>;

export interface FriendSummary {
  id: number;
  username: string;
  avatarUrl: string;
}

export interface FriendSummaryDto extends ToJson, json.FromJson {
  id: number;
  username: string;
  avatar_url: string;
}

export function FriendSummaryDto_to_json(self : FriendSummaryDto): Json;

export function FriendSummaryDto_from_json(arg0: Json, arg1: json.JsonPath): Result<FriendSummaryDto, json.JsonDecodeError>;

export interface MemoDto extends ToJson, json.FromJson {
  memo1: string;
  memo2: string;
}

export function MemoDto_to_json(self : MemoDto): Json;

export function MemoDto_from_json(arg0: Json, arg1: json.JsonPath): Result<MemoDto, json.JsonDecodeError>;

export interface ParsedSignal {
  kind: string;
  token: string;
  room: number;
  payload: string;
  isOffer: boolean;
  error: string;
}

export interface SessionData {
  theme: string;
  dateTime: string;
  sessions: Array<number>;
}

export interface SessionDto extends ToJson, json.FromJson {
  theme: string;
  date_time: string;
  sessions: Array<number>;
}

export function SessionDto_to_json(self : SessionDto): Json;

export function SessionDto_from_json(arg0: Json, arg1: json.JsonPath): Result<SessionDto, json.JsonDecodeError>;

export interface User {
  id: number;
  username: string;
  email: string;
  avatarUrl: string;
  createdAt: string;
}

export interface UserDto extends ToJson, json.FromJson {
  id: number;
  username: string;
  email: string;
  avatar_url: string;
  created_at: string;
}

export function UserDto_to_json(self : UserDto): Json;

export function UserDto_from_json(arg0: Json, arg1: json.JsonPath): Result<UserDto, json.JsonDecodeError>;

export interface UserNotes {
  carryInMemo: string;
  wordList: string;
}

export interface UserProfile {
  id: number;
  username: string;
  email: string;
  avatarUrl: string;
  role: string;
  createdAt: string;
  updatedAt: string;
}

export interface UserProfileDto extends ToJson, json.FromJson {
  id: number;
  username: string;
  email: string;
  avatar_url: string;
  role: string;
  created_at: string;
  updated_at: string;
}

export function UserProfileDto_to_json(self : UserProfileDto): Json;

export function UserProfileDto_from_json(arg0: Json, arg1: json.JsonPath): Result<UserProfileDto, json.JsonDecodeError>;