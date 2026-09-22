import { Link } from "react-router-dom";
import { Avatar } from "../ui/Avatar";
import type { SessionHistoryItem } from "../../types/types";

export default function SessionHistory({
  history,
}: {
  history: SessionHistoryItem[];
}) {
  return (
    <ul className="plain-list stack">
      {history.map((data, index) => (
        <li key={index} className="panel stack">
          <div className="row">
            <Avatar src={data.avatar} name={data.user} />
            <div className="grow">
              <h2>{data.user}</h2>
              <p>話したテーマ: {data.theme}</p>
              <p>最終日: {data.date}</p>
              <small>ランク{data.rank}</small>
            </div>
          </div>
          <div className="row">
            <button type="button" disabled>
              {data.friendState === "unapplied"
                ? "フレンド申請"
                : "フレンド申請済"}
            </button>
            {data.friendState === "friend" ? (
              <Link
                className="button"
                to={`/message/${encodeURIComponent(data.user)}`}
              >
                メッセージ
              </Link>
            ) : (
              <button type="button" disabled>
                メッセージ
              </button>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
