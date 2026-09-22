import { useMemo } from "react";
import { createHistory, browserPorts } from "../../../../dist/presenter.js";
import { useController } from "../../services/controller";
import { Link } from "../../navigation/links";
import TopSection from "../utils/TopSection";
import { BottomNavigationTemplate } from "../templates/BottomNavigationTemplate";
import { ChoiceGroup } from "../ui/ChoiceGroup";
import FriendList from "../utils/FriendList";
export function SessionHistoryFriendlist() {
  const controller = useMemo(() => createHistory(browserPorts()), []);
  const { calls, loaded, error, tab: value } = useController(controller);
  const setValue = controller.set_tab;
  return (
    <BottomNavigationTemplate value="record">
      <div className="page stack">
        <TopSection />
        <h1>履歴とフレンド</h1>
        <ChoiceGroup
          label="表示する一覧"
          value={value}
          onChange={setValue}
          options={[
            { value: "history", label: "セッション履歴" },
            { value: "friends", label: "フレンド" },
          ]}
        />
        {value === "friends" ? (
          <FriendList />
        ) : (
          <>
            {error && <p role="alert">{error}</p>}
            {loaded && calls.length === 0 && (
              <p>終了した会話はまだありません。</p>
            )}
            {calls?.map((call) => (
              <article key={call.id} className="panel stack">
                <h2>{call.theme}</h2>
                <p>{call.participants.map((p) => p.username).join(" / ")}</p>
                <p>
                  {new Date(call.started_at).toLocaleString()}・
                  {call.event_id ? `ラウンド ${call.round}` : "随時通話"}
                </p>
                <Link to={`/sessionrecord?conversation=${call.id}`}>
                  振り返りを開く
                </Link>
              </article>
            ))}
            <Link to="/friendrequest">通話した相手にフレンド申請</Link>
          </>
        )}
      </div>
    </BottomNavigationTemplate>
  );
}
