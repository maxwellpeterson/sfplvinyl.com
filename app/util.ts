import { type MetaFunction } from "@remix-run/cloudflare";

export const OAUTH_SCOPE = "user-top-read";

export async function onError(url: string | URL, response: Response) {
  throw new Error(
    `Bad response from ${url.toString()} (${
      response.status
    }): ${await response.text()}`
  );
}

export type Album = {
  uri: string;
  name: string;
  artists: {
    uri: string;
    name: string;
  }[];
  topTracks: {
    uri: string;
    name: string;
  }[];
  imageUrl: string;
  year: string;
  kind: "album" | "single" | "compilation";
  sfplId?: string;
};

export const meta: MetaFunction = () => {
  return [
    { title: "SFPL Vinyl Search" },
    {
      name: "description",
      content:
        "Find your top Spotify tracks on vinyl at the San Francisco Public Library.",
    },
  ];
};

export function searchParams(request: Request) {
  const url = new URL(request.url);
  return Object.fromEntries(url.searchParams.entries());
}
