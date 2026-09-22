import { useEffect, useState } from "react";
import type { LearningDto } from "../../../../dist/shared.js";
import { fetchLearning, generateFeedback } from "../../services/features";
export function LearningFeedback({
  id,
  saved,
}: {
  id: number;
  saved: boolean;
}) {
  const [learning, setLearning] = useState<LearningDto | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let disposed = false;
    void fetchLearning(id)
      .then((data) => {
        if (!disposed) setLearning(data);
      })
      .catch(() => {
        if (!disposed) setError("学習アドバイスを取得できませんでした。");
      });
    return () => {
      disposed = true;
    };
  }, [id, saved]);
  const generate = async () => {
    setBusy(true);
    setError("");
    try {
      setLearning(await generateFeedback(id));
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "アドバイスを作成できませんでした。",
      );
    } finally {
      setBusy(false);
    }
  };
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
      <button
        disabled={!saved || busy || learning?.feedback_current}
        onClick={() => void generate()}
      >
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
