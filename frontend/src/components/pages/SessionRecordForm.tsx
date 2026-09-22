import { useMemo } from "react";
import { createReflection, browserPorts } from "../../../../dist/presenter.js";
import { useController } from "../../services/controller";
import { Input, Textarea } from "../ui/Field";
import { Redirect, Link } from "../../navigation/links";
import { navigate, useLocation } from "../../navigation/location";
import { LearningFeedback } from "../utils/LearningFeedback";
import TopSection from "../utils/TopSection";
export default function SessionRecordForm() {
  const raw = useLocation().searchParams.get("conversation") ?? "";
  return <RecordForm key={raw} raw={raw} />;
}
function RecordForm({ raw }: { raw: string }) {
  const controller = useMemo(
    () => createReflection(browserPorts(), raw),
    [raw],
  );
  const view = useController(controller);
  const { id, satisfaction, comment, learned, busy, error, saved, complete } =
    view;
  const conversation = view.conversation[0];
  const save = controller.save;
  if (!id) return <Redirect to="/conversation_history" />;
  return (
    <main className="page stack">
      <TopSection />
      <h1>会話の振り返り</h1>
      {conversation && (
        <section className="panel stack compact">
          <h2>{conversation.theme}</h2>
          <p>
            {conversation.participants.map((user) => user.username).join(" / ")}
          </p>
          <p>
            {conversation.started_at
              ? new Date(conversation.started_at).toLocaleString()
              : "未開始"}
          </p>
        </section>
      )}
      {error && (
        <p role="alert" className="alert">
          {error}
        </p>
      )}
      {!busy && conversation && !complete && (
        <p className="alert">通話が終了してから記録できます。</p>
      )}
      {saved && (
        <p role="alert" className="alert">
          保存済みです。振り返りは本人だけが閲覧できます。
        </p>
      )}
      <form
        className="panel stack"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <Input
          label="満足度 (%)"
          type="number"
          min={0}
          max={100}
          step={1}
          required
          value={satisfaction}
          onChange={(event) => {
            controller.set_field("satisfaction", event.target.value);
          }}
          disabled={busy || !complete}
        />
        <Textarea
          label="感想"
          rows={3}
          maxLength={4000}
          value={comment}
          onChange={(event) => {
            controller.set_field("comment", event.target.value);
          }}
          disabled={busy || !complete}
        />
        <Textarea
          label="学んだ表現"
          rows={4}
          maxLength={8000}
          value={learned}
          onChange={(event) => {
            controller.set_field("learned", event.target.value);
          }}
          disabled={busy || !complete}
        />
        <button type="submit" className="primary" disabled={busy || !complete}>
          保存
        </button>
      </form>
      {complete && (
        <>
          <LearningFeedback id={id} saved={saved} />
          <Link to={`/sessionfeedback?conversation=${id}`}>
            6 つの質問で振り返る
          </Link>
          <Link to="/friendrequest">通話した相手にフレンド申請</Link>
        </>
      )}
      <button type="button" onClick={() => navigate("/sessionlist")}>
        通話一覧へ
      </button>
      <button type="button" onClick={() => navigate("/conversation_history")}>
        会話の記録へ
      </button>
    </main>
  );
}
