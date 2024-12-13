import { LoaderFunctionArgs, redirect } from "@remix-run/cloudflare";
import { useLoaderData } from "@remix-run/react";
import { setupSessionStorage } from "~/session";
import { OAUTH_SCOPE } from "~/util";

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
  const oauthUrl =
    "https://accounts.spotify.com/authorize?" +
    new URLSearchParams({
      response_type: "code",
      client_id: OAUTH_CLIENT_ID,
      scope: OAUTH_SCOPE,
      redirect_uri: OAUTH_REDIRECT_URI,
    });
  return { oauthUrl };
};

export default function OAuth() {
  const { oauthUrl } = useLoaderData<typeof loader>();
  return (
    <div className="flex flex-col h-screen items-center justify-center">
      <div className="w-min flex flex-col align-center gap-2">
        <h1 className="text-4xl font-bold text-nowrap">SFPL Vinyl Search</h1>
        <span className="text-center">
          Find your top Spotify tracks on vinyl at the San Francisco Public
          Library.
        </span>
        <a href={oauthUrl} className="p-4 bg-green-300 dark:bg-green-600 font-medium text-center">
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
