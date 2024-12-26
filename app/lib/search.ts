import { SpotifyClient } from "./spotify";
import { Album, cosineSimilarity, getEmbeddingText } from "./util";
import { z } from "zod";

export async function getAlbums({
  env,
  spotify,
  time_range,
}: {
  env: Env;
  spotify: SpotifyClient;
  time_range: "short_term" | "medium_term" | "long_term";
}): Promise<Album[]> {
  const response = await spotify.get(
    `/me/top/tracks?` +
      new URLSearchParams({
        limit: "50",
        time_range,
      }),
  );
  const { items } = TopTracksResponseSchema.parse(response);

  const tracks = items.filter((track) => track.album.album_type === "album");
  const embeddings = await env.AI.run("@cf/baai/bge-base-en-v1.5", {
    text: tracks.map(({ album: { name, artists } }) =>
      getEmbeddingText({ name, artists: artists.map((artist) => artist.name) }),
    ),
  });
  const albumEmbeddings = embeddings.data.reduce(
    (acc, embedding, i) => ({
      ...acc,
      [tracks[i].album.uri]: embedding,
    }),
    {} as Record<string, number[]>,
  );

  const albums = tracks.reduce((acc, track) => {
    const existingAlbum = acc.find(
      (album) =>
        cosineSimilarity(
          albumEmbeddings[album.uri],
          albumEmbeddings[track.album.uri],
        ) >= 0.88,
    );
    if (existingAlbum) {
      const existingTrack = existingAlbum.topTracks.find(
        (topTrack) => topTrack.name === track.name,
      );
      if (!existingTrack) {
        existingAlbum.topTracks.push(track);
      }
    } else {
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
      const {
        matches: [match],
      } = await env.SFPL_CATALOG_INDEX.query(albumEmbeddings[album.uri], {
        topK: 1,
      });
      if (match.score >= 0.88) {
        album.sfplId = match.id;
      }
    }),
  );
  // Return albums available at the SFPL first.
  albums.sort((a, b) => Number(Boolean(b.sfplId)) - Number(Boolean(a.sfplId)));

  return albums;
}

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
