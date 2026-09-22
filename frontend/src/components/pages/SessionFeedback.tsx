import { useMemo } from "react";
import { createLearning, browserPorts } from "../../../../dist/presenter.js";
import { useController } from "../../services/controller";
import { Link, Redirect } from "../../navigation/links";
import { useLocation } from "../../navigation/location";
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
  const raw = useLocation().searchParams.get("conversation") ?? "";
  return <Survey key={raw} raw={raw} />;
}
function Survey({ raw }: { raw: string }) {
  const controller = useMemo(
    () => createLearning(browserPorts(), raw, false),
    [raw],
  );
  const { id, answers, busy, error, saved } = useController(controller);
  const save = controller.save;
  if (!id) return <Redirect to="/conversation_history" />;
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
                    controller.answer(index, value);
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
