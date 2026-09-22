export type {
  Event,
  User,
  UserProfile,
  UserNotes,
  FriendSummary,
} from "../../../dist/shared.js";
export interface EventDetails {
  eventStart: string;
  theme: string;
  topics: string[];
}
