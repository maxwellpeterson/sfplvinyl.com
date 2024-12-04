import {
  data,
  redirect,
  type LoaderFunctionArgs,
  type MetaFunction,
} from "@remix-run/cloudflare";
import { setupSessionStorage } from "~/session";
import { Await, Form, useLoaderData } from "@remix-run/react";
import { z } from "zod";
import { Suspense } from "react";
import { Album } from "~/util";
import { SpotifyClient } from "~/spotify";

import Skeleton from "react-loading-skeleton";
import "react-loading-skeleton/dist/skeleton.css";

export const meta: MetaFunction = () => {
  return [
    { title: "New Remix App" },
    { name: "description", content: "Welcome to Remix!" },
  ];
};

export const loader = async ({ request, context }: LoaderFunctionArgs) => {
  const { getSession, commitSession } = setupSessionStorage(
    context.cloudflare.env
  );
  const session = await getSession(request.headers.get("Cookie"));
  const user = session.get("user");
  if (!user) {
    // User needs to sign in with Spotify.
    return redirect("/oauth");
  }
  const spotify = new SpotifyClient(context.cloudflare.env, user.credentials);
  const response = await spotify.get(
    "/me/top/tracks?limit=50&time_range=long_term"
  );

  // Update session credentials in case Spotify API calls triggered a credential
  // refresh.
  session.set("user", { ...user, credentials: spotify.credentials });
  return data(
    {
      user: { name: user.name },
      albums: getTopAlbums(
        context.cloudflare.env,
        TopTracksResponseSchema.parse(response)
      ),
    },
    {
      headers: {
        "Set-Cookie": await commitSession(session),
      },
    }
  );
};

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
          })
        ),
        images: z.array(
          z.object({
            url: z.string(),
            height: z.number(),
            width: z.number(),
          })
        ),
        release_date: z.string(),
        album_type: z.enum(["album", "single", "compilation"]),
      }),
    })
  ),
});
type TopTracksResponse = z.infer<typeof TopTracksResponseSchema>;
const MAX_TOP_TRACKS = 3;
const trackIndicators = ["🥇", "🥈", "🥉"];

async function getTopAlbums(
  env: Env,
  { items }: TopTracksResponse
): Promise<Album[]> {
  // TODO: remove!
  await new Promise((resolve) => setTimeout(resolve, 5000));
  const albums = items.reduce((acc, track) => {
    const existing = acc.find((album) => album.uri === track.album.uri);
    if (existing !== undefined) {
      if (existing.topTracks.length < MAX_TOP_TRACKS) {
        existing.topTracks.push(track);
      }
    } else {
      acc.push({
        uri: track.album.uri,
        name: track.album.name,
        artists: track.album.artists,
        topTracks: [track],
        imageUrl: track.album.images.find((image) => image.width === 64)!.url,
        year: track.album.release_date.split("-")[0],
        kind: track.album.album_type,
      });
    }
    return acc;
  }, [] as Album[]);

  // for (const album of albums) {
  //   const sfplId = await getSfplId(env, album);
  //   if (sfplId !== null) {
  //     album.sfplId = sfplId;
  //   }
  // }
  return albums;
}

export default function Index() {
  const { user, albums } = useLoaderData<typeof loader>();

  return (
    <div>
      <div className="flex">Welcome {user.name}!</div>
      <Form method="post" action="/oauth/clear">
        <button>Log Out</button>
      </Form>
      <div>
        <table className="w-full text-sm text-left rtl:text-right text-gray-500 dark:text-gray-400">
          <thead className="text-xs text-gray-700 uppercase bg-gray-50 dark:bg-gray-700 dark:text-gray-400">
            <tr>
              <th scope="col" className="w-1/3 px-6 py-3">
                Album
              </th>
              <th scope="col" className="w-1/3 px-6 py-3">
                Top Tracks
              </th>
              <th scope="col" className="w-1/3 px-6 py-3">
                Availability
              </th>
            </tr>
          </thead>
          <tbody>
            <Suspense
              fallback={
                <>
                  {[1, 2, 3].map((i) => (
                    <AlbumRowLoading key={i} />
                  ))}
                </>
              }
            >
              <Await resolve={albums}>
                {(albums) => (
                  <>
                    {albums.map((album) => (
                      <AlbumRow
                        key={album.uri}
                        cover={<img src={album.imageUrl} alt={album.name} />}
                        name={album.name}
                        artists={album.artists
                          .map((artist) => artist.name)
                          .join(", ")}
                        year={album.year}
                        tracks={album.topTracks.map(
                          ({ name }, i) => `${trackIndicators[i]} ${name}`
                        )}
                      />
                    ))}
                  </>
                )}
              </Await>
            </Suspense>
          </tbody>
        </table>
      </div>
    </div>
  );
}

type AlbumRowProps = {
  cover: React.ReactNode;
  name: React.ReactNode;
  artists: React.ReactNode;
  year: React.ReactNode;
  tracks: React.ReactNode[];
};

function AlbumRow({ cover, name, artists, year, tracks }: AlbumRowProps) {
  return (
    <tr className="bg-white border-b dark:bg-gray-800 dark:border-gray-700">
      <td className="flex gap-2 px-6 py-4">
        {cover}
        <div className="flex flex-col flex-auto">
          <div className="font-semibold text-gray-700 dark:text-white">
            {name}
          </div>
          <div>{artists}</div>
          <div>{year}</div>
        </div>
      </td>
      <td className="align-top px-6 py-4">
          <ol>
            {tracks.slice(0, 3).map((track, i) => (
              <li key={i} className="w-full">
                {track}
              </li>
            ))}
          </ol>
      </td>
      <td className="px-6 py-4">
        {/* {album.sfplId === undefined ? ( */}
        Not Available
        {/* ) : (
                          <a
                            href={`https://sfpl.bibliocommons.com/v2/record/${album.sfplId}`}
                            rel="noreferrer"
                            target="_blank"
                          >
                            Available!
                          </a>
                        )} */}
      </td>
    </tr>
  );
}

function AlbumRowLoading() {
  return (
    <AlbumRow
      cover={<Skeleton width="64px" height="64px" />}
      name={<Skeleton width="75%" />}
      artists={<Skeleton width="50%" />}
      year={<Skeleton width="25%" />}
      tracks={[
        <Skeleton key={1} width="50%" />,
        <Skeleton key={2} width="40%" />,
        <Skeleton key={3} width="50%" />,
      ]}
    />
  );
}
