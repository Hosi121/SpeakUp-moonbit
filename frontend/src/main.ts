import { createApp, type AppHost, type PageInput } from "../../dist/shell.js";
import { mountAuth } from "./dom/pages/Auth";
import { element as el, link, button, status } from "./dom/elements";
import { go } from "./services/browser";
import "./styles/app.css";

const root = document.getElementById("root");
if (!root) throw new Error("Missing root element");
const host: HTMLElement = root;
type Mount = (host: HTMLElement, context: PageInput) => () => void;
const pages: Record<string, () => Promise<{ mount: Mount }>> = {
  "/home": () => import("./dom/pages/Home"),
  "/settings": () => import("./dom/pages/Settings"),
  "/events": () => import("./dom/pages/Events"),
  "/sessionlist": () => import("./dom/pages/SessionList"),
  "/miccheck": () => import("./dom/pages/MicCheck"),
  "/session": () => import("./dom/pages/Session"),
  "/sessionrecord": () => import("./dom/pages/Reflection"),
  "/record": () => import("./dom/pages/Record"),
  "/memo": () => import("./dom/pages/Memo"),
  "/stats": () => import("./dom/pages/Stats"),
  "/conversation_history": () => import("./dom/pages/History"),
  "/admin": () => import("./dom/pages/Admin"),
  "/friendlist": () =>
    import("./dom/pages/Social").then((m) => ({ mount: m.mountFriends })),
  "/session_history_friendlist": () =>
    import("./dom/pages/History").then((m) => ({
      mount: (host, context) => m.mount(host, context, true),
    })),
  "/friendrequest": () => import("./dom/pages/Social"),
  "/sessionfeedback": () => import("./dom/pages/Feedback"),
  "/message": () => import("./dom/pages/Message"),
};
const ports: AppHost = {
  location: () => {
    const url = new URL(location.href);
    let pathname = "";
    try {
      pathname = decodeURI(url.pathname);
    } catch {
      /* render the unknown route */
    }
    return {
      pathname,
      conversation: url.searchParams.get("conversation") ?? "",
      token: localStorage.getItem("token") ?? "",
    };
  },
  on_location: (callback) => {
    const events = ["popstate", "hashchange", "speakup:navigate"];
    for (const event of events) window.addEventListener(event, callback);
    return () => {
      for (const event of events) window.removeEventListener(event, callback);
    };
  },
  navigate: go,
  load: (name, ready, failed) => {
    const mount = (render: Mount) =>
      ready({
        mount: (context) => {
          host.replaceChildren();
          try {
            return render(host, context);
          } catch {
            context.failed();
            return () => {};
          }
        },
      });
    if (name === "/login" || name === "/signup") {
      mount((root, context) => mountAuth(root, context, name === "/signup"));
      return;
    }
    const load = pages[name];
    if (!load) {
      failed();
      return;
    }
    void load().then((module) => mount(module.mount), failed);
  },
  load_activity: (ready, failed) => {
    void import("./services/features").then(
      (module) => ready(module.activityController()),
      () => failed("通知機能を読み込めませんでした。"),
    );
  },
  loading: () =>
    host.replaceChildren(el("main", "page", status("画面を読み込み中…"))),
  not_found: () =>
    host.replaceChildren(
      el(
        "main",
        "page stack",
        el("h1", "", "ページが見つかりません"),
        link("ホームへ", "/home"),
        link("サインインへ", "/login"),
      ),
    ),
  failed: () => {
    const error = el("p", "", "接続を確認して、もう一度読み込んでください。");
    error.role = "alert";
    host.replaceChildren(
      el(
        "main",
        "page stack",
        el("h1", "", "画面を読み込めませんでした"),
        error,
        button("再読み込み", () => location.reload()),
        link("サインインへ", "/login"),
      ),
    );
  },
};
const click = (event: MouseEvent) => {
  if (
    event.defaultPrevented ||
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey
  )
    return;
  const anchor =
    event.target instanceof Element ? event.target.closest("a") : null;
  if (
    !anchor ||
    anchor.hasAttribute("download") ||
    (anchor.target && anchor.target !== "_self")
  )
    return;
  const url = new URL(anchor.href);
  if (
    url.origin !== location.origin ||
    (url.hash &&
      url.pathname === location.pathname &&
      url.search === location.search)
  )
    return;
  event.preventDefault();
  go(url.href, false);
};
document.addEventListener("click", click);
const app = createApp(ports);
app.start();
window.addEventListener("pagehide", (event) => {
  if (!event.persisted) {
    app.stop();
    document.removeEventListener("click", click);
  }
});
