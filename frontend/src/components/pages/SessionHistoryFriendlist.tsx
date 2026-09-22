import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import TopSection from "../utils/TopSection";
import { BottomNavigationTemplate } from "../templates/BottomNavigationTemplate";
import { ChoiceGroup } from "../ui/ChoiceGroup";
import FriendList from "../utils/FriendList";
import SessionHistory from "../utils/SessionHistory";
import { fetchSessionHistory } from "../../services/appData";
import type { SessionHistoryItem } from "../../types/types";

export function SessionHistoryFriendlist() {
  const [history, setHistory] = useState<SessionHistoryItem[]>([]);
  const [value, setValue] = useState("history");
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    void fetchSessionHistory()
      .then((data) => {
        setHistory(data);
        setLoaded(true);
      })
      .catch(() => setError("履歴を取得できませんでした。"));
  }, []);
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
        {value === "history" ? (
          <>
            {error && (
              <p role="alert" className="alert">
                {error}
              </p>
            )}
            {loaded && history.length === 0 && (
              <p>
                セッション履歴はありません。
                <Link to="/sessionlist">通話へ</Link>
              </p>
            )}
            <SessionHistory history={history} />
          </>
        ) : (
          <FriendList />
        )}
      </div>
    </BottomNavigationTemplate>
  );
}
