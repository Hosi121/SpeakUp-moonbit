import {
  createCalls,
  browserPorts,
  type CallRow,
} from "../../../../dist/presenter.js";
import type { User } from "../../../../dist/shared.js";
import type { PageInput } from "../../../../dist/shell.js";
import { go } from "../../services/browser";
import { page } from "../layout";
import {
  element as el,
  input,
  link,
  form,
  button,
  submit,
  alert,
  message,
  value,
  text,
  visible,
  list,
} from "../elements";
export function mount(host: HTMLElement, context: PageInput): () => void {
  const view = page(host, context, "session"),
    controller = createCalls(browserPorts());
  const error = alert(),
    query = input("ユーザー名を検索", controller.set_query),
    search = submit("検索", "");
  const searchForm = form(controller.search, "row search-form");
  searchForm.append(query.element, search);
  const users = el("div", "stack"),
    calls = el("div", "stack");
  const refresh = button("一覧を更新", controller.refresh),
    empty = el(
      "p",
      "",
      "参加できる通話はありません。上の検索から相手を選んで通話できます。",
    );
  const inviteButtons = new Map<number, HTMLButtonElement>();
  const userRows = list<User>(
    users,
    (u) => u.id,
    (u) => {
      const name = el("p"),
        invite = button("", () => controller.invite(u.id), "primary");
      inviteButtons.set(u.id, invite);
      return {
        element: el("div", "row between", name, invite),
        update(user) {
          text(name, user.username);
          text(invite, `${user.username} と通話する`);
        },
        dispose() {
          inviteButtons.delete(u.id);
        },
      };
    },
  );
  const callRows = list<CallRow>(
    calls,
    (row) => row.call.id,
    () => {
      const theme = el("h2"),
        when = el("p"),
        partner = el("p");
      let path = "";
      const join = button("", () => go(path, false), "primary");
      return {
        element: el(
          "article",
          "panel stack compact",
          theme,
          when,
          partner,
          join,
        ),
        update(row) {
          text(theme, row.call.theme);
          text(
            when,
            row.call.event_id
              ? `${new Date(row.call.event_start).toLocaleString()}・ラウンド ${row.call.round}`
              : "随時通話",
          );
          text(partner, `相手：${row.partner}`);
          path = row.path;
          join.disabled = !row.can_join;
          text(join, row.active ? "再参加する" : "参加する");
        },
      };
    },
  );
  view.scope.own(userRows.dispose);
  view.scope.own(callRows.dispose);
  view.body.append(
    link("イベントへの参加登録", "/events"),
    el("h1", "", "通話"),
    error,
    el(
      "section",
      "panel stack",
      el("h2", "", "相手を選んで通話する"),
      el("p", "", "相手が一覧から参加すると通話が始まります。"),
      searchForm,
      users,
    ),
    el("div", "row between", el("h2", "", "参加できる通話"), refresh),
    empty,
    calls,
    button("会話の記録を見る", () => go("/conversation_history", false)),
  );
  view.scope.bind(controller, (s) => {
    message(error, s.error);
    value(query.input, s.query);
    search.disabled = !s.can_search;
    refresh.disabled = s.busy || s.refreshing;
    visible(empty, s.loaded && s.calls.length === 0);
    userRows.update(s.users);
    callRows.update(s.calls);
    for (const invite of inviteButtons.values()) invite.disabled = s.busy;
  });
  return view.dispose;
}
