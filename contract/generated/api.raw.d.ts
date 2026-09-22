export type Json = null | boolean | number | string | Array<Json> | { [key: string]: Json };

export function configure_host(value: Host): void;

export function execute(s: string, s2: string, n: number, s3: string, s4: string): Promise<ApiResponse>;

export function handle(s: string, s2: string, n: number, s3: string, s4: string, fn_: (n: number, s: string) => void): void;

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