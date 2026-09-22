import { createAuthRequest, browserPorts } from "../../../dist/presenter.js";
import { requestPublic } from "./browser.ts";
export const { submit } = createAuthRequest({
  ...browserPorts(),
  request: requestPublic,
});
