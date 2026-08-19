import type { CookieOptions } from "express";
import type { RuntimeConfig } from "./config";

export type SessionCookieConfig = RuntimeConfig["sessionCookie"];

export function sessionCookieOptions(config: SessionCookieConfig): CookieOptions {
  return {
    httpOnly: true,
    secure: config.secure,
    sameSite: config.sameSite,
    path: "/",
    maxAge: config.maxAgeMs
  };
}

export function sessionCookieClearOptions(config: SessionCookieConfig): CookieOptions {
  const { maxAge: _maxAge, ...options } = sessionCookieOptions(config);
  return options;
}

