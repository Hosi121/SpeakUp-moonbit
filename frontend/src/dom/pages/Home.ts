import { createHome, browserPorts } from "../../../../dist/presenter.js";
import type { PageInput } from "../../../../dist/shell.js";
import homeLogo from "../../assets/homeLogo.svg";
import { page, tile } from "../layout";
import {
  element as el,
  link,
  alert,
  status,
  message,
  visible,
  text,
  list,
} from "../elements";
function wave(flipped: boolean) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.classList.add(flipped ? "waves-flipped" : "waves");
  svg.setAttribute("viewBox", "0 0 150 28");
  svg.setAttribute("preserveAspectRatio", "none");
  svg.setAttribute("aria-hidden", "true");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", "M0 15Q38 0 75 15T150 15V28H0Z");
  path.setAttribute("fill", "white");
  svg.append(path);
  return svg;
}
export function mount(host: HTMLElement, context: PageInput): () => void {
  const view = page(host, context, "home"),
    controller = createHome(browserPorts());
  const logo = el("img");
  logo.src = homeLogo;
  logo.alt = "";
  const panel = el(
    "section",
    "panel stack center",
    el("h1", "", "直近の参加予定"),
    link("イベントを探して参加する", "/events"),
  );
  const loading = status("読み込み中…"),
    error = alert();
  const when = el("strong"),
    theme = el("h2"),
    topics = el("ul", "plain-list stack compact");
  const event = el(
    "div",
    "stack",
    el("p", "accent numeric", when),
    theme,
    topics,
  );
  const empty = el(
    "p",
    "",
    "予定されているイベントはありません。",
    link("通話を始める", "/sessionlist"),
  );
  panel.append(loading, error, event, empty);
  const topicRows = list<string>(
    topics,
    (v) => v,
    () => {
      const node = el("li");
      return {
        element: node,
        update(v) {
          text(node, v);
        },
      };
    },
  );
  view.scope.own(topicRows.dispose);
  view.body.append(
    el("div", "", wave(false), el("div", "home-brand", logo), wave(true)),
    panel,
    el(
      "div",
      "grid",
      tile("記録", "/record", "book"),
      tile("セッション", "/sessionlist", "mic"),
    ),
  );
  view.scope.bind(controller, (s) => {
    visible(loading, s.loading);
    message(error, s.error);
    const next = s.events[0];
    visible(event, !s.loading && !s.error && !!next);
    visible(empty, !s.loading && !s.error && !next);
    if (next) {
      text(
        when,
        new Date(next.eventStart).toLocaleString("ja-JP", {
          month: "long",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        }),
      );
      text(theme, `テーマ: ${next.theme.themeText}`);
      topicRows.update(
        [next.theme.topic1, next.theme.topic2, next.theme.topic3]
          .filter(Boolean)
          .map((v, i) => `トピック${i + 1}: ${v}`),
      );
    }
  });
  return view.dispose;
}
