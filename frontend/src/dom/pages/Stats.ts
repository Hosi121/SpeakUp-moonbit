import { createStats, browserPorts } from "../../../../dist/presenter.js";
import type { AchievementDto } from "../../../../dist/shared.js";
import type { PageInput } from "../../../../dist/shell.js";
import { page } from "../layout";
import { icon } from "../icons";
import {
  element as el,
  alert,
  status,
  message,
  text,
  visible,
  list,
} from "../elements";
export function mount(host: HTMLElement, context: PageInput): () => void {
  const view = page(host, context, "other"),
    controller = createStats(browserPorts());
  const error = alert(),
    loading = status("読み込み中…"),
    content = el("div", "stack"),
    stats = el("dl", "panel grid center numeric"),
    achievements = el("ul", "plain-list stack");
  const rows = (
    [
      ["total_calls", "終了した通話"],
      ["event_calls", "イベント通話"],
      ["direct_calls", "随時通話"],
      ["partners", "話した相手"],
      ["minutes", "通話時間（分）"],
      ["reflections", "振り返り"],
    ] as const
  ).map(([key, label]) => {
    const count = el("dd", "accent");
    stats.append(el("div", "", el("dt", "", label), count));
    return { key, count };
  });
  const items = list<AchievementDto>(
    achievements,
    (a) => a.code,
    () => {
      const title = el("strong"),
        progress = el("p");
      return {
        element: el(
          "li",
          "panel row",
          icon("trophy"),
          el("div", "", title, progress),
        ),
        update(a) {
          text(title, a.title);
          text(progress, a.earned ? "達成済み" : `${a.progress} / ${a.target}`);
        },
      };
    },
  );
  view.scope.own(items.dispose);
  content.append(stats, el("h2", "", "実績"), achievements);
  view.body.append(el("h1", "", "参加データ"), error, loading, content);
  view.scope.bind(controller, (s) => {
    message(error, s.error);
    const data = s.items[0];
    visible(loading, !data && !s.error);
    visible(content, !!data);
    if (data) {
      for (const row of rows) text(row.count, data[row.key]);
      items.update(data.achievements);
    }
  });
  return view.dispose;
}
