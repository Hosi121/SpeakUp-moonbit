import { Link } from "../../navigation/links";
import { Dialog } from "../ui/Dialog";
import { Icon } from "../ui/Icon";
import { Avatar } from "../ui/Avatar";
import { useActivity, useActivityController } from "../../services/activity";
export default function NotificationModal() {
  const controller = useActivityController();
  const activity = useActivity();
  const { open, busy, read_error: error, items: notifications } = activity;
  const { set_open: setOpen, read } = controller;
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
          {notifications.map(({ value: n, description, destination }) => (
            <li key={n.id} className="panel row">
              <Avatar src={n.actor.avatar_url} name={n.actor.username} />
              <div className="grow">
                <strong>{n.actor.username}</strong>
                <p>{description}</p>
                <small>
                  {new Date(n.created_at).toLocaleString()}{" "}
                  {n.read ? "既読" : "未読"}
                </small>
                <p>
                  <Link onClick={() => setOpen(false)} to={destination}>
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
