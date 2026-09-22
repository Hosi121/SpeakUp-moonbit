import { parseProfile, parseUsers, parseAvatar } from "../../../dist/shared.js";
import type { User, UserProfile } from "../types/types";
import { request, command } from "./request";

export const fetchUserProfile = (): Promise<UserProfile> =>
  request("GET", "/user/info", parseProfile);
export const updateUserProfile = (update: {
  username?: string;
  email?: string;
}): Promise<void> => command("PUT", "/user/update", update);
export const uploadAvatar = (file: File): Promise<string> => {
  const data = new FormData();
  data.append("avatar", file);
  return request("PUT", "/user/avatar", parseAvatar, data);
};
export const searchUsers = (query: string): Promise<User[]> =>
  request("GET", `/users/search?q=${encodeURIComponent(query)}`, parseUsers);
