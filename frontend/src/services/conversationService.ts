import {
  parseConversation,
  parseConversations,
  parseReflection,
  type ConversationDto,
  type ReflectionDto,
} from "../../../dist/shared.js";
import { request, type RequestOptions } from "./request";

export const fetchConversations = (
  history = false,
): Promise<ConversationDto[]> =>
  request(
    "GET",
    history ? "/conversations/history" : "/conversations",
    parseConversations,
  );
export const fetchConversation = (
  id: number,
  options?: RequestOptions,
): Promise<ConversationDto> =>
  request("GET", `/conversations/${id}`, parseConversation, undefined, options);
export const createDirectConversation = (
  target: number,
  requestId: string,
): Promise<ConversationDto> =>
  request("POST", "/conversations/direct", parseConversation, {
    target_user_id: target,
    request_id: requestId,
  });
export const finishConversation = (id: number): Promise<ConversationDto> =>
  request("POST", `/conversations/${id}/finish`, parseConversation, {});
export const cancelConversation = (id: number): Promise<ConversationDto> =>
  request("POST", `/conversations/${id}/cancel`, parseConversation, {});
export const fetchReflection = (id: number): Promise<ReflectionDto> =>
  request("GET", `/conversations/${id}/reflection`, parseReflection);
export const saveReflection = (
  id: number,
  data: Pick<ReflectionDto, "satisfaction" | "comment" | "learned_expressions">,
): Promise<ReflectionDto> =>
  request("PUT", `/conversations/${id}/reflection`, parseReflection, data);
