import { parseSignUp, parseToken } from "../../../dist/shared.js";
import { request } from "./request";

export const signUp = (username: string, email: string, password: string) =>
  request(
    "POST",
    "/signup",
    parseSignUp,
    { username, email, password },
    { authenticated: false },
  );

export const signIn = async (
  email: string,
  password: string,
): Promise<void> => {
  const token = await request(
    "POST",
    "/signin",
    parseToken,
    { email, password },
    { authenticated: false },
  );
  localStorage.setItem("token", token);
};
