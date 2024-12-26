import { SpotifyClient } from "./spotify";
import { Album, cosineSimilarity, getEmbeddingText } from "./util";
import { z } from "zod";

/**
 * Returns a list of the user's top albums over the specified time range,
 * including information about the corresponding library LP if one exists.
 */
export async function getTopAlbums({
  env,
  spotify,
  time_range,
}: {
  env: Env;
  spotify: SpotifyClient;
  time_range: "short_term" | "medium_term" | "long_term";
}): Promise<Album[]> {
  // https://developer.spotify.com/documentation/web-api/reference/get-users-top-artists-and-tracks
  const response = await spotify.get(
    `/me/top/tracks?` +
      new URLSearchParams({
        limit: "50", // The maximum possible number of results.
        time_range,
      }),
  );
  const { items } = TopTracksResponseSchema.parse(response);

  // TODO: Singles are sometimes re-released on full albums, and we'd like to
  // remap these to their full albums if they exist. For now, we ignore them.
  const tracks = items.filter((track) => track.album.album_type === "album");
  const embeddings = await env.AI.run("@cf/baai/bge-base-en-v1.5", {
    text: tracks.map(({ album: { name, artists } }) =>
      getEmbeddingText({ name, artists: artists.map((artist) => artist.name) }),
    ),
  });
  const albumEmbedding = embeddings.data.reduce(
    (acc, embedding, i) => ({
      ...acc,
      [tracks[i].album.uri]: embedding,
    }),
    {} as Record<string, number[]>,
  );

  const albums = tracks.reduce((acc, track) => {
    // We use vector similarity instead of uri equality here to combine
    // re-releases of the same album. For example, "Unplugged (Live) by Eric
    // Clapton" and "Unplugged (Live) (Deluxe Edition) by Eric Clapton" should
    // be combined together into one entry.
    const existingAlbum = acc.find(
      (album) =>
        cosineSimilarity(
          albumEmbedding[album.uri],
          albumEmbedding[track.album.uri],
        ) >= similarityThreshold,
    );
    if (existingAlbum) {
      const existingTrack = existingAlbum.topTracks.find(
        (topTrack) => topTrack.name === track.name,
      );
      if (!existingTrack) {
        // We've got a new track on an existing album.
        existingAlbum.topTracks.push(track);
      }
    } else {
      // We've got a new album altogether.
      acc.push({
        uri: track.album.uri,
        name: track.album.name,
        artists: track.album.artists,
        topTracks: [track],
        year: track.album.release_date.split("-")[0],
        img: {
          src: track.album.images.find((image) => image.width === 64)!.url,
          href: track.album.external_urls.spotify,
        },
      });
    }
    return acc;
  }, [] as Album[]);

  await Promise.all(
    albums.map(async (album) => {
      // Run a vector search against the SFPL catalog to find a matching LP if
      // one exists.
      const {
        matches: [match],
      } = await env.SFPL_CATALOG_INDEX.query(albumEmbedding[album.uri], {
        topK: 1,
      });
      if (match.score >= similarityThreshold) {
        album.sfplId = match.id;
      }
    }),
  );
  // Return albums available at the SFPL first.
  albums.sort((a, b) => Number(Boolean(b.sfplId)) - Number(Boolean(a.sfplId)));

  return albums;
}

// https://developer.spotify.com/documentation/web-api/reference/get-users-top-artists-and-tracks
const TopTracksResponseSchema = z.object({
  items: z.array(
    z.object({
      uri: z.string(),
      name: z.string(),
      album: z.object({
        uri: z.string(),
        name: z.string(),
        artists: z.array(
          z.object({
            uri: z.string(),
            name: z.string(),
          }),
        ),
        images: z.array(
          z.object({
            url: z.string(),
            height: z.number(),
            width: z.number(),
          }),
        ),
        release_date: z.string(),
        album_type: z.string(),
        external_urls: z.object({
          spotify: z.string(),
        }),
      }),
    }),
  ),
});

/**
 * If two album embeddings have a cosine similarity value greater than or equal
 * to this threshold, we consider them equal.
 */
const similarityThreshold = 0.88;
