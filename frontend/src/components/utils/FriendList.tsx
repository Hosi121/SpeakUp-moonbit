import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Avatar } from "../ui/Avatar";
import { fetchSocial } from "../../services/features";
import { useActivity } from "../../services/activity";
import { mapFriend } from "../../../../dist/shared.js";
import type { FriendSummary } from "../../types/types";

export default function FriendList() {
  const { revision } = useActivity();
  const [friends, setFriends] = useState<FriendSummary[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    void fetchSocial()
      .then((data) => {
        setFriends(data.friends.map(mapFriend));
        setLoaded(true);
      })
      .catch(() => setError("フレンドを取得できませんでした。"));
  }, [revision]);
  return (
    <section className="stack" aria-label="フレンド一覧">
      <Link to="/friendrequest">フレンド申請を確認・送信</Link>
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
            <Link className="button" to={`/message/${friend.id}`}>
              メッセージ
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
