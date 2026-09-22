import { useMemo } from "react";
import { createCalls, browserPorts } from "../../../../dist/presenter.js";
import { useController } from "../../services/controller";
import { Input } from "../ui/Field";
import { Link } from "../../navigation/links";
import { navigate } from "../../navigation/location";
import { BottomNavigationTemplate } from "../templates/BottomNavigationTemplate";
import TopSection from "../utils/TopSection";
export const SessionList = () => {
  const controller = useMemo(() => createCalls(browserPorts()), []);
  const { calls, query, users, busy, refreshing, loaded, error, can_search } =
    useController(controller);
  const { search, invite, refresh, set_query: setQuery } = controller;
  return (
    <BottomNavigationTemplate value="session">
      <div className="page stack">
        <TopSection />
        <Link to="/events">イベントへの参加登録</Link>
        <h1>通話</h1>
        {error && (
          <p role="alert" className="alert">
            {error}
          </p>
        )}
        <section className="panel stack">
          <h2>相手を選んで通話する</h2>
          <p>相手が一覧から参加すると通話が始まります。</p>
          <form
            className="row search-form"
            onSubmit={(event) => {
              event.preventDefault();
              void search();
            }}
          >
            <Input
              label="ユーザー名を検索"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <button type="submit" disabled={!can_search}>
              検索
            </button>
          </form>
          {users.map((user) => (
            <div key={user.id} className="row between">
              <p>{user.username}</p>
              <button
                type="button"
                disabled={busy}
                className="primary"
                onClick={() => void invite(user.id)}
              >
                {user.username} と通話する
              </button>
            </div>
          ))}
        </section>
        <div className="row between">
          <h2>参加できる通話</h2>
          <button
            type="button"
            disabled={busy || refreshing}
            onClick={() => void refresh()}
          >
            一覧を更新
          </button>
        </div>
        {loaded && calls.length === 0 && (
          <p>
            参加できる通話はありません。上の検索から相手を選んで通話できます。
          </p>
        )}
        {calls.map((row) => {
          const { call, partner } = row;
          return (
            <article key={call.id} className="panel stack compact">
              <h2>{call.theme}</h2>
              <p>
                {call.event_id
                  ? `${new Date(call.event_start).toLocaleString()}・ラウンド ${call.round}`
                  : "随時通話"}
              </p>
              <p>相手：{partner}</p>
              <button
                type="button"
                className="primary"
                disabled={!row.can_join}
                onClick={() => navigate(row.path)}
              >
                {row.active ? "再参加する" : "参加する"}
              </button>
            </article>
          );
        })}
        <button type="button" onClick={() => navigate("/conversation_history")}>
          会話の記録を見る
        </button>
      </div>
    </BottomNavigationTemplate>
  );
};
