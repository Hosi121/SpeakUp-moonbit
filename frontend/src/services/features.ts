import { createActivity, browserPorts } from "../../../dist/presenter.js";
import { realtimePorts } from "./realtime.ts";
// Kept as a lazy entry so anonymous screens do not load the application runtime.
export const activityController = () =>
  createActivity(browserPorts(), realtimePorts());
