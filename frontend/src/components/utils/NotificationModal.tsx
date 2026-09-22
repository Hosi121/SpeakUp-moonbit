import { useState, useEffect } from "react";
import { Dialog } from "../ui/Dialog";
import { Icon } from "../ui/Icon";
import { Avatar } from "../ui/Avatar";
import { fetchNotifications } from "../../services/appData";
import type { NotificationItem } from "../../types/types";

export default function NotificationModal() {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    void fetchNotifications()
      .then(setNotifications)
      .catch(() => setError("通知を取得できませんでした。"));
  }, []);
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
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} title="通知">
        {error && (
          <p role="alert" className="alert">
            {error}
          </p>
        )}
        {!error && notifications.length === 0 && (
          <p>新しい通知はありません。</p>
        )}
        <ul className="plain-list stack">
          {notifications.map((notification) => (
            <li key={notification.id} className="row">
              <Avatar src={notification.profileIcon} name={notification.user} />
              <div className="grow">
                <p>
                  <strong>{notification.user}</strong> {notification.message}
                </p>
                <small>{notification.time}</small>
              </div>
              {notification.type === "friendRequest" && (
                <div className="row">
                  <button type="button" disabled>
                    承認
                  </button>
                  <button type="button" disabled>
                    拒否
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      </Dialog>
    </>
  );
}
