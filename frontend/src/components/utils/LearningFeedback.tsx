import { useMemo, useEffect } from "react";
import { createLearning, browserPorts } from "../../../../dist/presenter.js";
import { useController } from "../../services/controller";
export function LearningFeedback({
  id,
  saved,
}: {
  id: number;
  saved: boolean;
}) {
  const controller = useMemo(
    () => createLearning(browserPorts(), String(id), false),
    [id],
  );
  const learning = useController(controller);
  const { busy, error, can_generate } = learning;
  useEffect(() => controller.set_saved(saved), [controller, saved]);
  const generate = controller.generate;
  return (
    <section className="panel stack" aria-label="学習アドバイス">
      <h2>書いた内容への学習アドバイス</h2>
      <p>
        保存した感想と学んだ表現を外部 AI
        に送って、改善案と例文を作ります。音声の評価は行いません。結果は本人だけが閲覧できます。
      </p>
      {!saved && <p>先に感想・学んだ表現を保存してください。</p>}
      {learning?.feedback && (
        <>
          <p className="pre-wrap">{learning.feedback}</p>
          {(!learning.feedback_current || !saved) && (
            <p>編集前の内容に対するアドバイスです。</p>
          )}
        </>
      )}
      <button disabled={!can_generate} onClick={() => void generate()}>
        {busy
          ? "作成中…"
          : learning?.feedback_current
            ? "保存済みのアドバイス"
            : "保存した内容を送ってアドバイスを作る"}
      </button>
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
