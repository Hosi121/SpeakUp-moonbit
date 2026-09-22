import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type {
  EventOverviewDto,
  EventRosterDto,
} from "../../../../dist/shared.js";
import {
  fetchEventOverviews,
  fetchRoster,
  registerEvent,
  matchEvent,
} from "../../services/features";
import TopSection from "../utils/TopSection";
import { BottomNavigationTemplate } from "../templates/BottomNavigationTemplate";
export function Events() {
  return (
    <BottomNavigationTemplate value="other">
      <div className="page stack">
        <TopSection />
        <h1>イベント</h1>
        <p>
          参加するラウンドを選んで登録してください。相手が決まると通知が届きます。
        </p>
        <EventList />
        <Link to="/sessionlist">通話一覧へ</Link>
      </div>
    </BottomNavigationTemplate>
  );
}
export function EventList({
  admin = false,
  refreshKey = 0,
}: {
  admin?: boolean;
  refreshKey?: number;
}) {
  const [events, setEvents] = useState<EventOverviewDto[]>([]);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);
  const load = useCallback(async () => {
    try {
      setEvents(await fetchEventOverviews());
      setLoaded(true);
      setError("");
    } catch {
      setError("イベントを取得できませんでした。");
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load, refreshKey]);
  return (
    <section className="stack" aria-label="イベント一覧">
      <button onClick={() => void load()}>イベント一覧を更新</button>
      {error && <p role="alert">{error}</p>}
      {loaded && events.length === 0 && <p>イベントはありません。</p>}
      {events.map((event) => (
        <EventCard
          key={event.event.id}
          value={event}
          admin={admin}
          refresh={load}
        />
      ))}
    </section>
  );
}
function EventCard({
  value,
  admin,
  refresh,
}: {
  value: EventOverviewDto;
  admin: boolean;
  refresh: () => Promise<void>;
}) {
  const [bit, setBit] = useState(value.participates_bit);
  const [roster, setRoster] = useState<EventRosterDto | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [confirm, setConfirm] = useState(false);
  useEffect(() => {
    setBit(value.participates_bit);
  }, [value.participates_bit]);
  const act = async (action: "register" | "roster" | "match") => {
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      if (action === "register") {
        await registerEvent(value.event.id, bit);
        setSuccess("参加予定を保存しました。");
      }
      if (action === "match") {
        await matchEvent(value.event.id);
        setConfirm(false);
        setSuccess("通話相手を公開しました。");
      }
      if (action !== "register") setRoster(await fetchRoster(value.event.id));
      if (action !== "roster") await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "更新できませんでした。");
    } finally {
      setBusy(false);
    }
  };
  const frozen = value.matching_state !== "open";
  return (
    <article className="panel stack" aria-label={value.event.theme.theme_text}>
      <h2>{value.event.theme.theme_text}</h2>
      <p>
        {new Date(value.event.event_start).toLocaleString()} ～{" "}
        {new Date(value.event.event_end).toLocaleTimeString()}
      </p>
      <p>
        登録 {value.registered_count} 人・
        {value.matching_state === "published"
          ? "相手を公開済み"
          : frozen
            ? "参加者を確定済み"
            : "参加受付中"}
      </p>
      {[
        value.event.theme.topic1,
        value.event.theme.topic2,
        value.event.theme.topic3,
      ]
        .filter(Boolean)
        .map((topic, i) => (
          <p key={i}>{topic}</p>
        ))}
      <fieldset disabled={busy || frozen}>
        <legend>参加するラウンド</legend>
        {[1, 2, 3].map((round) => (
          <label className="radio-option" key={round}>
            <input
              type="checkbox"
              checked={!!(bit & (1 << (round - 1)))}
              onChange={(e) =>
                setBit((current) =>
                  e.target.checked
                    ? current | (1 << (round - 1))
                    : current & ~(1 << (round - 1)),
                )
              }
            />
            ラウンド {round}
          </label>
        ))}
      </fieldset>
      {!frozen && (
        <button disabled={busy} onClick={() => void act("register")}>
          参加予定を保存
        </button>
      )}
      {frozen && (
        <p>マッチングを開始したため、参加するラウンドは変更できません。</p>
      )}
      {admin && (
        <>
          <button disabled={busy} onClick={() => void act("roster")}>
            参加者を確認
          </button>
          {value.matching_state !== "published" &&
            (confirm ? (
              <div className="stack">
                <p>
                  参加者を確定し、3
                  ラウンドの通話相手を公開します。人数が奇数のラウンドでは待機する人が出ます。
                </p>
                <div className="row">
                  <button disabled={busy} onClick={() => void act("match")}>
                    確定して公開
                  </button>
                  <button disabled={busy} onClick={() => setConfirm(false)}>
                    戻る
                  </button>
                </div>
              </div>
            ) : (
              <button disabled={busy} onClick={() => setConfirm(true)}>
                マッチングする
              </button>
            ))}
          {roster && (
            <ul className="plain-list stack">
              {roster.members.map((m) => (
                <li key={m.user.id}>
                  <strong>{m.user.username}</strong>：
                  {[1, 2, 3]
                    .filter((r) => m.participates_bit & (1 << (r - 1)))
                    .map(
                      (r) =>
                        `R${r} ${m.matched_bit & (1 << (r - 1)) ? "相手決定" : value.matching_state === "published" ? "待機" : "登録"}`,
                    )
                    .join(" / ") || "参加なし"}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      {success && <p role="status">{success}</p>}
      {error && <p role="alert">{error}</p>}
    </article>
  );
}
