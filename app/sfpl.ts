import { z } from "zod";
import { Album } from "~/util";

const CatalogSearchResponse = z.object({
  entities: z
    .object({
      bibs: z
        .record(
          z.string(),
          z.object({
            id: z.string(),
          })
        )
        .optional(),
    })
    .optional(),
});

type AlbumMapping =
  | {
      success: false;
    }
  | { success: true; sfplId: string };

export async function getSfplId(
  env: Env,
  album: Album
): Promise<string | null> {
  if (album.kind === "single" || album.artists.length === 0) {
    return null;
  }

  const existing = await env.SPOTIFY_TO_SFPL.get<AlbumMapping>(
    album.uri,
    "json"
  );
  if (existing !== null) {
    if (existing.success && existing.sfplId) {
      return existing.sfplId;
    } else if (album.name === formatAlbumName(album.name)) {
      // We cached an unsuccessful lookup.
      return null;
    }
  }
  console.log(`Looking up ${album.name}`)

  const body = JSON.stringify({
    query: `${album.artists[0].name} ${formatAlbumName(album.name)}`,
    f_FORMAT: "LP", // Only return vinyl records.
    searchType: "keyword",
  });
  const response = await fetch(
    "https://gateway.bibliocommons.com/v2/libraries/sfpl/bibs/search?locale=en-US",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "curl/7.81.0",
      },
      body,
    }
  );
  if (!response.ok) {
    throw new Error(
      `Bad response from Bibliocommons API (${
        response.status
      }): ${await response.text()}`
    );
  }
  const results = CatalogSearchResponse.parse(await response.json());
  const ids = [...Object.keys(results.entities?.bibs ?? {})];
  if (ids.length > 0) {
    const sfplId = ids[0];
    await env.SPOTIFY_TO_SFPL.put(
      album.uri,
      JSON.stringify({ success: true, sfplId })
    );
    return sfplId;
  }
  await env.SPOTIFY_TO_SFPL.put(album.uri, JSON.stringify({ success: false }), {
    expirationTtl: 24 * 60 * 60,
  });
  return null;
}

function formatAlbumName(albumName: string): string {
  // Remove anything after an em dash (e.g. "Born To Die – Paradise Edition
  // (Special Version)" becomes "Born to Die").
  const formatted = albumName.split("–")[0].trim();
  // Remove parenthetical qualifiers at the end of album names (e.g.
  // "Ultraviolence (Deluxe)" becomes "Ultraviolence").
  return formatted.replace(/\(.*\)$/, "").trim();
}
