import type { PageInput } from "../../../../dist/shell.js";
import { page, tile } from "../layout";
import { element as el } from "../elements";
export function mount(host: HTMLElement, context: PageInput): () => void {
  const view = page(host, context, "record");
  view.body.append(
    el("h1", "", "記録"),
    el(
      "div",
      "grid",
      tile("会話の記録", "/conversation_history", "book"),
      tile("履歴", "/session_history_friendlist", "folder"),
      tile("データ", "/stats", "trophy"),
      tile("持ち込みメモ", "/memo", "note"),
    ),
  );
  return view.dispose;
}
