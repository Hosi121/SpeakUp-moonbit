import type { Upload } from "../../../dist/presenter.js";
import { createTextTransport } from "./transport";
export function uploadFile(file: File): Upload {
  return {
    send: (method, path, field, done) => {
      const body = new FormData();
      body.append(field, file);
      return createTextTransport(import.meta.env.VITE_API_URL ?? "/api", () =>
        localStorage.getItem("token"),
      )(method, path, body, true, done);
    },
  };
}
