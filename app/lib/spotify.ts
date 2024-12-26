import { z } from "zod";
import { Credentials, setupSessionStorage } from "~/lib/session";
import { check } from "./util";

/**
 * A wrapper around the Spotify API that handles authentication and access token
 * refresh.
 */
export class SpotifyClient {
  readonly #env: Env;
  #credentials: Credentials;

  constructor(env: Env, credentials: Credentials) {
    this.#env = env;
    this.#credentials = credentials;
  }

  /**
   * Fetches results from the given Spotify API endpoint, refreshing the current
   * access token if necessary.
   */
  async get(
    endpoint: string,
    options = { refreshUserCredentials: true },
  ): Promise<unknown> {
    const url = `https://api.spotify.com/v1${endpoint}`;
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${this.#credentials.access_token}`,
      },
    });
    if (response.status === 401 && options.refreshUserCredentials) {
      this.#credentials = await refreshCredentials(
        this.#env,
        this.#credentials,
      );
      return this.get(endpoint, { refreshUserCredentials: false });
    }
    await check(url, response);
    return response.json();
  }

  /**
   * The current Spotify access and refresh token pair, which may have been
   * updated during a previous call to get().
   */
  get credentials(): Credentials {
    return this.#credentials;
  }
}

/**
 * Completes the OAuth flow using the given authorization code and returns a
 * serialized session cookie.
 */
export async function createSession(env: Env, code: string): Promise<string> {
  const spotify = new SpotifyClient(env, await getCredentials(env, code));
  const profile = z
    .object({
      uri: z.string(),
      display_name: z.string(),
    })
    .parse(await spotify.get("/me"));
  const { getSession, commitSession } = setupSessionStorage(env);
  const session = await getSession();
  session.set("user", {
    uri: profile.uri,
    name: profile.display_name,
    credentials: spotify.credentials,
  });
  return commitSession(session);
}

/**
 * Upgrades an authorization code into a full access and refresh token pair.
 *
 * @see https://developer.spotify.com/documentation/web-api/tutorials/code-flow
 */
async function getCredentials(
  { OAUTH_REDIRECT_URI, OAUTH_CLIENT_ID, OAUTH_CLIENT_SECRET }: Env,
  code: string,
): Promise<Credentials> {
  const url = "https://accounts.spotify.com/api/token";
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: OAUTH_REDIRECT_URI,
    client_id: OAUTH_CLIENT_ID,
    client_secret: OAUTH_CLIENT_SECRET,
  });
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  await check(url, response);
  return z
    .object({
      access_token: z.string(),
      refresh_token: z.string(),
    })
    .parse(await response.json());
}

/**
 * Refreshes the current Spotify access token.
 *
 * @see https://developer.spotify.com/documentation/web-api/tutorials/refreshing-tokens
 */
async function refreshCredentials(
  { OAUTH_CLIENT_ID, OAUTH_CLIENT_SECRET }: Env,
  credentials: Credentials,
): Promise<Credentials> {
  const url = "https://accounts.spotify.com/api/token";
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: credentials.refresh_token,
    client_id: OAUTH_CLIENT_ID,
    client_secret: OAUTH_CLIENT_SECRET,
  });
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  await check(url, response);
  const { access_token } = z
    .object({ access_token: z.string() })
    .parse(await response.json());
  return { ...credentials, access_token };
}
