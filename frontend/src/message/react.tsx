import { memo, useEffect, useSyncExternalStore } from "react";
import type {
  ThreadController,
  MessageView as MessageRow,
} from "../../../dist/thread.js";
import { Redirect } from "../navigation/links";
import { Avatar } from "../components/ui/Avatar";
import { Input } from "../components/ui/Field";

export function MessageView({ controller }: { controller: ThreadController }) {
  const view = useSyncExternalStore(
    controller.subscribe,
    controller.get_snapshot,
  );
  useEffect(() => {
    controller.start();
    return controller.stop;
  }, [controller]);
  if (!view.valid) return <Redirect to="/friendrequest" />;
  return (
    <>
      {view.error && (
        <p className="alert" role="alert">
          {view.error}
        </p>
      )}
      {!view.loaded && !view.error && <p role="status">読み込み中…</p>}
      {view.loaded && (
        <>
          <div className="row">
            <Avatar src={view.peer_avatar} name={view.peer_name} />
            <h1>{view.peer_name}</h1>
          </div>
          <section className="panel stack" aria-label="メッセージ">
            {view.has_older && (
              <button
                disabled={view.loading_older}
                onClick={controller.load_older}
              >
                以前のメッセージ
              </button>
            )}
            <MessageLog messages={view.messages} />
            <form
              className="row search-form"
              onSubmit={(event) => {
                event.preventDefault();
                controller.send();
              }}
            >
              <Input
                label="メッセージを入力"
                maxLength={2000}
                required
                value={view.draft}
                disabled={view.sending}
                onChange={(event) => controller.set_draft(event.target.value)}
              />
              <button className="primary" disabled={!view.can_send}>
                送信
              </button>
            </form>
          </section>
        </>
      )}
    </>
  );
}

const MessageLog = memo(function MessageLog({
  messages,
}: {
  messages: MessageRow[];
}) {
  return (
    <div className="chat-log stack" role="log" aria-label="メッセージの履歴">
      {messages.length === 0 && <p>まだメッセージはありません。</p>}
      {messages.map((message) => (
        <div
          className="chat-bubble pre-wrap"
          data-own={message.own}
          key={message.id}
        >
          <p>{message.body}</p>
          <small>
            {message.time}
            {message.own && message.read ? "・既読" : ""}
          </small>
        </div>
      ))}
    </div>
  );
});
