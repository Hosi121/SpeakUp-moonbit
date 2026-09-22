// Same host and controller as standalone.ts, with only the renderer replaced.
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserThread } from "../../../dist/thread.js";
import { MessageView } from "./react";
import "../styles/app.css";

const host = document.querySelector<HTMLElement>("#message");
if (!host) throw new Error("Missing message host");
const peer = new URL(location.href).searchParams.get("peer") ?? "";
const controller = createBrowserThread(peer);
createRoot(host).render(
  <StrictMode>
    <MessageView controller={controller} />
  </StrictMode>,
);
window.addEventListener("pagehide", () => controller.stop());
window.addEventListener("pageshow", (event) => {
  if (event.persisted) controller.start();
});
