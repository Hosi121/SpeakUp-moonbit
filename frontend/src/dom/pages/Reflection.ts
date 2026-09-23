import {
  createReflection,
  createLearning,
  browserPorts,
} from "../../../../dist/presenter.js";
import type { PageInput } from "../../../../dist/shell.js";
import { go } from "../../services/browser";
import { page } from "../layout";
import {
  element as el,
  input,
  textarea,
  link,
  form,
  button,
  submit,
  alert,
  message,
  value,
  text,
  visible,
  ViewScope,
} from "../elements";
function learning(
  host: HTMLElement,
  context: PageInput,
  id: number,
  readSaved: () => boolean,
) {
  const scope = new ViewScope(context.failed),
    controller = createLearning(browserPorts(), String(id), false),
    root = el("section", "panel stack");
  root.ariaLabel = "学習アドバイス";
  const prompt = el("p", "", "先に感想・学んだ表現を保存してください。"),
    feedback = el("p", "pre-wrap"),
    stale = el("p", "", "編集前の内容に対するアドバイスです。"),
    generate = button("", controller.generate),
    error = alert();
  root.append(
    el("h2", "", "書いた内容への学習アドバイス"),
    el(
      "p",
      "",
      "保存した感想と学んだ表現を外部 AI に送って、改善案と例文を作ります。音声の評価は行いません。結果は本人だけが閲覧できます。",
    ),
    prompt,
    feedback,
    stale,
    generate,
    error,
  );
  host.append(root);
  scope.bind(controller, (s) => {
    const saved = readSaved();
    visible(prompt, !saved);
    message(feedback, s.feedback);
    visible(stale, !!s.feedback && (!s.feedback_current || !saved));
    generate.disabled = !s.can_generate;
    text(
      generate,
      s.busy
        ? "作成中…"
        : s.feedback_current
          ? "保存済みのアドバイス"
          : "保存した内容を送ってアドバイスを作る",
    );
    message(error, s.error);
  });
  return {
    update: controller.set_saved,
    dispose() {
      scope.dispose();
      root.remove();
    },
  };
}
export function mount(host: HTMLElement, context: PageInput): () => void {
  const controller = createReflection(browserPorts(), context.conversation),
    id = controller.get_snapshot().id;
  if (!id) {
    go("/conversation_history", true);
    return () => {};
  }
  const view = page(host, context),
    theme = el("h2"),
    people = el("p"),
    when = el("p"),
    summary = el("section", "panel stack compact", theme, people, when);
  const error = alert(),
    incomplete = el("p", "alert", "通話が終了してから記録できます。"),
    saved = alert();
  text(saved, "保存済みです。振り返りは本人だけが閲覧できます。");
  const content = form(controller.save, "panel stack"),
    rating = input(
      "満足度 (%)",
      (v) => controller.set_satisfaction(v),
      { type: "number", min: "0", max: "100", step: "1", required: true },
    );
  const comment = textarea(
      "感想",
      (v) => controller.set_comment(v),
      3,
      4000,
    ),
    learned = textarea(
      "学んだ表現",
      (v) => controller.set_learned(v),
      4,
      8000,
    ),
    save = submit("保存");
  content.append(rating.element, comment.element, learned.element, save);
  const advice = el("div", "stack"),
    extra = el(
      "div",
      "stack",
      advice,
      link("6 つの質問で振り返る", `/sessionfeedback?conversation=${id}`),
      link("通話した相手にフレンド申請", "/friendrequest"),
    );
  view.body.append(
    el("h1", "", "会話の振り返り"),
    summary,
    error,
    incomplete,
    saved,
    content,
    extra,
    button("通話一覧へ", () => go("/sessionlist", false)),
    button("会話の記録へ", () => go("/conversation_history", false)),
  );
  let child: ReturnType<typeof learning> | undefined;
  view.scope.own(() => child?.dispose());
  view.scope.bind(controller, (s) => {
    const call = s.conversation[0];
    visible(summary, !!call);
    if (call) {
      text(theme, call.theme);
      text(people, call.participants.map((p) => p.username).join(" / "));
      text(
        when,
        call.started_at ? new Date(call.started_at).toLocaleString() : "未開始",
      );
    }
    message(error, s.error);
    visible(incomplete, !s.busy && !!call && !s.complete);
    visible(saved, s.saved);
    visible(extra, s.complete);
    value(rating.input, s.satisfaction);
    value(comment.input, s.comment);
    value(learned.input, s.learned);
    for (const field of [rating.input, comment.input, learned.input, save])
      field.disabled = s.busy || !s.complete;
    if (s.complete) {
      child ??= learning(
        advice,
        context,
        id,
        () => controller.get_snapshot().saved,
      );
      child.update(s.saved);
    } else if (child) {
      child.dispose();
      child = undefined;
    }
  });
  return view.dispose;
}
