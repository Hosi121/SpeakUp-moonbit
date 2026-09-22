export type Json = null | boolean | number | string | Array<Json> | { [key: string]: Json };

export function configure_host(value: Host): void;

export function execute(s: string, s2: string, n: number, s3: string, s4: string): Promise<ApiResponse>;

export function expire(n: number, fn_: (n: number, s: string) => void): void;

export function expire_conversation(n: number): Promise<ApiResponse>;

export function handle(s: string, s2: string, n: number, s3: string, s4: string, fn_: (n: number, s: string) => void): void;

export function overdue_conversations(): Promise<Array<number>>;

export function poll_expired(fn_: (n: number, items: Array<number>) => void): void;

export function set_notifier(fn_: (n: number) => void): void;

export type HostError = { $tag: "HostError"; _0: string };

export type HostError_HostError = Extract<HostError, { $tag: "HostError" }>;

export interface ApiResponse {
  status: number;
  body: string;
}

export interface Host {
  invoke: (value: Json) => Promise<Json>;
  now: () => string;
  now_millis: () => number;
  public_url: (s: string) => string;
  event_times: (s: string) => string;
}