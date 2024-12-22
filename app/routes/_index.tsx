import { data, LoaderFunctionArgs, redirect } from "@remix-run/cloudflare";
import { useLoaderData } from "@remix-run/react";
import { createStateCookie, setupSessionStorage } from "~/lib/session";
import { OAUTH_SCOPE, meta } from "~/lib/util";

export { meta };

export const loader = async ({ request, context }: LoaderFunctionArgs) => {
  const { getSession } = setupSessionStorage(context.cloudflare.env);
  const session = await getSession(request.headers.get("Cookie"));
  if (session.get("user")) {
    // User is already signed in.
    return redirect("/search");
  }

  const {
    env: { OAUTH_REDIRECT_URI, OAUTH_CLIENT_ID },
  } = context.cloudflare;
  const state = crypto.randomUUID();
  const oauthUrl =
    "https://accounts.spotify.com/authorize?" +
    new URLSearchParams({
      response_type: "code",
      client_id: OAUTH_CLIENT_ID,
      scope: OAUTH_SCOPE,
      redirect_uri: OAUTH_REDIRECT_URI,
      state,
    });

  const stateCookie = createStateCookie(context.cloudflare.env);
  return data(
    { oauthUrl },
    { headers: { "Set-Cookie": await stateCookie.serialize(state) } },
  );
};

export default function Index() {
  const { oauthUrl } = useLoaderData<typeof loader>();
  return (
    <div className="w-screen h-screen flex flex-col items-center justify-center">
      <div className="w-min grid gap-2">
        <div className="text-4xl font-bold text-nowrap">SFPL Vinyl Search</div>
        <div className="text-center">
          Find your top Spotify tracks on vinyl at the San Francisco Public
          Library.
        </div>
        <a
          href={oauthUrl}
          rel="noreferrer"
          className="p-4 bg-green-300 dark:bg-green-400 font-medium text-center"
        >
          Connect to Spotify
        </a>
        <a
          href="https://github.com/maxwellpeterson/sfplvinyl.com"
          rel="noreferrer"
          target="_blank"
          className="text-center text-gray-600 dark:text-gray-400 underline underline-offset-2"
        >
          View Source
        </a>
      </div>
    </div>
  );
}
