import { createContext, useContext } from "react";
import type { InboxDto } from "../../../dist/shared.js";
export const Activity = createContext({
  revision: 0,
  inbox: null as InboxDto | null,
  error: "",
  connected: false,
  clockOffset: 0,
});
export const useActivity = () => useContext(Activity);
