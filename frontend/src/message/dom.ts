import type { ThreadController, MessageView } from "../../../dist/thread.js";

/** A concrete DOM renderer, with no application state or request decisions. */
export function mountMessage(
  host: HTMLElement,
  controller: ThreadController,
): () => void {
  const template = document.createElement("template");
  // Static markup only. Every external string below uses textContent/value/src.
  template.innerHTML = `<p class="alert" role="alert"></p>
    <p role="status">読み込み中…</p>
    <div class="row" data-peer><span class="avatar"><img><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M16 6a4 4 0 1 0-8 0 4 4 0 0 0 8 0M4 22v-3a8 8 0 0 1 16 0v3"/></svg></span><h1></h1></div>
    <section class="panel stack" aria-label="メッセージ">
      <button data-older>以前のメッセージ</button>
      <div class="chat-log stack" role="log" aria-label="メッセージの履歴"></div>
      <form class="row search-form"><div class="field"><label>メッセージを入力</label><input maxlength="2000" required></div><button class="primary">送信</button></form>
    </section>`;
  host.replaceChildren(template.content.cloneNode(true));
  const required = <T extends Element>(selector: string) => {
    const element = host.querySelector<T>(selector);
    if (!element) throw new Error(`Missing message element: ${selector}`);
    return element;
  };
  const alert = required<HTMLElement>('[role="alert"]');
  const loading = required<HTMLElement>('[role="status"]');
  const peer = required<HTMLElement>("[data-peer]");
  const heading = required<HTMLElement>("h1");
  const avatar = required<HTMLImageElement>("img");
  const fallback = required<SVGElement>("svg");
  const section = required<HTMLElement>("section");
  const older = required<HTMLButtonElement>("[data-older]");
  const log = required<HTMLElement>('[role="log"]');
  const input = required<HTMLInputElement>("input");
  input.id = `message-${crypto.randomUUID()}`;
  required<HTMLLabelElement>("label").htmlFor = input.id;
  const form = required<HTMLFormElement>("form");
  const send = required<HTMLButtonElement>("form button");
  const empty = document.createElement("p");
  empty.textContent = "まだメッセージはありません。";
  const rows = new Map<
    number,
    { element: HTMLDivElement; body: HTMLParagraphElement; time: HTMLElement }
  >();
  let previousMessages: MessageView[] | undefined;
  const show = (element: HTMLElement | SVGElement, visible: boolean) => {
    element.style.display = visible ? "" : "none";
  };
  const text = (element: Element, value: string) => {
    if (element.textContent !== value) element.textContent = value;
  };
  const render = () => {
    const view = controller.get_snapshot();
    if (!view.valid) {
      window.location.replace("/friendrequest");
      return;
    }
    text(alert, view.error);
    show(alert, !!view.error);
    show(loading, !view.loaded && !view.error);
    show(peer, view.loaded);
    show(section, view.loaded);
    text(heading, view.peer_name);
    if (avatar.getAttribute("src") !== view.peer_avatar) {
      if (view.peer_avatar) avatar.src = view.peer_avatar;
      else avatar.removeAttribute("src");
    }
    avatar.alt = view.peer_name;
    show(avatar, !!view.peer_avatar);
    show(fallback, !view.peer_avatar);
    show(older, view.has_older);
    older.disabled = view.loading_older;
    input.disabled = view.sending;
    send.disabled = !view.can_send;
    // Preserve selection, focus and IME composition during unrelated updates.
    if (input.value !== view.draft) input.value = view.draft;
    if (previousMessages !== view.messages) {
      previousMessages = view.messages;
      const ids = new Set(view.messages.map((message) => message.id));
      for (const [id, row] of rows)
        if (!ids.has(id)) {
          row.element.remove();
          rows.delete(id);
        }
      empty.remove();
      let cursor = log.firstChild;
      for (const message of view.messages) {
        let row = rows.get(message.id);
        if (!row) {
          const element = document.createElement("div");
          element.className = "chat-bubble pre-wrap";
          const body = document.createElement("p"),
            time = document.createElement("small");
          element.append(body, time);
          row = { element, body, time };
          rows.set(message.id, row);
        }
        row.element.dataset.own = String(message.own);
        text(row.body, message.body);
        text(
          row.time,
          message.time + (message.own && message.read ? "・既読" : ""),
        );
        if (row.element !== cursor) log.insertBefore(row.element, cursor);
        else cursor = cursor.nextSibling;
      }
      if (!view.messages.length) log.append(empty);
    }
  };
  const change = () => controller.set_draft(input.value);
  const submit = (event: SubmitEvent) => {
    event.preventDefault();
    controller.send();
  };
  input.addEventListener("input", change);
  form.addEventListener("submit", submit);
  older.addEventListener("click", controller.load_older);
  const unsubscribe = controller.subscribe(render);
  render();
  controller.start();
  return () => {
    unsubscribe();
    controller.stop();
    input.removeEventListener("input", change);
    form.removeEventListener("submit", submit);
    older.removeEventListener("click", controller.load_older);
    host.replaceChildren();
  };
}
