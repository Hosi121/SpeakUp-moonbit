import { useMemo } from "react";
import { createStats, browserPorts } from "../../../../dist/presenter.js";
import { useController } from "../../services/controller";
import TopSection from "../utils/TopSection";
import { BottomNavigationTemplate } from "../templates/BottomNavigationTemplate";
import { Icon } from "../ui/Icon";
export function Stats() {
  const controller = useMemo(() => createStats(browserPorts()), []);
  const { items, error } = useController(controller);
  const stats = items[0];
  return (
    <BottomNavigationTemplate value="other">
      <div className="page stack">
        <TopSection />
        <h1>参加データ</h1>
        {error && <p role="alert">{error}</p>}
        {!stats && !error && <p role="status">読み込み中…</p>}
        {stats && (
          <>
            <dl className="panel grid center numeric">
              {[
                [stats.total_calls, "終了した通話"],
                [stats.event_calls, "イベント通話"],
                [stats.direct_calls, "随時通話"],
                [stats.partners, "話した相手"],
                [stats.minutes, "通話時間（分）"],
                [stats.reflections, "振り返り"],
              ].map(([value, label]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd className="accent">{value}</dd>
                </div>
              ))}
            </dl>
            <h2>実績</h2>
            <ul className="plain-list stack">
              {stats.achievements.map((a) => (
                <li className="panel row" key={a.code}>
                  <Icon name="trophy" />
                  <div>
                    <strong>{a.title}</strong>
                    <p>
                      {a.earned ? "達成済み" : `${a.progress} / ${a.target}`}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </BottomNavigationTemplate>
  );
}
