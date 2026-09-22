import { Link } from "react-router-dom";
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
  return (
    <main className="page stack">
      <TopSection />
      <h1>最後に振り返りをしよう！</h1>
      <div className="panel stack">
        {questions.map((question, index) => (
          <fieldset key={question.label}>
            <legend>{question.label}</legend>
            {question.options.map((option, selected) => (
              <label className="radio-option" key={option}>
                <input
                  type="radio"
                  name={`feedback-${index}`}
                  value={option}
                  defaultChecked={selected === 1}
                />
                {option}
              </label>
            ))}
          </fieldset>
        ))}
      </div>
      <h2 className="center">次に参加予定のセッション</h2>
      <p className="panel center">7月17日20:00〜</p>
      <Link className="button primary" to="/friendrequest">
        次へ
      </Link>
    </main>
  );
}
