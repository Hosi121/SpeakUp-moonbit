import { Link, Navigate, useSearchParams } from "react-router-dom";
import { useEffect, useState } from "react";
import { fetchLearning, saveSurvey } from "../../services/features";
import TopSection from "../utils/TopSection";

const questions = [
  {
    label: "楽しかった？",
    options: ["すごく楽しかった", "楽しかった", "あまり楽しくなかった"],
  },
  {
    label: "英語だけで話せた？",
    options: ["全部英語だった", "ほぼ英語だった", "ときどき日本語だった"],
  },
  {
    label: "前回よりたくさん話せた？",
    options: ["前回より多く話せた", "同じくらい", "前回より少なかった"],
  },
  {
    label: "相手は英語だけで話してた？",
    options: ["全部英語だった", "ほとんど英語だった", "ときどき日本語だった"],
  },
  {
    label: "相手はたくさん話してくれた？",
    options: ["はい", "まあまあ", "いいえ"],
  },
  {
    label: "相手はたくさん聞いてくれた？",
    options: ["はい", "まあまあ", "いいえ"],
  },
];

export default function SessionFeedback() {
  const [query] = useSearchParams();
  const id = Number(query.get("conversation"));
  return Number.isInteger(id) && id > 0 && id <= 2147483647 ? (
    <Survey key={id} id={id} />
  ) : (
    <Navigate to="/conversation_history" replace />
  );
}
function Survey({ id }: { id: number }) {
  const [answers, setAnswers] = useState<number[]>([1, 1, 1, 1, 1, 1]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    let disposed = false;
    void fetchLearning(id)
      .then((data) => {
        if (!disposed && data.answers.length) {
          setAnswers(data.answers);
          setSaved(true);
        }
      })
      .catch(() => {
        if (!disposed) setError("振り返りを取得できませんでした。");
      })
      .finally(() => {
        if (!disposed) setBusy(false);
      });
    return () => {
      disposed = true;
    };
  }, [id]);
  const save = async () => {
    setBusy(true);
    setError("");
    try {
      await saveSurvey(id, answers);
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存できませんでした。");
    } finally {
      setBusy(false);
    }
  };
  return (
    <main className="page stack">
      <TopSection />
      <h1>会話を振り返る</h1>
      <p>この回答は本人だけが閲覧できます。</p>
      {error && <p role="alert">{error}</p>}
      {saved && <p role="status">保存済みです。</p>}
      <form
        className="panel stack"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        {questions.map((question, index) => (
          <fieldset key={question.label} disabled={busy}>
            <legend>{question.label}</legend>
            {question.options.map((option, value) => (
              <label className="radio-option" key={option}>
                <input
                  type="radio"
                  name={`feedback-${index}`}
                  checked={answers[index] === value}
                  onChange={() => {
                    setAnswers((a) =>
                      a.map((n, i) => (i === index ? value : n)),
                    );
                    setSaved(false);
                  }}
                />
                {option}
              </label>
            ))}
          </fieldset>
        ))}
        <button className="primary" disabled={busy}>
          回答を保存
        </button>
      </form>
      <Link to={`/sessionrecord?conversation=${id}`}>感想・学んだ表現へ</Link>
      <Link to="/friendrequest">通話した相手にフレンド申請</Link>
      <Link to="/events">次のイベントを探す</Link>
    </main>
  );
}
