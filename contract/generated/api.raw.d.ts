import type * as json from "moonbitlang/core/json";
import type * as debug from "moonbitlang/core/debug";
import type * as identity from "hosi121/speakup/identity";

export type Result<T, E> = { $tag: "Ok"; _0: T } | { $tag: "Err"; _0: E };

export type Json = null | boolean | number | string | Array<Json> | { [key: string]: Json };

export interface ToJson {
  readonly __ToJsonBrand?: never;
}

export function expire(n: number, fn_: (n: number, s: string) => void): void;

export function handle(s: string, s2: string, n: number, s3: string, s4: string, fn_: (n: number, s: string) => void): void;

export function poll_expired(fn_: (n: number, items: Array<number>) => void): void;

export function set_notifier(fn_: (n: number) => void): void;

export type HostError = { $tag: "Credentials" } | { $tag: "NotConfigured" } | { $tag: "Conflict" } | { $tag: "Unavailable" } | { $tag: "InvalidData" };

export type HostError_Credentials = Extract<HostError, { $tag: "Credentials" }>;
export type HostError_NotConfigured = Extract<HostError, { $tag: "NotConfigured" }>;
export type HostError_Conflict = Extract<HostError, { $tag: "Conflict" }>;
export type HostError_Unavailable = Extract<HostError, { $tag: "Unavailable" }>;
export type HostError_InvalidData = Extract<HostError, { $tag: "InvalidData" }>;

export function HostError_to_repr(self : HostError): debug.Repr;

export interface Api {
  readonly __ApiBrand?: never;
}

export function Api_execute(self : Api, s: string, s2: string, n: number, s3: string, s4: string): Promise<ApiResponse>;

export function Api_expire_conversation(self : Api, value: identity.ConversationId): Promise<ApiResponse>;

export function Api_overdue_conversations(self : Api): Promise<Array<identity.ConversationId>>;

export function Api_Api(arg0: Host, notify?: (value: identity.UserId) => void): Api;

export interface ApiResponse {
  status: number;
  body: string;
}

export type AuthAction = { $tag: "SignIn" } | { $tag: "SignUp" };

export type AuthAction_SignIn = Extract<AuthAction, { $tag: "SignIn" }>;
export type AuthAction_SignUp = Extract<AuthAction, { $tag: "SignUp" }>;

export type ChatKind = { $tag: "Ask" } | { $tag: "Theme" } | { $tag: "Feedback" };

export type ChatKind_Ask = Extract<ChatKind, { $tag: "Ask" }>;
export type ChatKind_Theme = Extract<ChatKind, { $tag: "Theme" }>;
export type ChatKind_Feedback = Extract<ChatKind, { $tag: "Feedback" }>;

export interface ChatReply extends ToJson {
  content: string;
}

export function ChatReply_to_json(self : ChatReply): Json;

export function ChatReply_decode(value: Json): Result<ChatReply, Error>;

export interface Credentials {
  email: string;
  password: string;
}

export interface Database {
  run: (value: Statement) => Promise<DbResult>;
  transaction: (items: Array<Statement>) => Promise<DbResult>;
}

export type DbResult = { $tag: "Rows"; _0: Array<DbRow> } | { $tag: "Written"; _0: WriteResult };

export type DbResult_Rows = Extract<DbResult, { $tag: "Rows" }>;
export type DbResult_Written = Extract<DbResult, { $tag: "Written" }>;

export interface DbRow extends ToJson {
  readonly __DbRowBrand?: never;
}

export function DbRow_to_json(self : DbRow): Json;

export function DbRow_DbRow(entries: Map<string, SqlValue>): DbRow;

export interface EventTimes extends json.FromJson {
  start: string;
  end: string;
}

export function EventTimes_from_json(arg0: Json, arg1: json.JsonPath): Result<EventTimes, json.JsonDecodeError>;

export interface Host {
  database: Database;
  authenticate: (arg0: AuthAction, arg1: Credentials) => Promise<void>;
  issue_token: (value: identity.UserId) => Promise<string>;
  chat: (arg0: ChatKind, s: string) => Promise<ChatReply>;
  now: () => string;
  now_millis: () => number;
  public_url: (s: string) => string;
  event_times: (s: string) => EventTimes | undefined;
}

export type SqlValue = ({ $tag: "Null" } | { $tag: "Text"; _0: string } | { $tag: "Number"; _0: number } | { $tag: "Boolean"; _0: boolean }) & ToJson;

export type SqlValue_Null = Extract<SqlValue, { $tag: "Null" }>;
export type SqlValue_Text = Extract<SqlValue, { $tag: "Text" }>;
export type SqlValue_Number = Extract<SqlValue, { $tag: "Number" }>;
export type SqlValue_Boolean = Extract<SqlValue, { $tag: "Boolean" }>;

export function SqlValue_to_json(self : SqlValue): Json;

export interface Statement extends ToJson {
  sql: string;
  params: Array<SqlValue>;
}

export function Statement_to_json(self : Statement): Json;

export interface WriteResult {
  affected_rows: number;
  insert_id: number;
}