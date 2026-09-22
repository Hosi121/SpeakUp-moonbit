import { parseConversation, parseConversations, parseReflection, type ConversationDto, type ReflectionDto } from '../../../dist/shared.js';
import api from './api';
import { toApiError } from './errorUtils';

async function request<T>(method: 'GET' | 'POST' | 'PUT', url: string, decode: (text: string) => T, data?: object): Promise<T> {
  try {
    // Parse at ingress with the same MoonBit model that produces the response.
    const response = await api.request<unknown>({ method, url, data, responseType: 'text' });
    if (typeof response.data !== 'string') throw new Error('不正な応答です');
    return decode(response.data);
  } catch (error) { throw toApiError(error, '通話情報を取得・保存できませんでした'); }
}
export const fetchConversations = (history = false): Promise<ConversationDto[]> => request('GET', history ? '/conversations/history' : '/conversations', parseConversations);
export const fetchConversation = (id: number): Promise<ConversationDto> => request('GET', `/conversations/${id}`, parseConversation);
export const createDirectConversation = (target: number, requestId: string): Promise<ConversationDto> => request('POST', '/conversations/direct', parseConversation, { target_user_id: target, request_id: requestId });
export const finishConversation = (id: number): Promise<ConversationDto> => request('POST', `/conversations/${id}/finish`, parseConversation, {});
export const cancelConversation = (id: number): Promise<ConversationDto> => request('POST', `/conversations/${id}/cancel`, parseConversation, {});
export const fetchReflection = (id: number): Promise<ReflectionDto> => request('GET', `/conversations/${id}/reflection`, parseReflection);
export const saveReflection = (id: number, data: Pick<ReflectionDto, 'satisfaction' | 'comment' | 'learned_expressions'>): Promise<ReflectionDto> => request('PUT', `/conversations/${id}/reflection`, parseReflection, data);
