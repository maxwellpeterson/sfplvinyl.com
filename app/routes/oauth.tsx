import { LoaderFunctionArgs, redirect } from "@remix-run/cloudflare";
import { useLoaderData } from "@remix-run/react";
import { setupSessionStorage } from "~/session";
import { OAUTH_SCOPE } from "~/util";

export const loader = async ({ request, context }: LoaderFunctionArgs) => {
  const { getSession } = setupSessionStorage(context.cloudflare.env);
  const session = await getSession(request.headers.get("Cookie"));
  if (session.get("user")) {
    // User is already signed in.
    return redirect("/");
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
      <h1>SFPL Vinyl Search</h1>
      <p>Find your top tracks on vinyl at the San Francisco Public Library.</p>
      <a href={oauthUrl}>Connect to Spotify</a>
    </div>
  );
}
