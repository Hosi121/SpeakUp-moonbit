import { createAdmin, browserPorts } from "../../../../dist/presenter.js";
import type { User } from "../../../../dist/shared.js";
import type { PageInput } from "../../../../dist/shell.js";
import { page, dialog, avatar } from "../layout";
import { mountList } from "./Events";
import {
  element as el,
  input,
  form,
  button,
  submit,
  alert,
  status,
  message,
  visible,
  value,
  text,
  list,
  choices,
} from "../elements";
export function mount(host: HTMLElement, context: PageInput): () => void {
  const view = page(host, context),
    controller = createAdmin(browserPorts());
  const tabs = choices(
    "管理する項目",
    [
      { value: "events", label: "イベント管理" },
      { value: "users", label: "ユーザー情報" },
    ],
    (v) => controller.set_field("section", v),
  );
  const success = status(""),
    error = alert(),
    events = el("section", "stack"),
    users = el("section", "stack"),
    eventHost = el("div");
  const last = el("article", "panel stack");
  last.ariaLabel = "最後に作成したイベント";
  const lastDate = el("p"),
    lastTheme = el("p"),
    lastTopics = [el("li"), el("li"), el("li")];
  last.append(
    el("h2", "", "最後に作成したイベント"),
    lastDate,
    el("h3", "", "テーマ"),
    lastTheme,
    el("h3", "", "トピック"),
    el("ul", "", ...lastTopics),
  );
  const open = button("イベント作成", controller.open, "primary");
  open.setAttribute("aria-haspopup", "dialog");
  events.append(eventHost, open, last);
  const query = input(
      "ユーザー名で検索",
      (v) => controller.set_field("query", v),
      { required: true },
    ),
    search = submit("検索", ""),
    searchForm = form(controller.search, "row search-form");
  searchForm.append(query.element, search);
  const searching = status("検索中…"),
    empty = el(
      "p",
      "",
      "ユーザーが見つかりません。別の名前で検索してください。",
    ),
    items = el("ul", "plain-list stack");
  users.append(
    el("h2", "", "ユーザー情報検索"),
    searchForm,
    searching,
    empty,
    items,
  );
  const rows = list<User>(
    items,
    (u) => u.id,
    () => {
      const image = avatar(),
        name = el("h3"),
        email = el("p"),
        date = el("small");
      return {
        element: el(
          "li",
          "panel row",
          image.element,
          el("div", "grow", name, email, date),
        ),
        update(u) {
          image.update(u.avatarUrl, u.username);
          text(name, u.username);
          text(email, `メール: ${u.email}`);
          text(date, `登録日: ${new Date(u.createdAt).toLocaleString()}`);
        },
      };
    },
  );
  view.scope.own(rows.dispose);
  const modal = dialog("イベント作成", controller.close);
  view.scope.own(modal.dispose);
  const createForm = form(controller.create),
    when = input("予定日時", (v) => controller.set_field("dateTime", v), {
      type: "datetime-local",
      step: "1",
      required: true,
    }),
    theme = input("テーマ", (v) => controller.set_field("theme", v), {
      required: true,
    });
  const generate = button("AIによる生成", controller.generate),
    topics = [0, 1, 2].map((i) =>
      input(`トピック ${i + 1}`, (v) => controller.set_topic(i, v)),
    ),
    dialogError = alert(),
    cancel = button("キャンセル", controller.close),
    create = submit("作成");
  createForm.append(
    when.element,
    theme.element,
    generate,
    ...topics.map((t) => t.element),
    dialogError,
    el("div", "row", cancel, create),
  );
  modal.body.append(createForm);
  view.body.append(
    el("h1", "", "管理"),
    tabs.element,
    success,
    error,
    events,
    users,
    modal.element,
  );
  let eventList: ReturnType<typeof mountList> | undefined,
    created = 0;
  view.scope.own(() => eventList?.dispose());
  view.scope.bind(controller, (s) => {
    tabs.update(s.section);
    message(success, s.success);
    message(error, s.error);
    visible(events, s.section === "events");
    visible(users, s.section !== "events");
    if (s.section === "events") {
      if (!eventList) {
        eventList = mountList(eventHost, context, true);
        created = s.created[0]?.id ?? 0;
      } else if (s.created[0] && s.created[0].id !== created) {
        created = s.created[0].id;
        eventList.refresh();
      }
    } else if (eventList) {
      eventList.dispose();
      eventList = undefined;
    }
    const latest = s.created[0];
    visible(last, !!latest);
    if (latest) {
      text(
        lastDate,
        `予定日時: ${new Date(latest.eventStart).toLocaleString()}`,
      );
      text(lastTheme, latest.theme.themeText);
      [latest.theme.topic1, latest.theme.topic2, latest.theme.topic3].forEach(
        (t, i) => text(lastTopics[i], t || "(未入力)"),
      );
    }
    value(query.input, s.query);
    search.disabled = s.busy;
    visible(searching, s.busy);
    visible(empty, s.searched && !s.users.length);
    rows.update(s.users);
    value(when.input, s.dateTime);
    value(theme.input, s.theme);
    topics.forEach((t, i) => value(t.input, s.topics[i]));
    for (const field of [
      when.input,
      theme.input,
      ...topics.map((t) => t.input),
      generate,
      cancel,
      create,
    ])
      field.disabled = s.busy;
    message(dialogError, s.dialogError);
    modal.update(s.open);
  });
  return view.dispose;
}
