import { useState, useEffect } from "react";
import { Link } from "../../navigation/links";
import TopSection from "../utils/TopSection";
import { Avatar } from "../ui/Avatar";
import { Input } from "../ui/Field";
import { fetchSocial, changeFriend } from "../../services/features";
import { fetchConversations } from "../../services/conversationService";
import { searchUsers, fetchUserProfile } from "../../services/userService";
import { useActivity } from "../../services/activity";
import type { FriendSummaryDto, SocialDto } from "../../../../dist/shared.js";

export default function FriendRequest() {
  const [social, setSocial] = useState<SocialDto | null>(null);
  const [candidates, setCandidates] = useState<FriendSummaryDto[]>([]);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const { revision } = useActivity();
  useEffect(() => {
    let disposed = false;
    void fetchSocial()
      .then((value) => {
        if (!disposed) setSocial(value);
      })
      .catch(() => {
        if (!disposed) setError("フレンドを取得できませんでした。");
      });
    return () => {
      disposed = true;
    };
  }, [revision]);
  useEffect(() => {
    let disposed = false;
    void Promise.all([fetchConversations(true), fetchUserProfile()])
      .then(([history, me]) => {
        const peers = new Map(
          history
            .flatMap((call) => call.participants.filter((p) => p.id !== me.id))
            .map((p) => [p.id, p]),
        );
        if (!disposed) setCandidates([...peers.values()]);
      })
      .catch(() => {
        if (!disposed) setError("通話相手を取得できませんでした。");
      });
    return () => {
      disposed = true;
    };
  }, []);
  const change = async (
    id: number,
    action: "request" | "accept" | "reject" | "cancel",
  ) => {
    setBusy(true);
    setError("");
    try {
      setSocial(await changeFriend(id, action));
    } catch (e) {
      setError(e instanceof Error ? e.message : "申請を変更できませんでした。");
    } finally {
      setBusy(false);
    }
  };
  const search = async () => {
    setBusy(true);
    setError("");
    try {
      const [users, me] = await Promise.all([
        searchUsers(query),
        fetchUserProfile(),
      ]);
      setCandidates(
        users
          .filter((u) => u.id !== me.id)
          .map((u) => ({
            id: u.id,
            username: u.username,
            avatar_url: u.avatarUrl,
          })),
      );
    } catch {
      setError("検索できませんでした。");
    } finally {
      setBusy(false);
    }
  };
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
        {candidates.map((p) => {
          const known =
            social &&
            [...social.friends, ...social.incoming, ...social.outgoing].some(
              (f) => f.id === p.id,
            );
          const accepted = social?.friends.some((f) => f.id === p.id);
          return (
            <article className="panel row" key={p.id}>
              {person(p)}
              {accepted ? (
                <Link to={`/message/${p.id}`}>メッセージ</Link>
              ) : (
                <button
                  disabled={busy || !social || !!known}
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
