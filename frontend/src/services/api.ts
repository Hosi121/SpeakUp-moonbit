import { createHttpClient } from "./httpClient";

export default createHttpClient(import.meta.env.VITE_API_URL ?? "/api", () =>
  localStorage.getItem("token"),
);
