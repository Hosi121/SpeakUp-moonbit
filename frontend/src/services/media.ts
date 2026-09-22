import type {
  MediaPorts,
  StreamPort,
  PeerPort,
  IceCandidate,
  MeterPort,
} from "../../../dist/presenter.js";

const message = (error: unknown): string =>
  error instanceof Error ? error.message : "通話に接続できませんでした";
const candidateValue = (value: RTCIceCandidate): IceCandidate => ({
  candidate: value.candidate,
  mid: value.sdpMid ?? "",
  has_mid: value.sdpMid !== null,
  line: value.sdpMLineIndex ?? -1,
  username: value.usernameFragment ?? "",
  has_username: value.usernameFragment !== null,
});

/** Native handles stay inside closures. Ordering, queues and lifetimes are MoonBit's. */
export function mediaPorts(
  readAudio: () => HTMLAudioElement | null,
  observe?: {
    local: (stream: MediaStream) => void;
    remote: (stream: MediaStream) => void;
  },
): MediaPorts {
  const wrap = (stream: MediaStream): StreamPort => ({
    close: () => stream.getTracks().forEach((track) => track.stop()),
    mute: (muted) =>
      stream.getAudioTracks().forEach((track) => {
        track.enabled = !muted;
      }),
    meter: (fft) => {
      const context = new AudioContext();
      try {
        const analyser = context.createAnalyser();
        analyser.fftSize = fft;
        const source = context.createMediaStreamSource(stream);
        source.connect(analyser);
        const bytes = new Uint8Array(analyser.frequencyBinCount);
        const values = Array<number>(bytes.length).fill(0);
        return {
          sample: () => {
            analyser.getByteFrequencyData(bytes);
            for (let i = 0; i < bytes.length; i++) values[i] = bytes[i];
            return values;
          },
          close: () => {
            source.disconnect();
            void context.close().catch(() => {});
          },
        } satisfies MeterPort;
      } catch (error) {
        void context.close().catch(() => {});
        throw error;
      }
    },
    play: (error) => {
      const audio = readAudio();
      if (!audio) return () => {};
      audio.srcObject = stream;
      observe?.remote(stream);
      void audio
        .play()
        .catch(() =>
          error("相手の音声を再生するには音声プレーヤーを押してください"),
        );
      return () => {
        if (audio.srcObject === stream) audio.srcObject = null;
      };
    },
    peer: (servers, ice, remote, state) => {
      const pc = new RTCPeerConnection({
        iceServers: servers.map((server) => ({
          urls: server.urls,
          ...(server.username ? { username: server.username } : {}),
          ...(server.credential ? { credential: server.credential } : {}),
        })),
      });
      pc.onicecandidate = (event) => {
        if (event.candidate) ice(candidateValue(event.candidate));
      };
      pc.ontrack = (event) => {
        try {
          if (event.streams[0]) remote(wrap(event.streams[0]));
        } catch {
          state("failed");
        }
      };
      pc.onconnectionstatechange = () => state(pc.connectionState);
      try {
        stream.getTracks().forEach((track) => pc.addTrack(track, stream));
        observe?.local(stream);
      } catch (error) {
        pc.close();
        throw error;
      }
      return {
        describe: (offer, done) => {
          void (offer ? pc.createOffer() : pc.createAnswer()).then(
            (value) => done(value.sdp ?? "", ""),
            (error) => done("", message(error)),
          );
        },
        set_local: (kind, sdp, done) => {
          void pc
            .setLocalDescription({
              type: kind === "offer" ? "offer" : "answer",
              sdp,
            })
            .then(
              () => done(pc.localDescription?.sdp ?? "", ""),
              (error) => done("", message(error)),
            );
        },
        remote: (kind, sdp, done) => {
          void pc
            .setRemoteDescription({
              type: kind === "offer" ? "offer" : "answer",
              sdp,
            })
            .then(
              () => done(""),
              (error) => done(message(error)),
            );
        },
        ice: (candidate, done) => {
          void pc
            .addIceCandidate({
              candidate: candidate.candidate,
              ...(candidate.has_mid ? { sdpMid: candidate.mid } : {}),
              ...(candidate.line >= 0 ? { sdpMLineIndex: candidate.line } : {}),
              ...(candidate.has_username
                ? { usernameFragment: candidate.username }
                : {}),
            })
            .then(
              () => done(""),
              (error) => done(message(error)),
            );
        },
        close: () => {
          pc.onicecandidate = null;
          pc.ontrack = null;
          pc.onconnectionstatechange = null;
          pc.close();
        },
      } satisfies PeerPort;
    },
  });
  return {
    acquire: (ready, error) => {
      void navigator.mediaDevices.getUserMedia({ audio: true }).then(
        (stream) => {
          try {
            ready(wrap(stream));
          } catch (cause) {
            stream.getTracks().forEach((track) => track.stop());
            error(message(cause));
          }
        },
        (cause) => error(message(cause)),
      );
    },
    frame: (callback) => {
      const id = requestAnimationFrame(callback);
      return () => cancelAnimationFrame(id);
    },
  };
}
