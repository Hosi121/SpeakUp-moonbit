import { useState } from "react";
import AudioVisualizer from "./AudioVisualizer";
import { MicIcon } from "./MicIcon";

export function MicCheckScreen({ isMicChecked }: { isMicChecked: () => void }) {
  const [ready, setReady] = useState(false);
  return (
    <div className="stack center">
      <h1>セッション前にマイクチェックをするよ！</h1>
      <p>"I'll enjoy speaking English!!" と言おう！</p>
      <AudioVisualizer onReady={setReady} />
      <MicIcon />
      <button
        type="button"
        className="primary"
        disabled={!ready}
        onClick={isMicChecked}
      >
        準備OK!
      </button>
    </div>
  );
}
