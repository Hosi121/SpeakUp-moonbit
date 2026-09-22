import {
  createSocial,
  browserPorts,
  type CandidateView,
} from "../../../../dist/presenter.js";
import type { FriendSummaryDto } from "../../../../dist/shared.js";
import type { PageInput } from "../../../../dist/shell.js";
import { page, avatar } from "../layout";
import {
  element as el,
  input,
  link,
  form,
  button,
  submit,
  alert,
  status,
  message,
  value,
  text,
  visible,
  list,
  ViewScope,
} from "../elements";

export function mountFriends(
  host: HTMLElement,
  context: PageInput,
): () => void {
  const scope = new ViewScope(context.failed),
    controller = createSocial(browserPorts(), false);
  const root = el("section", "stack");
  root.ariaLabel = "フレンド一覧";
  const error = alert(),
    empty = el(
      "p",
      "",
      "フレンドはまだいません。",
      link("通話へ", "/sessionlist"),
    ),
    items = el("ul", "plain-list stack");
  const rows = list<FriendSummaryDto>(
    items,
    (p) => p.id,
    () => {
      const image = avatar(),
        name = el("strong", "grow"),
        chat = link("メッセージ", "/", "button");
      return {
        element: el("li", "panel row", image.element, name, chat),
        update(p) {
          image.update(p.avatar_url, p.username);
          text(name, p.username);
          chat.href = `/message/${p.id}`;
        },
      };
    },
  );
  scope.own(rows.dispose);
  root.append(
    link("フレンド申請を確認・送信", "/friendrequest"),
    error,
    empty,
    items,
  );
  host.append(root);
  scope.bind(controller, (s) => {
    message(error, s.error);
    visible(empty, s.loaded && s.social.friends.length === 0);
    rows.update(s.social.friends);
  });
  return () => {
    scope.dispose();
    root.remove();
  };
}
export function mount(host: HTMLElement, context: PageInput): () => void {
  const view = page(host, context),
    controller = createSocial(browserPorts(), true);
  const error = alert(),
    loading = status("読み込み中…");
  const incoming = el("section", "stack", el("h2", "", "届いた申請"));
  incoming.ariaLabel = "届いた申請";
  const outgoing = el("section", "stack", el("h2", "", "送った申請"));
  outgoing.ariaLabel = "送った申請";
  const noIncoming = el("p", "", "届いた申請はありません。"),
    noOutgoing = el("p", "", "送った申請はありません。");
  const inRows = el("div", "stack"),
    outRows = el("div", "stack");
  incoming.append(noIncoming, inRows);
  outgoing.append(noOutgoing, outRows);
  const operations = new Set<HTMLButtonElement>();
  const relations = (target: HTMLElement, received: boolean) =>
    list<FriendSummaryDto>(
      target,
      (p) => p.id,
      (p) => {
        const image = avatar(),
          name = el("strong"),
          person = el("div", "row", image.element, name);
        const actions = received
          ? [
              ["承認", "accept"],
              ["見送る", "reject"],
            ]
          : [["取り消す", "cancel"]];
        const buttons = actions.map(([label, action]) => {
          const b = button(label, () => controller.change(p.id, action));
          operations.add(b);
          return b;
        });
        return {
          element: el(
            "article",
            received ? "panel stack" : "panel row",
            person,
            el("div", "row", ...buttons),
          ),
          update(person) {
            image.update(person.avatar_url, person.username);
            text(name, person.username);
          },
          dispose() {
            for (const b of buttons) operations.delete(b);
          },
        };
      },
    );
  const received = relations(inRows, true),
    sent = relations(outRows, false);
  view.scope.own(received.dispose);
  view.scope.own(sent.dispose);
  const query = input("ユーザー名で検索", controller.set_query, {
      required: true,
      maxLength: 255,
    }),
    search = submit("検索", "");
  const searchForm = form(controller.search, "row search-form");
  searchForm.append(query.element, search);
  const noCandidates = el("p", "", "候補はいません。名前で検索できます。"),
    items = el("div", "stack");
  const candidates = list<CandidateView>(
    items,
    (p) => p.person.id,
    (row) => {
      const image = avatar(),
        name = el("strong"),
        chat = link("メッセージ", `/message/${row.person.id}`),
        request = button("フレンド申請", () =>
          controller.change(row.person.id, "request"),
        );
      return {
        element: el(
          "article",
          "panel row",
          el("div", "row", image.element, name),
          chat,
          request,
        ),
        update(v) {
          image.update(v.person.avatar_url, v.person.username);
          text(name, v.person.username);
          visible(chat, v.accepted);
          visible(request, !v.accepted);
          request.disabled = !v.can_request;
          text(request, v.known ? "申請中" : "フレンド申請");
        },
      };
    },
  );
  view.scope.own(candidates.dispose);
  view.body.append(
    el("h1", "", "フレンド申請"),
    el("p", "", "申請を相手が承認すると、メッセージを送れます。"),
    error,
    loading,
    incoming,
    outgoing,
    el(
      "section",
      "stack",
      el("h2", "", "通話した相手・ユーザー検索"),
      searchForm,
      noCandidates,
      items,
    ),
    link("履歴とフレンドへ", "/session_history_friendlist"),
    link("ホームへ", "/home"),
  );
  view.scope.bind(controller, (s) => {
    message(error, s.error);
    visible(loading, !s.loaded && !s.error);
    value(query.input, s.query);
    search.disabled = s.busy;
    visible(noIncoming, s.loaded && !s.social.incoming.length);
    visible(noOutgoing, s.loaded && !s.social.outgoing.length);
    visible(noCandidates, !s.candidates.length);
    received.update(s.social.incoming);
    sent.update(s.social.outgoing);
    candidates.update(s.candidates);
    for (const b of operations) b.disabled = s.busy;
  });
  return view.dispose;
}
