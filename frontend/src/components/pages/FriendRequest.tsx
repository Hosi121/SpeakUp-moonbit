import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import TopSection from "../utils/TopSection";
import { Avatar } from "../ui/Avatar";
import { sendFriendRequest } from "../../services/friendService";
import { fetchUserSummaryById } from "../../services/userService";
import type { FriendState } from "../../types/types";

type Friend = {
  id: number;
  username: string;
  avatarUrl: string;
  friendState: FriendState;
};
// Legacy feedback screen: participant selection is still a prototype.
const userIds = [2, 3];

export default function FriendRequest() {
  const [friends, setFriends] = useState<Friend[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState<number | null>(null);
  useEffect(() => {
    void Promise.all(
      userIds.map(async (id) => {
        const user = await fetchUserSummaryById(id);
        return {
          id,
          username: user.username,
          avatarUrl: user.avatarUrl,
          friendState: "unapplied" as const,
        };
      }),
    )
      .then(setFriends)
      .catch((error) =>
        setError(
          error instanceof Error
            ? error.message
            : "フレンドを取得できませんでした。",
        ),
      )
      .finally(() => setLoading(false));
  }, []);
  const send = async (id: number) => {
    setSending(id);
    setError("");
    try {
      await sendFriendRequest(id);
      setFriends((friends) =>
        friends.map((friend) =>
          friend.id === id ? { ...friend, friendState: "pending" } : friend,
        ),
      );
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "申請できませんでした。",
      );
    } finally {
      setSending(null);
    }
  };
  return (
    <main className="page stack">
      <TopSection />
      <h1>フレンド申請</h1>
      <p>
        今日話した相手ともっと話したいときは、フレンド申請をしてメッセージでセッションの続きを話そう！
      </p>
      {loading && <p role="status">読み込み中…</p>}
      {error && (
        <p className="alert" role="alert">
          {error}
        </p>
      )}
      <ul className="plain-list stack">
        {friends.map((friend) => (
          <li className="panel stack" key={friend.id}>
            <div className="row">
              <Avatar src={friend.avatarUrl} name={friend.username} />
              <div>
                <h2>{friend.username}</h2>
                <small>User ID: {friend.id}</small>
              </div>
            </div>
            <button
              type="button"
              className="primary"
              disabled={sending !== null || friend.friendState !== "unapplied"}
              onClick={() => void send(friend.id)}
            >
              {friend.friendState === "unapplied"
                ? "フレンド申請"
                : "フレンド申請済"}
            </button>
          </li>
        ))}
      </ul>
      <p>フレンド申請は、記録＞セッション履歴からでもできるよ！</p>
      <Link className="button primary" to="/home">
        セッションを終わる→
      </Link>
    </main>
  );
}
