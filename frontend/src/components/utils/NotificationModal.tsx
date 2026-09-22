import { useState } from "react";
import { Link } from "react-router-dom";
import { Dialog } from "../ui/Dialog";
import { Icon } from "../ui/Icon";
import { Avatar } from "../ui/Avatar";
import { useActivity } from "../../services/activity";
import { readInbox } from "../../services/features";
import type { NotificationDto } from "../../../../dist/shared.js";
const descriptions: Record<string, string> = {
  friend_request: "フレンド申請が届きました",
  friend_accepted: "フレンド申請が承認されました",
  call_invitation: "通話への招待が届きました",
  message: "新しいメッセージがあります",
  event_matched: "イベントの通話相手が決まりました",
};
function destination(n: NotificationDto) {
  if (n.kind === "message") return `/message/${n.actor.id}`;
  if (n.conversation_id) return "/sessionlist";
  return "/friendrequest";
}
export default function NotificationModal() {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const activity = useActivity();
  const notifications = activity.inbox?.items ?? [];
  const read = async () => {
    if (!notifications[0]) return;
    setBusy(true);
    setError("");
    try {
      await readInbox(notifications[0].id);
    } catch {
      setError("既読にできませんでした。");
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <button
        type="button"
        className="icon-button"
        aria-label="通知"
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
      >
        <Icon name="bell" size={28} />
        {(activity.inbox?.unread ?? 0) > 0 && (
          <span
            className="badge"
            aria-label={`未読 ${activity.inbox?.unread} 件`}
          >
            {activity.inbox?.unread}
          </span>
        )}
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} title="通知">
        {(error || activity.error) && (
          <p role="alert">{error || activity.error}</p>
        )}
        {!activity.connected && (
          <p role="status">更新通知に再接続しています。</p>
        )}
        {notifications.length === 0 && !activity.error && (
          <p>新しい通知はありません。</p>
        )}
        {(activity.inbox?.unread ?? 0) > 0 && (
          <button disabled={busy} onClick={() => void read()}>
            表示した通知まで既読にする
          </button>
        )}
        <ul className="plain-list stack">
          {notifications.map((n) => (
            <li key={n.id} className="panel row">
              <Avatar src={n.actor.avatar_url} name={n.actor.username} />
              <div className="grow">
                <strong>{n.actor.username}</strong>
                <p>{descriptions[n.kind]}</p>
                <small>
                  {new Date(n.created_at).toLocaleString()}{" "}
                  {n.read ? "既読" : "未読"}
                </small>
                <p>
                  <Link onClick={() => setOpen(false)} to={destination(n)}>
                    確認する
                  </Link>
                </p>
              </div>
            </li>
          ))}
        </ul>
      </Dialog>
    </>
  );
}
