import { createSettings, browserPorts } from "../../../../dist/presenter.js";
import type { PageInput } from "../../../../dist/shell.js";
import { uploadFile } from "../../services/upload";
import { page, avatar } from "../layout";
import {
  element as el,
  input,
  form,
  button,
  submit,
  alert,
  status,
  visible,
  message,
  value,
  text,
} from "../elements";
export function mount(host: HTMLElement, context: PageInput): () => void {
  const view = page(host, context, "other"),
    controller = createSettings(browserPorts());
  const error = alert(),
    loading = status("読み込み中…"),
    profile = el("section", "panel stack"),
    image = avatar(true);
  const file = input("プロフィール画像", () => {}, {
    type: "file",
    accept: "image/png,image/jpeg,image/webp",
  });
  file.input.addEventListener("change", () => {
    const selected = file.input.files?.[0];
    if (selected) controller.upload(uploadFile(selected));
    file.input.value = "";
  });
  profile.append(el("div", "row", image.element, file.element));
  const fields = (["username", "email"] as const).map((key) => {
    const label = key === "username" ? "ユーザー名" : "メールアドレス";
    const shown = el("p"),
      edit = button("編集", () => controller.edit(key));
    edit.ariaLabel = `${label}を編集`;
    const display = el(
      "div",
      "row between",
      el("div", "grow", el("small", "", label), shown),
      edit,
    );
    const content = form(controller.save, "stack compact"),
      field = input(label, controller.set_draft, {
        type: key === "email" ? "email" : "text",
        required: true,
      });
    const save = submit("保存"),
      cancel = button("キャンセル", () => controller.edit(""));
    content.append(field.element, el("div", "row", save, cancel));
    profile.append(el("div", "stack compact", display, content));
    return { key, shown, edit, display, content, field, save, cancel };
  });
  view.body.append(
    el("h1", "", "設定"),
    error,
    loading,
    profile,
    button("ログアウト", controller.logout),
  );
  let focused = "";
  view.scope.bind(controller, (s) => {
    message(error, s.error);
    visible(loading, !s.loaded && !s.error);
    visible(profile, s.loaded);
    image.update(s.user.avatarUrl, s.user.username);
    file.input.disabled = s.busy;
    for (const row of fields) {
      const editing = row.key === s.editing;
      visible(row.content, editing);
      visible(row.display, !editing);
      text(row.shown, s.user[row.key]);
      row.edit.disabled = s.busy;
      row.field.input.disabled = s.busy;
      row.save.disabled = s.busy;
      row.cancel.disabled = s.busy;
      if (editing) {
        value(row.field.input, s.draft);
        if (focused !== s.editing) row.field.input.focus();
      }
    }
    focused = s.editing;
  });
  return view.dispose;
}
