import {
  createSession,
  browserPorts,
  type AssistantLine,
} from "../../../../dist/presenter.js";
import type { PageInput } from "../../../../dist/shell.js";
import { go } from "../../services/browser";
import { mediaPorts } from "../../services/media";
import { realtimePorts } from "../../services/realtime";
import { avatar, dialog } from "../layout";
import { icon } from "../icons";
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
  ViewScope,
} from "../elements";
export function mount(host: HTMLElement, context: PageInput): () => void {
  const audio = el("audio", "call-audio");
  audio.autoplay = true;
  audio.controls = true;
  audio.ariaLabel = "相手の音声";
  const controller = createSession(
      browserPorts(),
      realtimePorts(),
      mediaPorts(() => audio),
      context.conversation,
    ),
    scope = new ViewScope(context.failed);
  if (!controller.get_snapshot().id) {
    go("/sessionlist", true);
    return () => {};
  }
  const root = el("div", "app-shell"),
    body = el("main", "page call-page stack"),
    heading = el("h1", "center"),
    participants = el("div", "participants");
  const people = ["あなた", "通話相手"].map((label) => {
    const image = avatar(true),
      name = el("h2"),
      node = el(
        "div",
        "panel participant",
        image.element,
        name,
        el("small", "", label),
      );
    participants.append(node);
    return { image, name, node };
  });
  const clock = status("");
  clock.className = "numeric";
  const finish = button("通話を終了して記録する", controller.finish, "primary"),
    cancel = button("通話の予定を取り消す", controller.cancel),
    retry = button("再接続", controller.retry),
    error = alert();
  const memo = dialog("メモ", () => controller.open_memo(false), true),
    assistant = dialog(
      "アシスタント",
      () => controller.open_assistant(false),
      true,
    ),
    topic = dialog("まだ話していないトピックはありますか？", () =>
      controller.open_topic(false),
    );
  for (const modal of [memo, assistant, topic]) scope.own(modal.dispose);
  const tab = choices(
      "表示するメモ",
      [
        { value: "1", label: "持ち込みメモ" },
        { value: "2", label: "ワードリスト" },
      ],
      controller.set_tab,
    ),
    memoText = el("p", "pre-wrap");
  memo.body.append(el("div", "stack", tab.element, memoText));
  const topics = el("ul", "stack"),
    noTopics = el("p", "", "この通話には指定されたトピックがありません。");
  topic.body.append(topics, noTopics);
  const topicRows = list<{ id: number; text: string }>(
    topics,
    (t) => t.id,
    () => {
      const node = el("li");
      return {
        element: node,
        update(t) {
          text(node, t.text);
        },
      };
    },
  );
  scope.own(topicRows.dispose);
  const log = el(
    "div",
    "chat-log stack compact",
    el("p", "chat-bubble", "何かお困りですか？"),
  );
  log.role = "log";
  log.ariaLabel = "アシスタントとの会話";
  const messages = el("div", "stack compact");
  log.append(messages);
  const rows = list<AssistantLine & { id: number }>(
    messages,
    (m) => m.id,
    () => {
      const node = el("p", "chat-bubble");
      return {
        element: node,
        update(m) {
          node.dataset.own = String(m.own);
          text(node, m.body);
        },
      };
    },
  );
  scope.own(rows.dispose);
  const draft = input("メッセージを入力", controller.set_draft),
    send = submit("送信"),
    sendForm = form(controller.send, "row search-form");
  sendForm.append(draft.element, send);
  assistant.body.append(log, sendForm);
  const nav = el("nav", "bottom-navigation");
  nav.ariaLabel = "通話の操作";
  const mute = button("", controller.toggle_mute);
  mute.ariaLabel = "マイクをミュート";
  const muteIcon = icon("mic"),
    mutedIcon = icon("muted"),
    muteLabel = el("span");
  mute.append(muteIcon, mutedIcon, muteLabel);
  nav.append(mute);
  for (const [setOpen, label, name] of [
    [controller.open_memo, "メモ", "message"],
    [controller.open_assistant, "アシスタント", "search"],
    [controller.open_topic, "トピック", "topic"],
  ] as const) {
    const open = button("", () => setOpen(true));
    open.setAttribute("aria-haspopup", "dialog");
    open.append(icon(name), label);
    nav.append(open);
  }
  body.append(
    el("section", "stack", heading, participants),
    el(
      "section",
      "stack compact center",
      clock,
      finish,
      cancel,
      retry,
      button("通話一覧へ戻る", () => go("/sessionlist", false)),
    ),
    topic.element,
    memo.element,
    assistant.element,
    audio,
    error,
  );
  root.append(body, nav);
  host.replaceChildren(root);
  scope.observe(context.activity, (s) => controller.set_offset(s.clockOffset));
  scope.bind(controller, (s) => {
    const call = s.conversation[0];
    text(heading, `テーマ: ${call?.theme ?? "読み込み中"}`);
    text(clock, s.status);
    visible(finish, s.can_finish);
    visible(cancel, s.can_cancel);
    visible(retry, s.can_retry);
    finish.disabled = s.saving;
    cancel.disabled = s.saving;
    people[0].image.update(s.me.avatarUrl, s.me.username);
    text(people[0].name, s.me.username || "接続待ち");
    people[0].node.dataset.speaking = String(s.speaking && !s.muted);
    people[1].image.update(s.partner.avatar_url, s.partner.username);
    text(people[1].name, s.partner.username || "接続待ち");
    people[1].node.dataset.speaking = String(s.remote_speaking);
    mute.setAttribute("aria-pressed", String(s.muted));
    visible(muteIcon, !s.muted);
    visible(mutedIcon, s.muted);
    text(muteLabel, s.muted ? "ミュート中" : "マイク");
    tab.update(s.memo_tab);
    text(
      memoText,
      (s.memo_tab === "1" ? s.carryInMemo : s.wordList) ||
        "まだメモがありません。",
    );
    rows.update(s.messages.map((m, id) => ({ ...m, id })));
    value(draft.input, s.draft);
    draft.input.disabled = s.sending;
    send.disabled = s.sending;
    text(send, s.sending ? "送信中..." : "送信");
    topicRows.update((call?.topics ?? []).map((text, id) => ({ text, id })));
    visible(noTopics, !call?.topics.length);
    message(error, s.error);
    memo.update(s.memo_open);
    assistant.update(s.assistant_open);
    topic.update(s.topic_open);
  });
  return () => {
    scope.dispose();
    root.remove();
  };
}
