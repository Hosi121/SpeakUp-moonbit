import { useCallback, useEffect, useRef, useState } from "react";
import { Input } from "../ui/Field";
import { useNavigate, Link } from "react-router-dom";
import {
  conversationClock,
  conversationPartner,
  type ConversationDto,
} from "../../../../dist/shared.js";
import {
  createDirectConversation,
  fetchConversations,
} from "../../services/conversationService";
import { fetchUserProfile, searchUsers } from "../../services/userService";
import type { User, UserProfile } from "../../types/types";
import { BottomNavigationTemplate } from "../templates/BottomNavigationTemplate";
import { useActivity } from "../../services/activity";
import TopSection from "../utils/TopSection";

export const SessionList = () => {
  const navigate = useNavigate();
  const { revision, clockOffset } = useActivity();
  const [calls, setCalls] = useState<ConversationDto[]>([]);
  const [me, setMe] = useState<UserProfile | null>(null);
  const [query, setQuery] = useState("");
  const [users, setUsers] = useState<User[]>([]);
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const requestIds = useRef(new Map<number, string>());
  const refreshId = useRef(0);
  const refresh = useCallback(async () => {
    const id = ++refreshId.current;
    setRefreshing(true);
    try {
      const [next, profile] = await Promise.all([
        fetchConversations(),
        fetchUserProfile(),
      ]);
      if (id === refreshId.current) {
        setCalls(next);
        setMe(profile);
        setLoaded(true);
      }
    } catch (error) {
      if (id === refreshId.current) {
        setError(
          error instanceof Error ? error.message : "一覧を取得できませんでした",
        );
      }
    } finally {
      if (id === refreshId.current) setRefreshing(false);
    }
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh, revision]);
  const search = async () => {
    if (!query.trim()) return;
    setBusy(true);
    setError("");
    try {
      setUsers(
        (await searchUsers(query.trim())).filter((user) => user.id !== me?.id),
      );
    } catch (error) {
      setError(error instanceof Error ? error.message : "検索できませんでした");
    } finally {
      setBusy(false);
    }
  };
  const invite = async (user: User) => {
    setBusy(true);
    setError("");
    const key = requestIds.current.get(user.id) ?? crypto.randomUUID();
    requestIds.current.set(user.id, key);
    try {
      const conversation = await createDirectConversation(user.id, key);
      navigate(`/session?conversation=${conversation.id}`);
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "通話を作成できませんでした",
      );
    } finally {
      setBusy(false);
    }
  };
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
            <button type="submit" disabled={busy || !me || !query.trim()}>
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
                onClick={() => void invite(user)}
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
        {calls.map((call) => {
          const clock = conversationClock(call, Date.now() + clockOffset);
          const partner = me ? conversationPartner(call, me.id).username : "";
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
                disabled={!clock.can_join}
                onClick={() => navigate(`/session?conversation=${call.id}`)}
              >
                {clock.phase === "active" ? "再参加する" : "参加する"}
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
