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
  img: {
    src: string;
    href: string;
  };
  year: string;
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
  // Join with "and" instead of commas since some artist names are sometimes
  // formatted as "Petty, Tom" instead of "Tom Petty" and commas are ambiguous
  // in this situation.
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

export function cosineSimilarity(vector1: number[], vector2: number[]) {
  if (vector1.length !== vector2.length) {
    throw new Error("Vectors must be the same length!");
  }

  let dotProduct = 0;
  let magnitude1 = 0;
  let magnitude2 = 0;

  for (let i = 0; i < vector1.length; i++) {
    dotProduct += vector1[i] * vector2[i];
    magnitude1 += vector1[i] ** 2;
    magnitude2 += vector2[i] ** 2;
  }

  magnitude1 = Math.sqrt(magnitude1);
  magnitude2 = Math.sqrt(magnitude2);

  if (magnitude1 === 0 || magnitude2 === 0) {
    return 0;
  }

  return dotProduct / (magnitude1 * magnitude2);
}
