import { useMemo } from "react";
import { createSocial, browserPorts } from "../../../../dist/presenter.js";
import { useController } from "../../services/controller";
import { Link } from "../../navigation/links";
import { Avatar } from "../ui/Avatar";

export default function FriendList() {
  const controller = useMemo(() => createSocial(browserPorts(), false), []);
  const { social, loaded, error } = useController(controller);
  const friends = social.friends;
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
            <Avatar src={friend.avatar_url} name={friend.username} />
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
