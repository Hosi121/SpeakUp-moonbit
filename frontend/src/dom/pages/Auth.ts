import { createAuth, type PageInput } from "../../../../dist/shell.js";
import { authPorts } from "../../services/authLoader";
import logo from "../../assets/logo.svg";
import {
  element as el,
  input,
  link,
  form,
  submit,
  alert,
  message,
  value,
  text,
  ViewScope,
} from "../elements";

export function mountAuth(
  host: HTMLElement,
  context: PageInput,
  signup: boolean,
): () => void {
  const controller = createAuth(signup, authPorts()),
    scope = new ViewScope(context.failed);
  const root = el("main", "auth-page"),
    content = form(controller.submit, "auth-form stack");
  const image = el("img");
  image.src = logo;
  image.alt = "";
  content.append(
    el("div", "brand-mark", image),
    el("h1", "center", signup ? "サインアップ" : "サインイン"),
  );
  const username = input(
    "ユーザー名(セッション時の表示名)",
    controller.set_username,
    { required: true, autocomplete: "nickname" },
  );
  const email = input("Email", controller.set_email, {
    type: "email",
    required: true,
    autocomplete: signup ? "email" : "username",
  });
  const password = input(
    "パスワード",
    controller.set_password,
    {
      type: "password",
      required: true,
      autocomplete: signup ? "new-password" : "current-password",
    },
  );
  for (const field of [username, email, password])
    field.input.addEventListener("focus", controller.preload);
  if (signup) {
    password.input.minLength = 8;
    content.append(username.element);
  }
  content.append(email.element, password.element);
  const show = el("input");
  show.type = "checkbox";
  show.addEventListener("change", () => controller.show_password(show.checked));
  if (signup)
    content.append(
      el("small", "", "パスワードは8文字以上で入力してください。"),
    );
  else content.append(el("label", "radio-option", show, "入力内容を表示"));
  const error = alert(),
    send = submit(signup ? "メールを送信して仮登録" : "サインイン");
  content.append(
    error,
    send,
    link(
      signup ? "ログインページに戻る" : "サインアップ",
      signup ? "/login" : "/signup",
      "center",
    ),
  );
  root.append(content);
  host.replaceChildren(root);
  scope.bind(controller, (view) => {
    value(username.input, view.username);
    value(email.input, view.email);
    value(password.input, view.password);
    password.input.type = view.showPassword ? "text" : "password";
    show.checked = view.showPassword;
    message(error, view.error);
    send.disabled = view.busy;
    if (!signup) text(send, view.busy ? "サインイン中…" : "サインイン");
  });
  return () => {
    scope.dispose();
    root.remove();
  };
}
