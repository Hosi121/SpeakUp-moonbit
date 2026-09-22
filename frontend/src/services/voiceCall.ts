import { parseSignal, parseConversation, conversationClock, type ConversationDto } from '../../../dist/shared.js';
import api from './api';
import { fetchConversation } from './conversationService';

export type VoiceConnectionState = 'connecting' | 'waiting' | 'connected';
type VoiceOptions = {
  audio: HTMLAudioElement;
  onLocal: (stream: MediaStream) => void;
  onRemote: (stream: MediaStream) => void;
  onError: (message: string) => void;
  conversationId: number;
  onState: (conversation: ConversationDto) => void;
  onConnection: (state: VoiceConnectionState) => void;
};
export function startVoiceCall(options: VoiceOptions): { stop: () => void; mute: (muted: boolean) => void } {
  let stopped = false;
  let stream: MediaStream | undefined;
  let pc: RTCPeerConnection | undefined;
  let ws: WebSocket | undefined;
  let messages = Promise.resolve();
  const pending: RTCIceCandidateInit[] = [];
  let muted = false;
  const stop = () => {
    stopped = true;
    ws?.close(); pc?.close(); stream?.getTracks().forEach(t => t.stop());
    options.audio.srcObject = null;
  };
  const send = (value: object) => {
    if (ws?.readyState !== WebSocket.OPEN) throw new Error('通話サーバに接続していません');
    ws.send(JSON.stringify(value));
  };
  const fail = (error: unknown) => {
    if (!stopped) options.onError(error instanceof Error ? error.message : '通話に接続できませんでした');
    stop();
  };
  const flush = async () => {
    if (!pc?.remoteDescription) return;
    for (const candidate of pending.splice(0)) await pc.addIceCandidate(candidate);
  };
  void (async () => {
    options.onConnection('connecting');
    const conversation = await fetchConversation(options.conversationId);
    if (stopped) return;
    options.onState(conversation);
    if (!conversationClock(conversation, Date.now()).can_join) { stop(); return; }
    // ICE configuration comes from the server; TURN secrets never enter Vite env.
    const configurationResponse = await api.get<RTCConfiguration>('/rtc-config');
    if (stopped) return;
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    if (stopped) { stream.getTracks().forEach(t => t.stop()); return; }
    pc = new RTCPeerConnection(configurationResponse.data);
    stream.getAudioTracks().forEach(t => { t.enabled = !muted; });
    stream.getTracks().forEach(t => pc?.addTrack(t, stream!));
    options.onLocal(stream);
    const base = new URL(import.meta.env.VITE_API_URL ?? '/', location.origin);
    base.protocol = base.protocol === 'https:' ? 'wss:' : 'ws:';
    base.pathname = '/ws';
    ws = new WebSocket(base);
    pc.onicecandidate = event => { if (!stopped && event.candidate && ws?.readyState === WebSocket.OPEN) send({ type: 'ice-candidate', candidate: event.candidate.toJSON() }); };
    pc.ontrack = event => {
      if (event.streams[0]) {
        options.audio.srcObject = event.streams[0];
        void options.audio.play().catch(() => options.onError('相手の音声を再生するには音声プレーヤーを押してください'));
        options.onRemote(event.streams[0]);
      }
    };
    pc.onconnectionstatechange = () => {
      if (stopped) return;
      if (pc?.connectionState === 'failed') fail(new Error('通話が切断されました'));
      if (pc?.connectionState === 'connected') {
        options.onConnection('connected');
        try { send({ type: 'media-ready' }); } catch (error) { fail(error); }
      }
    };
    ws.onopen = () => send({ type: 'Authorization', token: `Bearer ${localStorage.getItem('token') ?? ''}`, room: conversation.id });
    ws.onmessage = event => {
      const raw: unknown = event.data;
      messages = messages.then(async () => {
        if (stopped || !pc) return;
        if (typeof raw !== 'string') throw new Error('不正な通話メッセージです');
        const signal = parseSignal(raw);
        switch (signal.kind) {
          case 'conversation': {
            const next = parseConversation(signal.payload);
            if (next.id !== options.conversationId) throw new Error('別の通話の状態を受信しました');
            options.onState(next);
            if (!conversationClock(next, Date.now()).can_join) stop();
            return;
          }
          case 'waiting': options.onConnection('waiting'); return;
          case 'callType':
            options.onConnection('connecting');
            if (signal.isOffer) {
              const offer = await pc.createOffer();
              if (stopped) return;
              await pc.setLocalDescription(offer);
              send({ type: 'offer', offer: pc.localDescription });
            }
            return;
          case 'offer': case 'answer': {
            const payload: unknown = JSON.parse(signal.payload);
            if (!payload || typeof payload !== 'object' || !('sdp' in payload) || typeof payload.sdp !== 'string') throw new Error('不正な SDP です');
            await pc.setRemoteDescription({ type: signal.kind, sdp: payload.sdp });
            await flush();
            if (signal.kind === 'offer') {
              const answer = await pc.createAnswer();
              if (stopped) return;
              await pc.setLocalDescription(answer);
              send({ type: 'answer', answer: pc.localDescription });
            }
            return;
          }
          case 'ice-candidate': {
            const payload: unknown = JSON.parse(signal.payload);
            if (!payload || typeof payload !== 'object' || !('candidate' in payload) || typeof payload.candidate !== 'string') throw new Error('不正な ICE です');
            const candidate: RTCIceCandidateInit = { candidate: payload.candidate };
            if ('sdpMid' in payload && typeof payload.sdpMid === 'string') candidate.sdpMid = payload.sdpMid;
            if ('sdpMLineIndex' in payload && typeof payload.sdpMLineIndex === 'number') candidate.sdpMLineIndex = payload.sdpMLineIndex;
            if ('usernameFragment' in payload && typeof payload.usernameFragment === 'string') candidate.usernameFragment = payload.usernameFragment;
            if (pc.remoteDescription) await pc.addIceCandidate(candidate);
            else { if (pending.length >= 128) throw new Error('ICE が多すぎます'); pending.push(candidate); }
            return;
          }
          case 'peer-left': throw new Error('相手が通話から退出しました');
          default: throw new Error(signal.error || '通話に接続できませんでした');
        }
      }).catch(fail);
    };
    ws.onerror = () => fail(new Error('通話サーバに接続できませんでした'));
    ws.onclose = () => { if (!stopped) fail(new Error('通話サーバとの接続が終了しました')); };
  })().catch(fail);
  return { stop, mute(value) { muted = value; stream?.getAudioTracks().forEach(t => { t.enabled = !value; }); } };
}
