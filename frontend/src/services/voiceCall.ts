import { createVoice, browserPorts } from "../../../dist/presenter.js";
import type { ConversationDto } from "../../../dist/shared.js";
import { mediaPorts } from "./media";
import { realtimePorts } from "./realtime";
export type VoiceConnectionState = "connecting" | "waiting" | "connected";
type VoiceOptions = {
  audio: HTMLAudioElement;
  conversationId: number;
  onLocal: (stream: MediaStream) => void;
  onRemote: (stream: MediaStream) => void;
  onError: (message: string) => void;
  onState: (call: ConversationDto) => void;
  onConnection: (state: VoiceConnectionState) => void;
};
// Compatibility entry: every control decision is in createVoice.
export function startVoiceCall(options: VoiceOptions): {
  stop: () => void;
  mute: (muted: boolean) => void;
} {
  const controller = createVoice(
    browserPorts(),
    realtimePorts(),
    mediaPorts(() => options.audio, {
      local: options.onLocal,
      remote: options.onRemote,
    }),
    options.conversationId,
    {
      conversation: options.onState,
      error: options.onError,
      speaking() {},
      connection: (state) => {
        if (
          state === "connecting" ||
          state === "waiting" ||
          state === "connected"
        )
          options.onConnection(state);
      },
    },
  );
  controller.start();
  return controller;
}
