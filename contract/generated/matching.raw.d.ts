import type * as json from "moonbitlang/core/json";

export type Result<T, E> = { $tag: "Ok"; _0: T } | { $tag: "Err"; _0: E };

export type Json = null | boolean | number | string | Array<Json> | { [key: string]: Json };

export function pair_round(items: Array<Participant>, n: number, n2: number): Array<Pair>;

export interface Pair {
  first: number;
  second: number;
}

export interface Participant extends json.FromJson {
  user_id: number;
  rank: number;
  participates_bit: number;
}

export function Participant_from_json(arg0: Json, arg1: json.JsonPath): Result<Participant, json.JsonDecodeError>;