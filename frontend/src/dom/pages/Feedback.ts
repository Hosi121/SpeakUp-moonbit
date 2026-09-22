import { createLearning, browserPorts } from "../../../../dist/presenter.js";
import type { PageInput } from "../../../../dist/shell.js";
import { go } from "../../services/browser";
import { page } from "../layout";
import {
  element as el,
  link,
  form,
  submit,
  alert,
  status,
  message,
  visible,
  choices,
} from "../elements";
const questions = [
  {
    label: "楽しかった？",
    options: ["すごく楽しかった", "楽しかった", "あまり楽しくなかった"],
  },
  {
    label: "英語だけで話せた？",
    options: ["全部英語だった", "ほぼ英語だった", "ときどき日本語だった"],
  },
  {
    label: "前回よりたくさん話せた？",
    options: ["前回より多く話せた", "同じくらい", "前回より少なかった"],
  },
  {
    label: "相手は英語だけで話してた？",
    options: ["全部英語だった", "ほとんど英語だった", "ときどき日本語だった"],
  },
  {
    label: "相手はたくさん話してくれた？",
    options: ["はい", "まあまあ", "いいえ"],
  },
  {
    label: "相手はたくさん聞いてくれた？",
    options: ["はい", "まあまあ", "いいえ"],
  },
];
export function mount(host: HTMLElement, context: PageInput): () => void {
  const controller = createLearning(
    browserPorts(),
    context.conversation,
    false,
  );
  if (!controller.get_snapshot().id) {
    go("/conversation_history", true);
    return () => {};
  }
  const view = page(host, context),
    error = alert(),
    saved = status("保存済みです。"),
    content = form(controller.save, "panel stack"),
    save = submit("回答を保存");
  const fields = questions.map((question, index) =>
    choices(
      question.label,
      question.options.map((label, value) => ({ label, value: String(value) })),
      (value) => controller.answer(index, Number(value)),
      false,
    ),
  );
  content.append(...fields.map((f) => f.element), save);
  view.body.append(
    el("h1", "", "会話を振り返る"),
    el("p", "", "この回答は本人だけが閲覧できます。"),
    error,
    saved,
    content,
    link(
      "感想・学んだ表現へ",
      `/sessionrecord?conversation=${controller.get_snapshot().id}`,
    ),
    link("通話した相手にフレンド申請", "/friendrequest"),
    link("次のイベントを探す", "/events"),
  );
  view.scope.bind(controller, (s) => {
    message(error, s.error);
    visible(saved, s.saved);
    save.disabled = s.busy;
    for (let i = 0; i < fields.length; i++) {
      fields[i].update(String(s.answers[i]));
      fields[i].element.disabled = s.busy;
    }
  });
  return view.dispose;
}
