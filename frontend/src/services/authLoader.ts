import type { AuthPorts } from "../../../dist/shell.js";
import { go, storeToken } from "./browser.ts";

export const authPorts = (): AuthPorts => ({
  load: (ready, failed) => {
    void import("./authService").then(
      (module) => ready(module.submit),
      () => failed(""),
    );
  },
  store_token: storeToken,
  navigate: go,
});
