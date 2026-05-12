import { cookies } from "next/headers";

export type Theme = "dark" | "light";

export const THEME_COOKIE = "theme";

/**
 * Resolve the current theme from the request cookie. Dark by default — the
 * brief specifies dark as the primary mode.
 */
export function getThemeFromCookie(): Theme {
  const raw = cookies().get(THEME_COOKIE)?.value;
  return raw === "light" ? "light" : "dark";
}
