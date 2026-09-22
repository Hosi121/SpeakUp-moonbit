import { useMemo } from "react";
import { createHome, browserPorts } from "../../../../dist/presenter.js";
import { useController } from "../../services/controller";
import { Link } from "../../navigation/links";
import { BottomNavigationTemplate } from "../templates/BottomNavigationTemplate";
import TopSection from "../utils/TopSection";
import TopWaves from "../utils/TopWaves";
import HomeLogo from "../../assets/homeLogo";
import { IconButton } from "../utils/IconButton";
import { Icon } from "../ui/Icon";

export function Home() {
  const controller = useMemo(() => createHome(browserPorts()), []);
  const { events, loading, error } = useController(controller);
  const next = events[0];
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
