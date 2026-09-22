import { useMemo } from "react";
import { createMicrophone } from "../../../../dist/presenter.js";
import { useController } from "../../services/controller";
import { mediaPorts } from "../../services/media";
import { realtimePorts } from "../../services/realtime";
import TopSection from "../utils/TopSection";
import { MicCheckFinished } from "../utils/MicCheckFinished";
import { MicIcon } from "../utils/MicIcon";
export function MicCheck() {
  const controller = useMemo(
    () =>
      createMicrophone(
        mediaPorts(() => null),
        realtimePorts(),
      ),
    [],
  );
  const { checked, ready, levels, error } = useController(controller);
  return (
    <main className="page stack">
      <TopSection />
      {checked ? (
        <MicCheckFinished />
      ) : (
        <div className="stack center">
          <h1>セッション前にマイクチェックをするよ！</h1>
          <p>"I'll enjoy speaking English!!" と言おう！</p>
          {error ? (
            <p role="alert" className="alert">
              {error}
            </p>
          ) : (
            <div
              className="audio-visualizer"
              role="img"
              aria-label="マイクの音量"
            >
              {levels.map((level, index) => (
                <span
                  className="audio-bar"
                  key={index}
                  style={{ transform: `scaleY(${level})` }}
                />
              ))}
            </div>
          )}
          <MicIcon />
          <button
            type="button"
            className="primary"
            disabled={!ready}
            onClick={controller.finish}
          >
            準備OK!
          </button>
        </div>
      )}
    </main>
  );
}
