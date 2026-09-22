import {
  mapUser as mapUserDto,
  mapProfile as mapUserProfileDto,
} from "../../../dist/shared.js";
import api from "./api";
import { toApiError } from "./errorUtils";
import type { User, UserProfile } from "../types/types";
import type { AvatarDto, UserDto, UserProfileDto } from "../types/dto";

export const fetchUserProfile = async (): Promise<UserProfile> => {
  try {
    const response = await api.get<UserProfileDto>("/user/info");
    return mapUserProfileDto(response.data);
  } catch (error) {
    throw toApiError(error, "ユーザー情報の取得に失敗しました");
  }
};

export const updateUserProfile = async (update: {
  username?: string;
  email?: string;
}): Promise<void> => {
  try {
    await api.put("/user/update", update);
  } catch (error) {
    throw toApiError(error, "ユーザー情報の更新に失敗しました");
  }
};

export const uploadAvatar = async (file: File): Promise<string> => {
  try {
    const formData = new FormData();
    formData.append("avatar", file);
    const response = await api.put<AvatarDto>("/user/avatar", formData, {
      headers: {
        "Content-Type": "multipart/form-data",
      },
    });
    return response.data.avatar_url;
  } catch (error) {
    throw toApiError(error, "アバターの更新に失敗しました");
  }
};

export const searchUsers = async (query: string): Promise<User[]> => {
  try {
    const encodedQuery = encodeURIComponent(query);
    const response = await api.get<UserDto[]>(
      `/users/search?q=${encodedQuery}`,
    );
    return response.data.map(mapUserDto);
  } catch (error) {
    throw toApiError(error, "ユーザーの検索に失敗しました");
  }
};
