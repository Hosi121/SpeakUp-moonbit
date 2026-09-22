import { useEffect, useState } from "react";
import type { StatsDto } from "../../../../dist/shared.js";
import { fetchStats } from "../../services/features";
import { useActivity } from "../../services/activity";
import TopSection from "../utils/TopSection";
import { BottomNavigationTemplate } from "../templates/BottomNavigationTemplate";
import { Icon } from "../ui/Icon";
export function Stats() {
  const [stats, setStats] = useState<StatsDto | null>(null);
  const [error, setError] = useState("");
  const { revision } = useActivity();
  useEffect(() => {
    let disposed = false;
    void fetchStats()
      .then((value) => {
        if (!disposed) {
          setStats(value);
          setError("");
        }
      })
      .catch(() => {
        if (!disposed) setError("参加データを取得できませんでした。");
      });
    return () => {
      disposed = true;
    };
  }, [revision]);
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
