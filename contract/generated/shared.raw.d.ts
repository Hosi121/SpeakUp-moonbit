import type * as json from "moonbitlang/core/json";

export type Result<T, E> = { $tag: "Ok"; _0: T } | { $tag: "Err"; _0: E };

export type Json = null | boolean | number | string | Array<Json> | { [key: string]: Json };

export interface ToJson {
  readonly __ToJsonBrand?: never;
}

export function activity_token(s: string): Result<string, Error>;

export function conversation_clock(arg0: ConversationDto, n: number): Result<ConversationClock, Error>;

export function conversation_partner(arg0: ConversationDto, n: number): Result<FriendSummaryDto, Error>;

export function decode_activity_token(s: string): string;

export function decode_avatar_response(s: string): string;

export function decode_chat_response(s: string): string;

export function decode_conversation(s: string): ConversationDto;

export function decode_conversations(s: string): Array<ConversationDto>;

export function decode_event_response(s: string): Event;

export function decode_events(s: string): Array<EventOverviewDto>;

export function decode_ice_servers(s: string): Array<IceServerDto>;

export function decode_inbox(s: string): InboxDto;

export function decode_learning(s: string): LearningDto;

export function decode_memo_response(s: string): UserNotes;

export function decode_profile_response(s: string): UserProfile;

export function decode_reflection(s: string): ReflectionDto;

export function decode_roster(s: string): EventRosterDto;

export function decode_signup_response(s: string): SignUpResult;

export function decode_social(s: string): SocialDto;

export function decode_stats(s: string): StatsDto;

export function decode_thread(s: string): ThreadDto;

export function decode_token_response(s: string): string;

export function decode_users_response(s: string): Array<User>;

export function from_memo(value: MemoDto): UserNotes;

export function map_conversation(value: ConversationHistoryDto): ConversationHistoryItem;

export function map_event(value: EventDto): Event;

export function map_friend(value: FriendSummaryDto): FriendSummary;

export function map_profile(value: UserProfileDto): UserProfile;

export function map_session(value: SessionDto): SessionData;

export function map_user(value: UserDto): User;

export function normalize_avatar(s: string, s2: string): string;

export function parse_conversation(s: string): Result<ConversationDto, Error>;

export function parse_conversations(s: string): Result<Array<ConversationDto>, Error>;

export function parse_reflection(s: string): Result<ReflectionDto, Error>;

export function parse_signal(s: string): ParsedSignal;

export function to_memo(value: UserNotes): MemoDto;

export function validate_signal(s: string): ParsedSignal;

export function view_conversation_clock(arg0: ConversationDto, n: number): ConversationClock;

export function view_conversation_partner(arg0: ConversationDto, n: number): FriendSummaryDto;

export interface AchievementDto extends ToJson, json.FromJson {
  code: string;
  title: string;
  progress: number;
  target: number;
  earned: boolean;
}

export function AchievementDto_to_json(self : AchievementDto): Json;

export function AchievementDto_from_json(arg0: Json, arg1: json.JsonPath): Result<AchievementDto, json.JsonDecodeError>;

export interface ConversationClock {
  phase: string;
  remaining_seconds: number;
  can_finish: boolean;
  can_join: boolean;
  has_deadline: boolean;
}

export interface ConversationDto extends ToJson, json.FromJson {
  id: number;
  event_id: number;
  round: number;
  started_at: number;
  ended_at: number;
  cancelled_at: number;
  revision: number;
  theme: string;
  topics: Array<string>;
  participants: Array<FriendSummaryDto>;
  event_start: string;
}

export function ConversationDto_to_json(self : ConversationDto): Json;

export function ConversationDto_from_json(arg0: Json, arg1: json.JsonPath): Result<ConversationDto, json.JsonDecodeError>;

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

export interface EventMemberDto extends ToJson, json.FromJson {
  user: FriendSummaryDto;
  participates_bit: number;
  matched_bit: number;
}

export function EventMemberDto_to_json(self : EventMemberDto): Json;

export function EventMemberDto_from_json(arg0: Json, arg1: json.JsonPath): Result<EventMemberDto, json.JsonDecodeError>;

export interface EventOverviewDto extends ToJson, json.FromJson {
  event: EventDto;
  participates_bit: number;
  registered_count: number;
  matching_state: string;
}

export function EventOverviewDto_to_json(self : EventOverviewDto): Json;

export function EventOverviewDto_from_json(arg0: Json, arg1: json.JsonPath): Result<EventOverviewDto, json.JsonDecodeError>;

export interface EventRosterDto extends ToJson, json.FromJson {
  members: Array<EventMemberDto>;
}

export function EventRosterDto_to_json(self : EventRosterDto): Json;

export function EventRosterDto_from_json(arg0: Json, arg1: json.JsonPath): Result<EventRosterDto, json.JsonDecodeError>;

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

export interface IceServerDto {
  urls: Array<string>;
  username: string;
  credential: string;
}

export interface InboxDto extends ToJson, json.FromJson {
  items: Array<NotificationDto>;
  unread: number;
  now: number;
}

export function InboxDto_to_json(self : InboxDto): Json;

export function InboxDto_from_json(arg0: Json, arg1: json.JsonPath): Result<InboxDto, json.JsonDecodeError>;

export interface LearningDto extends ToJson, json.FromJson {
  answers: Array<number>;
  feedback: string;
  feedback_current: boolean;
  updated_at: string;
}

export function LearningDto_to_json(self : LearningDto): Json;

export function LearningDto_from_json(arg0: Json, arg1: json.JsonPath): Result<LearningDto, json.JsonDecodeError>;

export interface MemoDto extends ToJson, json.FromJson {
  memo1: string;
  memo2: string;
}

export function MemoDto_to_json(self : MemoDto): Json;

export function MemoDto_from_json(arg0: Json, arg1: json.JsonPath): Result<MemoDto, json.JsonDecodeError>;

export interface MessageDto extends ToJson, json.FromJson {
  id: number;
  sender_id: number;
  recipient_id: number;
  body: string;
  created_at: string;
  read_at: string;
}

export function MessageDto_to_json(self : MessageDto): Json;

export function MessageDto_from_json(arg0: Json, arg1: json.JsonPath): Result<MessageDto, json.JsonDecodeError>;

export interface NotificationDto extends ToJson, json.FromJson {
  id: number;
  kind: string;
  actor: FriendSummaryDto;
  conversation_id: number;
  message_id: number;
  read: boolean;
  created_at: string;
}

export function NotificationDto_to_json(self : NotificationDto): Json;

export function NotificationDto_from_json(arg0: Json, arg1: json.JsonPath): Result<NotificationDto, json.JsonDecodeError>;

export interface ParsedSignal {
  kind: string;
  token: string;
  room: number;
  payload: string;
  isOffer: boolean;
  error: string;
}

export interface ReflectionDto extends ToJson, json.FromJson {
  saved: boolean;
  satisfaction: number;
  comment: string;
  learned_expressions: string;
  updated_at: string;
}

export function ReflectionDto_to_json(self : ReflectionDto): Json;

export function ReflectionDto_from_json(arg0: Json, arg1: json.JsonPath): Result<ReflectionDto, json.JsonDecodeError>;

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

export interface SignUpResult {
  success: boolean;
  message: string;
}

export interface SocialDto extends ToJson, json.FromJson {
  friends: Array<FriendSummaryDto>;
  incoming: Array<FriendSummaryDto>;
  outgoing: Array<FriendSummaryDto>;
}

export function SocialDto_to_json(self : SocialDto): Json;

export function SocialDto_from_json(arg0: Json, arg1: json.JsonPath): Result<SocialDto, json.JsonDecodeError>;

export interface StatsDto extends ToJson, json.FromJson {
  total_calls: number;
  event_calls: number;
  direct_calls: number;
  partners: number;
  minutes: number;
  reflections: number;
  achievements: Array<AchievementDto>;
}

export function StatsDto_to_json(self : StatsDto): Json;

export function StatsDto_from_json(arg0: Json, arg1: json.JsonPath): Result<StatsDto, json.JsonDecodeError>;

export interface ThreadDto extends ToJson, json.FromJson {
  peer: FriendSummaryDto;
  messages: Array<MessageDto>;
  has_older: boolean;
}

export function ThreadDto_to_json(self : ThreadDto): Json;

export function ThreadDto_from_json(arg0: Json, arg1: json.JsonPath): Result<ThreadDto, json.JsonDecodeError>;

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