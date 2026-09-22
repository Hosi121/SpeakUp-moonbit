import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Avatar } from "../ui/Avatar";
import { fetchFriendList } from "../../services/friendService";
import type { FriendSummary } from "../../types/types";

export default function FriendList() {
  const [friends, setFriends] = useState<FriendSummary[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    void fetchFriendList()
      .then((data) => {
        setFriends(data);
        setLoaded(true);
      })
      .catch(() => setError("フレンドを取得できませんでした。"));
  }, []);
  return (
    <section className="stack" aria-label="フレンド一覧">
      {error && (
        <p role="alert" className="alert">
          {error}
        </p>
      )}
      {loaded && friends.length === 0 && (
        <p>
          フレンドはまだいません。<Link to="/sessionlist">通話へ</Link>
        </p>
      )}
      <ul className="plain-list stack">
        {friends.map((friend) => (
          <li key={friend.id} className="panel row">
            <Avatar src={friend.avatarUrl} name={friend.username} />
            <strong className="grow">{friend.username}</strong>
            <Link
              className="button"
              to={`/message/${encodeURIComponent(friend.username)}`}
            >
              メッセージ
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
