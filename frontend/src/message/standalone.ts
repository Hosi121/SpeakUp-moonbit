// Standalone proof: this entry and its dependency graph contain no React.
// A host can deliver activity hints with the same onActivity browser port.
import { createBrowserThread } from "../../../dist/thread.js";
import { mountMessage } from "./dom";
import "../styles/app.css";

const host = document.querySelector<HTMLElement>("#message");
if (!host) throw new Error("Missing message host");
const peer = new URL(location.href).searchParams.get("peer") ?? "";
const controller = createBrowserThread(peer);
const dispose = mountMessage(host, controller);
window.addEventListener("pagehide", (event) => {
  if (event.persisted) controller.stop();
  else dispose();
});
window.addEventListener("pageshow", (event) => {
  if (event.persisted) controller.start();
});
