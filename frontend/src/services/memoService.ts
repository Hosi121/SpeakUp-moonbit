import { parseMemo, toMemo } from "../../../dist/shared.js";
import type { UserNotes } from "../types/types";
import { request } from "./request";

export const fetchMemo = (): Promise<UserNotes> =>
  request("GET", "/memo", parseMemo);
export const saveMemo = (notes: UserNotes): Promise<UserNotes> =>
  request("PUT", "/memo", parseMemo, toMemo(notes));
