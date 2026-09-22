import { useMemo } from "react";
import { createSocial, browserPorts } from "../../../../dist/presenter.js";
import { useController } from "../../services/controller";
import type { FriendSummaryDto } from "../../../../dist/shared.js";
import { Link } from "../../navigation/links";
import TopSection from "../utils/TopSection";
import { Avatar } from "../ui/Avatar";
import { Input } from "../ui/Field";

export default function FriendRequest() {
  const controller = useMemo(() => createSocial(browserPorts(), true), []);
  const view = useController(controller);
  const { candidates, query, error, busy } = view;
  const social = view.loaded ? view.social : null;
  const { set_query: setQuery, change, search } = controller;
  const person = (p: FriendSummaryDto) => (
    <div className="row">
      <Avatar src={p.avatar_url} name={p.username} />
      <strong>{p.username}</strong>
    </div>
  );
  return (
    <main className="page stack">
      <TopSection />
      <h1>フレンド申請</h1>
      <p>申請を相手が承認すると、メッセージを送れます。</p>
      {error && (
        <p className="alert" role="alert">
          {error}
        </p>
      )}
      {!social && !error && <p role="status">読み込み中…</p>}
      <section className="stack" aria-label="届いた申請">
        <h2>届いた申請</h2>
        {social?.incoming.length === 0 && <p>届いた申請はありません。</p>}
        {social?.incoming.map((p) => (
          <article key={p.id} className="panel stack">
            {person(p)}
            <div className="row">
              <button
                disabled={busy}
                onClick={() => void change(p.id, "accept")}
              >
                承認
              </button>
              <button
                disabled={busy}
                onClick={() => void change(p.id, "reject")}
              >
                見送る
              </button>
            </div>
          </article>
        ))}
      </section>
      <section className="stack" aria-label="送った申請">
        <h2>送った申請</h2>
        {social?.outgoing.length === 0 && <p>送った申請はありません。</p>}
        {social?.outgoing.map((p) => (
          <article key={p.id} className="panel row">
            {person(p)}
            <button disabled={busy} onClick={() => void change(p.id, "cancel")}>
              取り消す
            </button>
          </article>
        ))}
      </section>
      <section className="stack">
        <h2>通話した相手・ユーザー検索</h2>
        <form
          className="row search-form"
          onSubmit={(e) => {
            e.preventDefault();
            void search();
          }}
        >
          <Input
            label="ユーザー名で検索"
            required
            maxLength={255}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button disabled={busy}>検索</button>
        </form>
        {candidates.length === 0 && <p>候補はいません。名前で検索できます。</p>}
        {candidates.map(({ person: p, known, accepted, can_request }) => {
          return (
            <article className="panel row" key={p.id}>
              {person(p)}
              {accepted ? (
                <Link to={`/message/${p.id}`}>メッセージ</Link>
              ) : (
                <button
                  disabled={!can_request}
                  onClick={() => void change(p.id, "request")}
                >
                  {known ? "申請中" : "フレンド申請"}
                </button>
              )}
            </article>
          );
        })}
      </section>
      <Link to="/session_history_friendlist">履歴とフレンドへ</Link>
      <Link to="/home">ホームへ</Link>
    </main>
  );
}
