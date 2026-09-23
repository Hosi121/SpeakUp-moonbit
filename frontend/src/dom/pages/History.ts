import { createHistory, browserPorts } from "../../../../dist/presenter.js";
import type { ConversationDto } from "../../../../dist/shared.js";
import type { PageInput } from "../../../../dist/shell.js";
import { page } from "../layout";
import { mountFriends } from "./Social";
import { go } from "../../services/browser";
import {
  element as el,
  link,
  button,
  alert,
  message,
  text,
  visible,
  list,
  choices,
  type Dispose,
} from "../elements";
export function mount(
  host: HTMLElement,
  context: PageInput,
  tabs = false,
): () => void {
  const view = page(host, context, "record"),
    controller = createHistory(browserPorts());
  const error = alert(),
    empty = el("p", "", "終了した会話はまだありません。");
  if (!tabs) empty.append(button("通話へ", () => go("/sessionlist", false)));
  const more = button("さらに表示", controller.load_more),
    retry = button("再試行", controller.retry);
  const items = el("div", "stack"),
    history = el("div", "stack", error, retry, empty, items, more),
    friends = el("div");
  const rows = list<ConversationDto>(
    items,
    (c) => c.id,
    (c) => {
      const theme = el("h2"),
        people = el("p"),
        when = el("p"),
        open = tabs
          ? link("振り返りを開く", `/sessionrecord?conversation=${c.id}`)
          : button("振り返りを開く", () =>
              go(`/sessionrecord?conversation=${c.id}`, false),
            );
      return {
        element: el(
          "article",
          tabs ? "panel stack" : "panel stack compact",
          theme,
          people,
          when,
          open,
        ),
        update(call) {
          text(theme, call.theme);
          text(people, call.participants.map((p) => p.username).join(" / "));
          text(
            when,
            `${new Date(call.started_at).toLocaleString()}・${call.event_id ? `ラウンド ${call.round}` : "随時通話"}`,
          );
        },
      };
    },
  );
  view.scope.own(rows.dispose);
  const choice = choices(
    "表示する一覧",
    [
      { value: "history", label: "セッション履歴" },
      { value: "friends", label: "フレンド" },
    ],
    controller.set_tab,
  );
  view.body.append(el("h1", "", tabs ? "履歴とフレンド" : "会話の記録"));
  if (tabs) {
    view.body.append(choice.element);
    history.append(link("通話した相手にフレンド申請", "/friendrequest"));
  }
  view.body.append(history, friends);
  let disposeFriends: Dispose | undefined;
  view.scope.own(() => disposeFriends?.());
  view.scope.bind(controller, (s) => {
    message(error, s.error);
    visible(empty, s.loaded && !s.calls.length);
    rows.update(s.calls);
    visible(more, s.has_more && !s.error);
    more.disabled = s.loading;
    text(more, s.loading ? "読み込み中…" : "さらに表示");
    visible(retry, !!s.error);
    retry.disabled = s.loading;
    choice.update(s.tab);
    const show = tabs && s.tab === "friends";
    visible(history, !show);
    visible(friends, show);
    if (show && !disposeFriends)
      disposeFriends = mountFriends(friends, context);
    else if (!show && disposeFriends) {
      disposeFriends();
      disposeFriends = undefined;
    }
  });
  return view.dispose;
}
