import { parseMemo, toMemo } from "../../../dist/shared.js";
import type { UserNotes } from "../types/types";
import { request, type RequestOptions } from "./request";

export const fetchMemo = (options?: RequestOptions): Promise<UserNotes> =>
  request("GET", "/memo", parseMemo, undefined, options);
export const saveMemo = (notes: UserNotes): Promise<UserNotes> =>
  request("PUT", "/memo", parseMemo, toMemo(notes));
