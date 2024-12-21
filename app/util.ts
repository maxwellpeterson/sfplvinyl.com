import { type MetaFunction } from "@remix-run/cloudflare";

/** The OAuth scope our application requests from Spotify. */
export const OAUTH_SCOPE = "user-top-read";

/** Throws a helpful error message if the response was unsuccessful. */
export async function check(url: string | URL, response: Response) {
  if (!response.ok) {
    throw new Error(
      `Bad response from ${url.toString()} (${
        response.status
      }): ${await response.text()}`,
    );
  }
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

/** Returns the URL search params of the request as an object. */
export function searchParams(request: Request) {
  const url = new URL(request.url);
  // Repeated keys get clobbered but that's fine for our use case.
  return Object.fromEntries(url.searchParams.entries());
}

/** Returns the text to generate an embedding for the album from. */
export function getEmbeddingText(album: {
  name: string;
  artists: string[];
}): string {
  // Join with "and" instead of commas since some artist names are formatted as
  // "Petty, Tom" instead of "Tom Petty" and commas get wonky here.
  return `the album ${album.name} by ${album.artists.join(" and ")}`;
}

export function chunk<T>(array: T[], chunkSize: number): T[][] {
  const chunked = [];
  for (let i = 0; i < array.length; i += chunkSize) {
    const chunk = array.slice(i, i + chunkSize);
    chunked.push(chunk);
  }
  return chunked;
}
