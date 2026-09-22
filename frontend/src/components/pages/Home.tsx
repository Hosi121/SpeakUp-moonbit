import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { BottomNavigationTemplate } from "../templates/BottomNavigationTemplate";
import TopSection from "../utils/TopSection";
import TopWaves from "../utils/TopWaves";
import HomeLogo from "../../assets/homeLogo";
import { IconButton } from "../utils/IconButton";
import { Icon } from "../ui/Icon";
import { mapEvent, type EventOverviewDto } from "../../../../dist/shared.js";
import { fetchEventOverviews } from "../../services/features";

export function Home() {
  const [events, setEvents] = useState<EventOverviewDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    void fetchEventOverviews()
      .then(setEvents)
      .catch(() => setError("データの取得に失敗しました。"))
      .finally(() => setLoading(false));
  }, []);
  const upcoming = events
    .filter(
      (item) =>
        item.participates_bit > 0 &&
        new Date(item.event.event_end).getTime() > Date.now(),
    )
    .sort((a, b) => a.event.event_start.localeCompare(b.event.event_start))[0];
  const next = upcoming ? mapEvent(upcoming.event) : undefined;
  return (
    <BottomNavigationTemplate value="home">
      <div className="page stack">
        <TopSection />
        <div>
          <TopWaves isFlipped={false} />
          <div className="home-brand">
            <HomeLogo />
          </div>
          <TopWaves isFlipped />
        </div>
        <section className="panel stack center">
          <h1>直近の参加予定</h1>
          <Link to="/events">イベントを探して参加する</Link>
          {loading ? (
            <p role="status">読み込み中…</p>
          ) : error ? (
            <p role="alert">{error}</p>
          ) : next ? (
            <>
              <p className="accent numeric">
                <strong>
                  {new Date(next.eventStart).toLocaleString("ja-JP", {
                    month: "long",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </strong>
              </p>
              <h2>テーマ: {next.theme.themeText}</h2>
              <ul className="plain-list stack compact">
                {[next.theme.topic1, next.theme.topic2, next.theme.topic3]
                  .filter(Boolean)
                  .map((topic, index) => (
                    <li key={index}>
                      トピック{index + 1}: {topic}
                    </li>
                  ))}
              </ul>
            </>
          ) : (
            <p>
              予定されているイベントはありません。
              <Link to="/sessionlist">通話を始める</Link>
            </p>
          )}
        </section>
        <div className="grid">
          <IconButton
            icon={<Icon name="book" size={48} />}
            text="記録"
            url="record"
          />
          <IconButton
            icon={<Icon name="mic" size={48} />}
            text="セッション"
            url="sessionlist"
          />
        </div>
      </div>
    </BottomNavigationTemplate>
  );
}
