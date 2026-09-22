import { useEffect } from "react";
import {
  createEvents,
  createEventCard,
  browserPorts,
  type EventsController,
} from "../../../../dist/presenter.js";
import { useController, useOwnedController } from "../../services/controller";
import type { EventOverviewDto } from "../../../../dist/shared.js";
import { Link } from "../../navigation/links";
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
  const controller = useOwnedController(() => createEvents(browserPorts()));
  const { events, error, loaded } = useController(controller);
  useEffect(() => {
    if (refreshKey) controller.refresh();
  }, [controller, refreshKey]);
  const load = controller.refresh;
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
          owner={controller}
        />
      ))}
    </section>
  );
}
function EventCard({
  value,
  admin,
  owner,
}: {
  value: EventOverviewDto;
  admin: boolean;
  owner: EventsController;
}) {
  const controller = useOwnedController(() =>
    createEventCard(browserPorts(), value, admin, owner),
  );
  const { rounds, roster, busy, error, success, confirm, frozen } =
    useController(controller);
  useEffect(() => controller.update(value), [controller, value]);
  const act = controller.act;
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
              checked={rounds[round - 1]}
              onChange={(e) =>
                controller.set_round(round - 1, e.target.checked)
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
                  <button
                    disabled={busy}
                    onClick={() => controller.confirm(false)}
                  >
                    戻る
                  </button>
                </div>
              </div>
            ) : (
              <button disabled={busy} onClick={() => controller.confirm(true)}>
                マッチングする
              </button>
            ))}
          {roster.length > 0 && (
            <ul className="plain-list stack">
              {roster.map((m) => (
                <li key={m.id}>
                  <strong>{m.username}</strong>：{m.status}
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
