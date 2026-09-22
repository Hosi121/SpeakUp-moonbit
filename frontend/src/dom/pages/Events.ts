import {
  createEvents,
  createEventCard,
  browserPorts,
  type EventsController,
  type RosterRow,
} from "../../../../dist/presenter.js";
import type { EventOverviewDto } from "../../../../dist/shared.js";
import type { PageInput } from "../../../../dist/shell.js";
import { page } from "../layout";
import {
  element as el,
  link,
  button,
  alert,
  status,
  message,
  visible,
  text,
  list,
  ViewScope,
} from "../elements";
function card(
  initial: EventOverviewDto,
  context: PageInput,
  owner: EventsController,
  admin: boolean,
) {
  const controller = createEventCard(browserPorts(), initial, admin, owner),
    scope = new ViewScope(context.failed);
  const heading = el("h2"),
    date = el("p"),
    summary = el("p"),
    topics = el("div", "stack compact"),
    root = el("article", "panel stack", heading, date, summary, topics);
  const topicRows = list<{ id: number; text: string }>(
    topics,
    (t) => t.id,
    () => {
      const node = el("p");
      return {
        element: node,
        update(t) {
          text(node, t.text);
        },
      };
    },
  );
  scope.own(topicRows.dispose);
  const fields = el("fieldset", "", el("legend", "", "参加するラウンド"));
  const rounds = [0, 1, 2].map((index) => {
    const input = el("input");
    input.type = "checkbox";
    input.addEventListener("change", () =>
      controller.set_round(index, input.checked),
    );
    fields.append(el("label", "radio-option", input, `ラウンド ${index + 1}`));
    return input;
  });
  const save = button("参加予定を保存", () => controller.act("register")),
    frozen = el(
      "p",
      "",
      "マッチングを開始したため、参加するラウンドは変更できません。",
    );
  const rosterButton = button("参加者を確認", () => controller.act("roster")),
    match = button("マッチングする", () => controller.confirm(true)),
    publish = button("確定して公開", () => controller.act("match")),
    back = button("戻る", () => controller.confirm(false));
  const confirmation = el(
    "div",
    "stack",
    el(
      "p",
      "",
      "参加者を確定し、3 ラウンドの通話相手を公開します。人数が奇数のラウンドでは待機する人が出ます。",
    ),
    el("div", "row", publish, back),
  );
  const management = el("div", "stack", rosterButton, match, confirmation),
    roster = el("ul", "plain-list stack"),
    error = alert(),
    success = status("");
  const rosterRows = list<RosterRow>(
    roster,
    (m) => m.id,
    () => {
      const name = el("strong"),
        description = el("span");
      return {
        element: el("li", "", name, description),
        update(m) {
          text(name, m.username);
          text(description, `：${m.status}`);
        },
      };
    },
  );
  scope.own(rosterRows.dispose);
  root.append(fields, save, frozen, management, roster, success, error);
  visible(management, admin);
  scope.bind(controller, (s) => {
    const event = s.value.event;
    root.ariaLabel = event.theme.theme_text;
    text(heading, event.theme.theme_text);
    text(
      date,
      `${new Date(event.event_start).toLocaleString()} ～ ${new Date(event.event_end).toLocaleTimeString()}`,
    );
    text(
      summary,
      `登録 ${s.value.registered_count} 人・${s.value.matching_state === "published" ? "相手を公開済み" : s.frozen ? "参加者を確定済み" : "参加受付中"}`,
    );
    topicRows.update(
      [event.theme.topic1, event.theme.topic2, event.theme.topic3]
        .filter(Boolean)
        .map((text, id) => ({ text, id })),
    );
    fields.disabled = s.busy || s.frozen;
    for (let i = 0; i < rounds.length; i++) rounds[i].checked = s.rounds[i];
    visible(save, !s.frozen);
    visible(frozen, s.frozen);
    for (const b of [save, rosterButton, match, publish, back])
      b.disabled = s.busy;
    visible(match, s.value.matching_state !== "published" && !s.confirm);
    visible(confirmation, s.value.matching_state !== "published" && s.confirm);
    rosterRows.update(s.roster);
    visible(roster, admin && !!s.roster.length);
    message(success, s.success);
    message(error, s.error);
  });
  return { element: root, update: controller.update, dispose: scope.dispose };
}
export function mountList(
  host: HTMLElement,
  context: PageInput,
  admin = false,
) {
  const scope = new ViewScope(context.failed),
    controller = createEvents(browserPorts());
  const root = el("section", "stack");
  root.ariaLabel = "イベント一覧";
  const error = alert(),
    empty = el("p", "", "イベントはありません。"),
    items = el("div", "stack");
  const rows = list<EventOverviewDto>(
    items,
    (e) => e.event.id,
    (e) => card(e, context, controller, admin),
  );
  scope.own(rows.dispose);
  root.append(
    button("イベント一覧を更新", controller.refresh),
    error,
    empty,
    items,
  );
  host.append(root);
  scope.bind(controller, (s) => {
    message(error, s.error);
    visible(empty, s.loaded && !s.events.length);
    rows.update(s.events);
  });
  return {
    refresh: controller.refresh,
    dispose() {
      scope.dispose();
      root.remove();
    },
  };
}
export function mount(host: HTMLElement, context: PageInput): () => void {
  const view = page(host, context, "other");
  view.body.append(
    el("h1", "", "イベント"),
    el(
      "p",
      "",
      "参加するラウンドを選んで登録してください。相手が決まると通知が届きます。",
    ),
  );
  view.scope.own(mountList(view.body, context).dispose);
  view.body.append(link("通話一覧へ", "/sessionlist"));
  return view.dispose;
}
