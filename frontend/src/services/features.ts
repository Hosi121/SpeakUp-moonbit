import {
  parseSocial,
  parseInbox,
  parseThread,
  parseStats,
  parseEvents,
  parseRoster,
  parseLearning,
} from "../../../dist/shared.js";
import { request, command } from "./request";
export const fetchSocial = () => request("GET", "/friends", parseSocial);
export const changeFriend = (
  id: number,
  action: "request" | "accept" | "reject" | "cancel",
) => request("POST", `/friends/${id}/${action}`, parseSocial, {});
export const fetchInbox = () => request("GET", "/notifications", parseInbox);
export const readInbox = (through: number) =>
  request("PUT", "/notifications/read", parseInbox, { through_id: through });
export const fetchThread = (id: number, before = 0) =>
  request(
    "GET",
    `/messages/${id}${before ? `/before/${before}` : ""}`,
    parseThread,
  );
export const sendMessage = (id: number, body: string, requestId: string) =>
  request("POST", `/messages/${id}`, parseThread, {
    body,
    request_id: requestId,
  });
export const readThread = (id: number, through: number) =>
  request("PUT", `/messages/${id}/read`, parseThread, { through_id: through });
export const fetchStats = () => request("GET", "/stats", parseStats);
export const fetchEventOverviews = () =>
  request("GET", "/events/overview", parseEvents);
export const registerEvent = (id: number, bit: number) =>
  command("POST", `/events/${id}/register`, { participates_bit: bit });
export const matchEvent = (id: number) =>
  command("POST", `/events/${id}/match`, {});
export const fetchRoster = (id: number) =>
  request("GET", `/events/${id}/roster`, parseRoster);
export const fetchLearning = (id: number) =>
  request("GET", `/conversations/${id}/learning`, parseLearning);
export const saveSurvey = (id: number, answers: number[]) =>
  request("PUT", `/conversations/${id}/survey`, parseLearning, { answers });
export const generateFeedback = (id: number) =>
  request("POST", `/conversations/${id}/feedback`, parseLearning, {});
