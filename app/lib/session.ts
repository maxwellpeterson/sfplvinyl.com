import {
  createCookie,
  createWorkersKVSessionStorage,
} from "@remix-run/cloudflare";

export type SessionData = {
  user: User;
};

export type User = {
  uri: string;
  name: string;
  credentials: Credentials;
};

/** Credentials used to access the Spotify API. */
export type Credentials = {
  access_token: string;
  refresh_token: string;
};

export function setupSessionStorage(env: Env) {
  return createWorkersKVSessionStorage<SessionData>({
    kv: env.SESSION,
    cookie: {
      name: "__session",
      maxAge: 7 * 24 * 60 * 60,
      secrets: [env.SESSION_SIGNING_SECRET],
    },
  });
}

export function createStateCookie(env: Env) {
  return createCookie("__state", {
    maxAge: 60 * 60,
    secrets: [env.SESSION_SIGNING_SECRET],
  });
}
