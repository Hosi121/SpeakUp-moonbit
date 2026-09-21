export type { Event, User, UserProfile, UserNotes, SessionData, ConversationExample, ConversationHistoryItem, FriendSummary } from "../../../dist/shared.js";
export interface EventDetails {
  eventStart: string;
  theme: string;
  topics: string[];
}

export type FriendState = "friend" | "pending" | "unapplied";

export interface SessionHistoryItem {
  avatar: string;
  user: string;
  theme: string;
  date: string;
  rank: number;
  friendState: FriendState;
}

export interface TopicGroup {
  theme: string;
  topics: string[];
}

export interface NotificationItem {
  id: number;
  time: string;
  user: string;
  type: string;
  message: string;
  profileIcon: string;
}

export interface FriendInfo {
  username: string;
  avatarUrl: string;
}
