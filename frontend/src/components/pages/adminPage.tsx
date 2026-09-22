import { useState } from "react";
import { Dialog } from "../ui/Dialog";
import { Input } from "../ui/Field";
import { Avatar } from "../ui/Avatar";
import { ChoiceGroup } from "../ui/ChoiceGroup";
import { EventList } from "./Events";
import TopSection from "../utils/TopSection";
import type { Event, User } from "../../types/types";
import * as eventService from "../../services/eventService";
import { searchUsers } from "../../services/userService";

export default function AdminPage() {
  const [open, setOpen] = useState(false);
  const [dateTime, setDateTime] = useState("");
  const [theme, setTheme] = useState("");
  const [topics, setTopics] = useState(["", "", ""]);
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");
  const [dialogError, setDialogError] = useState("");
  const [lastCreated, setLastCreated] = useState<Event | null>(null);
  const [section, setSection] = useState("events");
  const [query, setQuery] = useState("");
  const [users, setUsers] = useState<User[]>([]);
  const [searched, setSearched] = useState(false);
  const [busy, setBusy] = useState(false);
  const close = () => {
    setOpen(false);
    setDateTime("");
    setTheme("");
    setTopics(["", "", ""]);
    setDialogError("");
  };
  const create = async () => {
    setBusy(true);
    setDialogError("");
    try {
      const created = await eventService.createEvent({
        eventStart: new Date(dateTime).toISOString(),
        theme,
        topics,
      });
      setLastCreated(created);
      setSuccess("イベントが正常に作成されました");
      close();
    } catch (error) {
      setDialogError(
        error instanceof Error
          ? error.message
          : "イベントの作成に失敗しました。",
      );
    } finally {
      setBusy(false);
    }
  };
  const generate = async () => {
    setBusy(true);
    setDialogError("");
    try {
      setTheme(await eventService.generateTheme());
    } catch {
      setDialogError("テーマの生成に失敗しました。");
    } finally {
      setBusy(false);
    }
  };
  const search = async () => {
    setBusy(true);
    setError("");
    try {
      setUsers(await searchUsers(query));
      setSearched(true);
    } catch {
      setError("ユーザーの検索に失敗しました。");
    } finally {
      setBusy(false);
    }
  };
  return (
    <main className="page stack">
      <TopSection />
      <h1>管理</h1>
      <ChoiceGroup
        label="管理する項目"
        value={section}
        onChange={setSection}
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
              setOpen(true);
              setError("");
              setSuccess("");
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
              onChange={(event) => setQuery(event.target.value)}
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
            onChange={(event) => setDateTime(event.target.value)}
          />
          <Input
            label="テーマ"
            required
            disabled={busy}
            value={theme}
            onChange={(event) => setTheme(event.target.value)}
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
                setTopics((topics) =>
                  topics.map((topic, i) =>
                    i === index ? event.target.value : topic,
                  ),
                )
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
