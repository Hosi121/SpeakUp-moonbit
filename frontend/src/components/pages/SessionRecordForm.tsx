import { useEffect, useState } from "react";
import { Input, Textarea } from "../ui/Field";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import {
  conversationClock,
  type ConversationDto,
} from "../../../../dist/shared.js";
import {
  fetchConversation,
  fetchReflection,
  saveReflection,
} from "../../services/conversationService";
import TopSection from "../utils/TopSection";

export default function SessionRecordForm() {
  const [query] = useSearchParams();
  const id = Number(query.get("conversation"));
  return Number.isInteger(id) && id > 0 && id <= 2147483647 ? (
    <RecordForm key={id} id={id} />
  ) : (
    <Navigate to="/conversation_history" replace />
  );
}
function RecordForm({ id }: { id: number }) {
  const navigate = useNavigate();
  const [conversation, setConversation] = useState<ConversationDto | null>(
    null,
  );
  const [satisfaction, setSatisfaction] = useState("50");
  const [comment, setComment] = useState("");
  const [learned, setLearned] = useState("");
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    let disposed = false;
    void Promise.all([fetchConversation(id), fetchReflection(id)])
      .then(([call, reflection]) => {
        if (disposed) return;
        setConversation(call);
        setSatisfaction(String(reflection.satisfaction));
        setComment(reflection.comment);
        setLearned(reflection.learned_expressions);
        setSaved(reflection.saved);
      })
      .catch((error) => {
        if (!disposed)
          setError(
            error instanceof Error
              ? error.message
              : "記録を読み込めませんでした",
          );
      })
      .finally(() => {
        if (!disposed) setBusy(false);
      });
    return () => {
      disposed = true;
    };
  }, [id]);
  const complete =
    conversation &&
    conversationClock(conversation, Date.now()).phase === "completed";
  const save = async () => {
    const rating = Number(satisfaction);
    if (
      satisfaction.trim() === "" ||
      !Number.isInteger(rating) ||
      rating < 0 ||
      rating > 100
    ) {
      setError("満足度は 0〜100 の整数で入力してください");
      return;
    }
    setBusy(true);
    setError("");
    setSaved(false);
    try {
      await saveReflection(id, {
        satisfaction: rating,
        comment,
        learned_expressions: learned,
      });
      setSaved(true);
    } catch (error) {
      setError(error instanceof Error ? error.message : "保存できませんでした");
    } finally {
      setBusy(false);
    }
  };
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
            setSatisfaction(event.target.value);
            setSaved(false);
          }}
          disabled={busy || !complete}
        />
        <Textarea
          label="感想"
          rows={3}
          maxLength={4000}
          value={comment}
          onChange={(event) => {
            setComment(event.target.value);
            setSaved(false);
          }}
          disabled={busy || !complete}
        />
        <Textarea
          label="学んだ表現"
          rows={4}
          maxLength={8000}
          value={learned}
          onChange={(event) => {
            setLearned(event.target.value);
            setSaved(false);
          }}
          disabled={busy || !complete}
        />
        <button type="submit" className="primary" disabled={busy || !complete}>
          保存
        </button>
      </form>
      <button type="button" onClick={() => navigate("/sessionlist")}>
        通話一覧へ
      </button>
      <button type="button" onClick={() => navigate("/conversation_history")}>
        会話の記録へ
      </button>
    </main>
  );
}
