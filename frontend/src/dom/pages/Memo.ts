import { createMemo, browserPorts } from "../../../../dist/presenter.js";
import type { PageInput } from "../../../../dist/shell.js";
import { page } from "../layout";
import {
  element as el,
  textarea,
  form,
  submit,
  alert,
  status,
  message,
  value,
  visible,
} from "../elements";
export function mount(host: HTMLElement, context: PageInput): () => void {
  const view = page(host, context, "other"),
    controller = createMemo(browserPorts());
  const content = form(controller.save, "panel stack"),
    fields = el("fieldset", "stack");
  const memo = textarea("持ち込みメモ", controller.set_memo, 8, 255),
    words = textarea("ワードリスト", controller.set_words, 8, 255);
  const counters = [memo, words].map((field) => {
    const count = el("small", "numeric");
    count.id = `count-${crypto.randomUUID()}`;
    field.input.setAttribute("aria-describedby", count.id);
    return { element: el("div", "stack compact", field.element, count), count };
  });
  const error = alert(),
    saved = status("保存しました。");
  fields.append(...counters.map((c) => c.element), submit("保存"));
  content.append(fields, error, saved);
  view.body.append(el("h1", "", "持ち込みメモ"), content);
  view.scope.bind(controller, (s) => {
    value(memo.input, s.carryInMemo);
    value(words.input, s.wordList);
    fields.disabled = s.busy;
    counters[0].count.textContent = `${s.carryInMemo.length}/255`;
    counters[1].count.textContent = `${s.wordList.length}/255`;
    message(error, s.error);
    visible(saved, s.saved);
  });
  return view.dispose;
}
