import { useMemo } from "react";
import { createAdmin, browserPorts } from "../../../../dist/presenter.js";
import { useController } from "../../services/controller";
import { Dialog } from "../ui/Dialog";
import { Input } from "../ui/Field";
import { Avatar } from "../ui/Avatar";
import { ChoiceGroup } from "../ui/ChoiceGroup";
import { EventList } from "./Events";
import TopSection from "../utils/TopSection";

export default function AdminPage() {
  const controller = useMemo(() => createAdmin(browserPorts()), []);
  const {
    open,
    dateTime,
    theme,
    topics,
    success,
    error,
    dialogError,
    created,
    section,
    query,
    users,
    searched,
    busy,
  } = useController(controller);
  const lastCreated = created[0];
  const { close, create, generate, search } = controller;
  return (
    <main className="page stack">
      <TopSection />
      <h1>管理</h1>
      <ChoiceGroup
        label="管理する項目"
        value={section}
        onChange={(value) => controller.set_field("section", value)}
        options={[
          { value: "events", label: "イベント管理" },
          { value: "users", label: "ユーザー情報" },
        ]}
      />
      {success && (
        <p role="status" className="alert">
          {success}
        </p>
      )}
      {error && (
        <p role="alert" className="alert">
          {error}
        </p>
      )}
      {section === "events" ? (
        <section className="stack">
          <EventList admin refreshKey={lastCreated?.id ?? 0} />
          <button
            type="button"
            className="primary"
            aria-haspopup="dialog"
            onClick={() => {
              controller.open();
            }}
          >
            イベント作成
          </button>
          {lastCreated && (
            <article
              className="panel stack"
              aria-label="最後に作成したイベント"
            >
              <h2>最後に作成したイベント</h2>
              <p>
                予定日時: {new Date(lastCreated.eventStart).toLocaleString()}
              </p>
              <h3>テーマ</h3>
              <p>{lastCreated.theme.themeText}</p>
              <h3>トピック</h3>
              <ul>
                {[
                  lastCreated.theme.topic1,
                  lastCreated.theme.topic2,
                  lastCreated.theme.topic3,
                ].map((topic, index) => (
                  <li key={index}>{topic || "(未入力)"}</li>
                ))}
              </ul>
            </article>
          )}
        </section>
      ) : (
        <section className="stack">
          <h2>ユーザー情報検索</h2>
          <form
            className="row search-form"
            onSubmit={(event) => {
              event.preventDefault();
              void search();
            }}
          >
            <Input
              label="ユーザー名で検索"
              value={query}
              onChange={(event) =>
                controller.set_field("query", event.target.value)
              }
              required
            />
            <button type="submit" disabled={busy}>
              検索
            </button>
          </form>
          {busy && <p role="status">検索中…</p>}
          {searched && users.length === 0 && (
            <p>ユーザーが見つかりません。別の名前で検索してください。</p>
          )}
          <ul className="plain-list stack">
            {users.map((user) => (
              <li key={user.id} className="panel row">
                <Avatar src={user.avatarUrl} name={user.username} />
                <div className="grow">
                  <h3>{user.username}</h3>
                  <p>メール: {user.email}</p>
                  <small>
                    登録日: {new Date(user.createdAt).toLocaleString()}
                  </small>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
      <Dialog
        open={open}
        onClose={() => {
          if (!busy) close();
        }}
        title="イベント作成"
      >
        <form
          className="stack"
          onSubmit={(event) => {
            event.preventDefault();
            void create();
          }}
        >
          <Input
            label="予定日時"
            type="datetime-local"
            step={1}
            required
            disabled={busy}
            value={dateTime}
            onChange={(event) =>
              controller.set_field("dateTime", event.target.value)
            }
          />
          <Input
            label="テーマ"
            required
            disabled={busy}
            value={theme}
            onChange={(event) =>
              controller.set_field("theme", event.target.value)
            }
          />
          <button type="button" disabled={busy} onClick={() => void generate()}>
            AIによる生成
          </button>
          {topics.map((topic, index) => (
            <Input
              key={index}
              label={`トピック ${index + 1}`}
              disabled={busy}
              value={topic}
              onChange={(event) =>
                controller.set_topic(index, event.target.value)
              }
            />
          ))}
          {dialogError && (
            <p role="alert" className="alert">
              {dialogError}
            </p>
          )}
          <div className="row">
            <button type="button" disabled={busy} onClick={close}>
              キャンセル
            </button>
            <button className="primary" type="submit" disabled={busy}>
              作成
            </button>
          </div>
        </form>
      </Dialog>
    </main>
  );
}
