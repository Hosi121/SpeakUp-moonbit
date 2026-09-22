import { useState, useEffect, useRef } from "react";
import { Redirect } from "../../navigation/links";
import TopSection from "../utils/TopSection";
import { BottomNavigationTemplate } from "../templates/BottomNavigationTemplate";
import { Avatar } from "../ui/Avatar";
import { Input } from "../ui/Field";
import { fetchThread, readThread, sendMessage } from "../../services/features";
import { useActivity } from "../../services/activity";
import type { ThreadDto } from "../../../../dist/shared.js";
export function Message({ friendId }: { friendId: string }) {
  const id = Number(friendId);
  return Number.isInteger(id) && id > 0 && id <= 2147483647 ? (
    <Thread key={id} id={id} />
  ) : (
    <Redirect to="/friendrequest" />
  );
}
function Thread({ id }: { id: number }) {
  const [thread, setThread] = useState<ThreadDto | null>(null);
  const [input, setInput] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [olderBusy, setOlderBusy] = useState(false);
  const retry = useRef<{ body: string; key: string }>();
  const { revision } = useActivity();
  const merge = (next: ThreadDto, older = false) =>
    setThread((previous) => {
      if (!previous) return next;
      const messages = new Map(previous.messages.map((m) => [m.id, m]));
      for (const m of next.messages)
        messages.set(m.id, {
          ...m,
          read_at: m.read_at || messages.get(m.id)?.read_at || "",
        });
      return {
        ...next,
        messages: [...messages.values()].sort((a, b) => a.id - b.id),
        has_older: older ? next.has_older : previous.has_older,
      };
    });
  useEffect(() => {
    let disposed = false;
    void fetchThread(id)
      .then(async (next) => {
        if (disposed) return;
        merge(next);
        const unread = next.messages.filter(
          (m) => m.sender_id === id && !m.read_at,
        );
        if (unread.length && document.visibilityState === "visible") {
          const read = await readThread(id, unread[unread.length - 1].id);
          if (!disposed) merge(read);
        }
      })
      .catch((e) => {
        if (!disposed)
          setError(
            e instanceof Error
              ? e.message
              : "メッセージを取得できませんでした。",
          );
      });
    return () => {
      disposed = true;
    };
  }, [id, revision]);
  const send = async () => {
    if (!input.trim() || busy) return;
    if (retry.current?.body !== input)
      retry.current = { body: input, key: crypto.randomUUID() };
    const pending = retry.current;
    setBusy(true);
    setError("");
    try {
      merge(await sendMessage(id, pending.body, pending.key));
      retry.current = undefined;
      setInput("");
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "送信できませんでした。同じ内容で再試行できます。",
      );
    } finally {
      setBusy(false);
    }
  };
  const older = async () => {
    if (!thread?.messages[0]) return;
    setOlderBusy(true);
    setError("");
    try {
      merge(await fetchThread(id, thread.messages[0].id), true);
    } catch {
      setError("過去のメッセージを取得できませんでした。");
    } finally {
      setOlderBusy(false);
    }
  };
  return (
    <BottomNavigationTemplate value="other">
      <div className="page stack">
        <TopSection />
        {error && (
          <p className="alert" role="alert">
            {error}
          </p>
        )}
        {!thread && !error && <p role="status">読み込み中…</p>}
        {thread && (
          <>
            <div className="row">
              <Avatar
                src={thread.peer.avatar_url}
                name={thread.peer.username}
              />
              <h1>{thread.peer.username}</h1>
            </div>
            <section className="panel stack" aria-label="メッセージ">
              {thread.has_older && (
                <button disabled={olderBusy} onClick={() => void older()}>
                  以前のメッセージ
                </button>
              )}
              <div
                className="chat-log stack"
                role="log"
                aria-label="メッセージの履歴"
              >
                {thread.messages.length === 0 && (
                  <p>まだメッセージはありません。</p>
                )}
                {thread.messages.map((m) => (
                  <div
                    className="chat-bubble pre-wrap"
                    data-own={m.sender_id !== id}
                    key={m.id}
                  >
                    <p>{m.body}</p>
                    <small>
                      {new Date(m.created_at).toLocaleString()}
                      {m.sender_id !== id && m.read_at ? "・既読" : ""}
                    </small>
                  </div>
                ))}
              </div>
              <form
                className="row search-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  void send();
                }}
              >
                <Input
                  label="メッセージを入力"
                  maxLength={2000}
                  required
                  value={input}
                  disabled={busy}
                  onChange={(e) => setInput(e.target.value)}
                />
                <button className="primary" disabled={busy || !input.trim()}>
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
