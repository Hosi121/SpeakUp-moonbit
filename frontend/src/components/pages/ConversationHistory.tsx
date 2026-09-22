import { useEffect, useState } from "react";
import { navigate } from "../../navigation/location";
import { type ConversationDto } from "../../../../dist/shared.js";
import { fetchConversations } from "../../services/conversationService";
import { BottomNavigationTemplate } from "../templates/BottomNavigationTemplate";
import TopSection from "../utils/TopSection";

export const ConversationHistory = () => {
  const [calls, setCalls] = useState<ConversationDto[]>([]);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    let disposed = false;
    void fetchConversations(true)
      .then((calls) => {
        if (!disposed) {
          setCalls(calls);
          setLoaded(true);
        }
      })
      .catch((error) => {
        if (!disposed)
          setError(
            error instanceof Error
              ? error.message
              : "履歴を取得できませんでした",
          );
      });
    return () => {
      disposed = true;
    };
  }, []);
  return (
    <BottomNavigationTemplate value="record">
      <div className="page stack">
        <TopSection />
        <h1>会話の記録</h1>
        {error && (
          <p role="alert" className="alert">
            {error}
          </p>
        )}
        {loaded && calls.length === 0 && (
          <p>
            終了した会話はまだありません。
            <button type="button" onClick={() => navigate("/sessionlist")}>
              通話へ
            </button>
          </p>
        )}
        {calls.map((call) => (
          <article key={call.id} className="panel stack compact">
            <h2>{call.theme}</h2>
            <p>{call.participants.map((user) => user.username).join(" / ")}</p>
            <p>
              {new Date(call.started_at).toLocaleString()}
              {call.event_id ? `・ラウンド ${call.round}` : "・随時通話"}
            </p>
            <button
              type="button"
              onClick={() => navigate(`/sessionrecord?conversation=${call.id}`)}
            >
              振り返りを開く
            </button>
          </article>
        ))}
      </div>
    </BottomNavigationTemplate>
  );
};
