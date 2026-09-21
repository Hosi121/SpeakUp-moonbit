import api from "./api";
import type { MemoDto } from "../types/dto";
import type { UserNotes } from "../types/types";
import { toApiError } from "./errorUtils";
import { fromMemo, toMemo as toMemoDto } from "../../../dist/shared.js";

const fromMemoDto = (dto: MemoDto): UserNotes =>
  fromMemo({ memo1: dto.memo1 ?? "", memo2: dto.memo2 ?? "" });

// メモを取得する関数
export const fetchMemo = async (): Promise<UserNotes> => {
  try {
    const response = await api.get<MemoDto>("/memo");
    return fromMemoDto(response.data);
  } catch (error) {
    throw toApiError(error, "メモの取得に失敗しました");
  }
};

// メモを保存する関数
export const saveMemo = async (notes: UserNotes): Promise<UserNotes> => {
  try {
    const response = await api.put<MemoDto>("/memo", toMemoDto(notes));
    return fromMemoDto(response.data);
  } catch (error) {
    throw toApiError(error, "メモの保存に失敗しました");
  }
};
