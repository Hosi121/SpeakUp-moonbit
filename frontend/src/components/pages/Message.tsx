import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import TopSection from "../utils/TopSection";
import { BottomNavigationTemplate } from "../templates/BottomNavigationTemplate";
import { Avatar } from "../ui/Avatar";
import { Input } from "../ui/Field";
import { fetchFriendInfo } from "../../services/friendService";
import type { FriendInfo } from "../../types/types";

export function Message() {
  const { friendname } = useParams<{ friendname: string }>();
  const [friend, setFriend] = useState<FriendInfo | null>(null);
  const [messages, setMessages] = useState<string[]>([]);
  const [input, setInput] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    if (friendname)
      void fetchFriendInfo(friendname)
        .then(setFriend)
        .catch(() => setError("フレンドを取得できませんでした。"));
  }, [friendname]);
  return (
    <BottomNavigationTemplate value="other">
      <div className="page stack">
        <TopSection />
        {error && (
          <p className="alert" role="alert">
            {error}
          </p>
        )}
        {!friend && !error && <p role="status">読み込み中…</p>}
        {friend && (
          <>
            <div className="row">
              <Avatar src={friend.avatarUrl} name={friend.username} />
              <h1>{friend.username}</h1>
            </div>
            <section className="panel stack" aria-label="メッセージ">
              <div
                className="chat-log stack"
                role="log"
                aria-label="メッセージの履歴"
              >
                <p className="chat-bubble">こんにちは</p>
                {messages.map((message, index) => (
                  <p className="chat-bubble" data-own="true" key={index}>
                    {message}
                  </p>
                ))}
              </div>
              <form
                className="row search-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (input.trim()) {
                    setMessages((messages) => [...messages, input]);
                    setInput("");
                  }
                }}
              >
                <Input
                  label="メッセージを入力"
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                />
                <button type="submit" className="primary">
                  送信
                </button>
              </form>
            </section>
          </>
        )}
      </div>
    </BottomNavigationTemplate>
  );
}
