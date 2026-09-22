import { createBrowserThread } from "../../../../dist/thread.js";
import type { PageInput } from "../../../../dist/shell.js";
import { mountMessage } from "../../message/dom";
import { element as el } from "../elements";
import { page } from "../layout";
export function mount(host: HTMLElement, context: PageInput): () => void {
  const view = page(host, context, "other"),
    target = el("div", "stack");
  view.body.append(target);
  view.scope.own(mountMessage(target, createBrowserThread(context.peer)));
  return view.dispose;
}
