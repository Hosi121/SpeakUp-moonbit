import type * as json from "moonbitlang/core/json";

export type Result<T, E> = { $tag: "Ok"; _0: T } | { $tag: "Err"; _0: E };

export type Json = null | boolean | number | string | Array<Json> | { [key: string]: Json };

export function decode_note(s: string): Note;

export function echo(s: string, fn_: (s: string, s2: string) => void): void;

export interface Note extends json.FromJson {
  id: number;
  created_at: number;
  text: string;
}

export function Note_from_json(arg0: Json, arg1: json.JsonPath): Result<Note, json.JsonDecodeError>;