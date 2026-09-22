import type { PageInput } from "../../../dist/shell.js";
import type {
  ActivityController,
  NotificationView,
} from "../../../dist/presenter.js";
import {
  element as el,
  text,
  visible,
  message,
  alert,
  status,
  button,
  link,
  list,
  ViewScope,
} from "./elements";
import { icon } from "./icons";

export function avatar(large = false) {
  const image = el("img"),
    fallback = icon("person", large ? 42 : 24);
  const node = el(
    "span",
    large ? "avatar avatar-large" : "avatar",
    image,
    fallback,
  );
  return {
    element: node,
    update(src: string, name: string) {
      if (image.getAttribute("src") !== src) {
        if (src) image.src = src;
        else image.removeAttribute("src");
      }
      image.alt = name;
      visible(image, !!src);
      visible(fallback, !src);
    },
  };
}
export function dialog(title: string, close: () => void, sheet = false) {
  const node = el("dialog", sheet ? "dialog dialog-sheet" : "dialog");
  const heading = el("h2", "", title);
  heading.id = `dialog-${crypto.randomUUID()}`;
  node.setAttribute("aria-labelledby", heading.id);
  const dismiss = button("", close, "icon-button");
  dismiss.ariaLabel = "閉じる";
  dismiss.autofocus = true;
  dismiss.append(icon("close"));
  const body = el("div", "dialog-body");
  node.append(el("header", "dialog-header", heading, dismiss), body);
  node.addEventListener("cancel", (event) => {
    event.preventDefault();
    close();
  });
  return {
    element: node,
    body,
    update(open: boolean) {
      if (open && !node.open && node.isConnected) node.showModal();
      if (!open && node.open) node.close();
    },
    dispose() {
      if (node.open) node.close();
      node.remove();
    },
  };
}
function notifications(controller: ActivityController, scope: ViewScope) {
  const badge = el("span", "badge");
  const trigger = button("", () => controller.set_open(true), "icon-button");
  trigger.ariaLabel = "通知";
  trigger.setAttribute("aria-haspopup", "dialog");
  trigger.append(icon("bell", 28), badge);
  const modal = dialog("通知", () => controller.set_open(false));
  const error = alert(),
    reconnect = status("更新通知に再接続しています。"),
    empty = el("p", "", "新しい通知はありません。");
  const read = button("表示した通知まで既読にする", controller.read);
  const host = el("ul", "plain-list stack");
  modal.body.append(error, reconnect, empty, read, host);
  const rows = list<NotificationView>(
    host,
    (row) => row.value.id,
    () => {
      const image = avatar(),
        name = el("strong"),
        description = el("p"),
        date = el("small"),
        destination = link("確認する", "/");
      destination.addEventListener("click", () => controller.set_open(false));
      const node = el(
        "li",
        "panel row",
        image.element,
        el("div", "grow", name, description, date, el("p", "", destination)),
      );
      return {
        element: node,
        update(row) {
          const n = row.value;
          image.update(n.actor.avatar_url, n.actor.username);
          text(name, n.actor.username);
          text(description, row.description);
          text(
            date,
            `${new Date(n.created_at).toLocaleString()} ${n.read ? "既読" : "未読"}`,
          );
          destination.href = row.destination;
        },
      };
    },
  );
  scope.own(rows.dispose);
  scope.own(modal.dispose);
  return {
    trigger,
    modal: modal.element,
    attach() {
      scope.observe(controller, (view) => {
        text(badge, view.inbox.unread);
        badge.ariaLabel = `未読 ${view.inbox.unread} 件`;
        visible(badge, view.inbox.unread > 0);
        message(error, view.read_error || view.error);
        visible(reconnect, !view.connected);
        visible(empty, view.items.length === 0 && !view.error);
        visible(read, view.inbox.unread > 0);
        read.disabled = view.busy;
        rows.update(view.items);
        modal.update(view.open);
      });
    },
  };
}
export type Navigation = "home" | "record" | "session" | "other";
export function page(
  host: HTMLElement,
  context: PageInput,
  navigation?: Navigation,
) {
  const scope = new ViewScope(context.failed);
  const body = el("main", "page stack");
  const root = navigation ? el("div", "app-shell", body) : body;
  const notification = notifications(context.activity, scope);
  const settings = link("", "/settings", "button icon-button");
  settings.ariaLabel = "設定";
  settings.append(icon("settings", 28));
  const home = link("SpeakUp", "/home");
  home.ariaLabel = "SpeakUp ホーム";
  body.append(
    el("header", "top-section", notification.trigger, home, settings),
    notification.modal,
  );
  if (navigation) {
    const nav = el("nav", "bottom-navigation");
    nav.ariaLabel = "メインナビゲーション";
    for (const [key, label, path, name] of [
      ["record", "記録", "/record", "book"],
      ["home", "ホーム", "/home", "home"],
      ["session", "通話", "/sessionlist", "mic"],
    ] as const) {
      const anchor = link("", path);
      anchor.append(icon(name), label);
      if (key === navigation) anchor.setAttribute("aria-current", "page");
      nav.append(anchor);
    }
    root.append(nav);
  }
  host.replaceChildren(root);
  notification.attach();
  return {
    body,
    root,
    scope,
    dispose: () => {
      scope.dispose();
      root.remove();
    },
  };
}
export function tile(
  label: string,
  path: string,
  name: Parameters<typeof icon>[0],
) {
  const anchor = link("", path, "button panel tile");
  anchor.append(icon(name, 48), el("span", "", label));
  return anchor;
}
