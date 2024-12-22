import { z } from "zod";
import { Credentials, setupSessionStorage } from "~/lib/session";
import { check } from "~/lib/util";

export class SpotifyClient {
  readonly #env: Env;
  #credentials: Credentials;

  constructor(env: Env, credentials: Credentials) {
    this.#env = env;
    this.#credentials = credentials;
  }

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
      await this.refreshUserCredentials();
      return this.get(endpoint, { refreshUserCredentials: false });
    }
    await check(url, response);
    return response.json();
  }

  private async refreshUserCredentials() {
    const { OAUTH_CLIENT_ID, OAUTH_CLIENT_SECRET } = this.#env;
    const url = "https://accounts.spotify.com/api/token";
    const body = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: this.#credentials.refresh_token,
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
    this.#credentials = { ...this.#credentials, access_token };
  }

  get credentials(): Credentials {
    return this.#credentials;
  }
}

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
