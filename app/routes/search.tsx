import { data, redirect, type LoaderFunctionArgs } from "@remix-run/cloudflare";
import { setupSessionStorage } from "~/session";
import {
  Await,
  Form,
  useLoaderData,
  useNavigation,
  useSearchParams,
  useSubmit,
} from "@remix-run/react";
import { z } from "zod";
import { Suspense } from "react";
import { Album, getEmbeddingText, meta, searchParams } from "~/util";
import { SpotifyClient } from "~/spotify";
import Skeleton from "react-loading-skeleton";
import "react-loading-skeleton/dist/skeleton.css";

const defaultTimeRange = "short_term";

export { meta };

export const loader = async ({ request, context }: LoaderFunctionArgs) => {
  const { getSession, commitSession } = setupSessionStorage(
    context.cloudflare.env,
  );
  const session = await getSession(request.headers.get("Cookie"));
  const user = session.get("user");
  if (!user) {
    // User needs to sign in with Spotify.
    return redirect("/");
  }

  const parsed = SearchParamsSchema.safeParse(searchParams(request));
  if (!parsed.success) {
    // Clear malformed search params.
    return redirect("/search");
  }

  const spotify = new SpotifyClient(context.cloudflare.env, user.credentials);
  const response = await spotify.get(
    `/me/top/tracks?` +
      new URLSearchParams({ limit: "50", time_range: parsed.data.time_range }),
  );

  // Update session credentials in case Spotify API calls triggered a credential
  // refresh.
  session.set("user", { ...user, credentials: spotify.credentials });
  return data(
    {
      user: { name: user.name },
      albums: getTopAlbums(
        context.cloudflare.env,
        TopTracksResponseSchema.parse(response),
      ),
    },
    {
      headers: {
        "Set-Cookie": await commitSession(session),
      },
    },
  );
};

const SearchParamsSchema = z.object({
  time_range: z
    .enum(["short_term", "medium_term", "long_term"])
    .default(defaultTimeRange),
});

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
        album_type: z.enum(["album", "single", "compilation"]),
      }),
    }),
  ),
});
type TopTracksResponse = z.infer<typeof TopTracksResponseSchema>;
const MAX_TOP_TRACKS = 3;
const trackIndicators = ["🥇", "🥈", "🥉"];

async function getTopAlbums(
  env: Env,
  { items }: TopTracksResponse,
): Promise<Album[]> {
  // TODO: remove!
  // await new Promise((resolve) => setTimeout(resolve, 1000));
  const albums = items
    .filter((track) => track.album.album_type === "album")
    .reduce((acc, track) => {
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

  const embeddings = await env.AI.run("@cf/baai/bge-base-en-v1.5", {
    text: albums.map(({ name, artists }) =>
      getEmbeddingText({ name, artists: artists.map((artist) => artist.name) }),
    ),
  });

  for (const [i, embedding] of embeddings.data.entries()) {
    const results = await env.SFPL_CATALOG_INDEX.query(embedding);
    if (results.matches.length > 0 && results.matches[0].score >= 0.88) {
      albums[i].sfplId = results.matches[0].id;
    }
  }

  return albums;
}

export default function Search() {
  const { user, albums } = useLoaderData<typeof loader>();
  const [searchParams] = useSearchParams();
  const navigation = useNavigation();
  const submit = useSubmit();
  const currentTimeRange = searchParams.get("time_range") || defaultTimeRange;
  // console.log(navigation.state + ":" + navigation.location?.search + ":" + currentTimeRange);
  const suspenseKey =
    navigation.location?.search ?? "?" + searchParams.toString();
  const navigationPromise =
    navigation.state === "loading" ? new Promise(() => {}) : Promise.resolve();
  console.log(`suspense key: ${suspenseKey}`);

  return (
    <div className="w-full">
      <div className="flex p-4">
        <div className="flex-auto">
          <div className="text-2xl font-bold">Hi {user.name}!</div>
          <div>
            <span>Find your top tracks from the past </span>
            <Form
              onChange={(event) => {
                event.preventDefault();
                submit(event.currentTarget);
              }}
              className="inline"
            >
              <select name="time_range" defaultValue={currentTimeRange}>
                <option id="short_term" value="short_term">
                  month
                </option>
                <option id="medium_term" value="medium_term">
                  6 months
                </option>
                <option id="long_term" value="long_term">
                  year
                </option>
              </select>
            </Form>
          </div>
        </div>
        <Form method="post" action="/oauth/clear" className="hidden md:block">
          <button className="h-full p-4 bg-green-300 dark:bg-green-600 font-medium text-center">
            Log Out
          </button>
        </Form>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 text-sm text-gray-500 dark:text-gray-400">
        {["ALBUM", "TOP TRACKS", "AVAILABILITY"].map((header) => (
          <div
            key={header}
            className="hidden md:block px-6 py-3 border-t text-xs font-bold bg-gray-50 dark:bg-gray-700"
          >
            {header}
          </div>
        ))}
        <Suspense
          key={suspenseKey}
          fallback={
            <>
              {[1, 2, 3].map((i) => (
                <AlbumRowLoading key={i} />
              ))}
            </>
          }
        >
          <Await resolve={Promise.all([albums, navigationPromise])}>
            {([albums]) => (
              <>
                {albums.map((album) => (
                  <AlbumRow
                    key={album.uri}
                    cover={
                      <img
                        src={album.imageUrl}
                        alt={album.name}
                        className="w-16-h-16"
                      />
                    }
                    name={album.name}
                    artists={album.artists
                      .map((artist) => artist.name)
                      .join(", ")}
                    year={album.year}
                    tracks={album.topTracks.map(
                      ({ name }, i) => `${trackIndicators[i]} ${name}`,
                    )}
                    availability={
                      album.sfplId ? (
                        <a
                          href={`https://sfpl.bibliocommons.com/v2/record/${album.sfplId}`}
                          rel="noreferrer"
                          target="_blank"
                        >
                          Available!
                        </a>
                      ) : (
                        <span className="italic">
                          Not available at the San Francisco Public Library
                        </span>
                      )
                    }
                  />
                ))}
              </>
            )}
          </Await>
        </Suspense>
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
  availability: React.ReactNode;
};

function AlbumRow({
  cover,
  name,
  artists,
  year,
  tracks,
  availability,
}: AlbumRowProps) {
  return (
    <>
      <div className="flex gap-2 px-6 py-4 border-t">
        {cover}
        <div className="flex flex-col flex-auto">
          <div className="font-semibold text-gray-700 dark:text-white">
            {name}
          </div>
          <div>{artists}</div>
          <div>{year}</div>
        </div>
      </div>
      <div className="align-top px-6 md:py-4 md:border-t">
        <div className="md:hidden pb-1 text-xs font-bold">TOP TRACKS</div>
        <ol>
          {tracks.slice(0, 3).map((track, i) => (
            <li key={i} className="w-full">
              {track}
            </li>
          ))}
        </ol>
      </div>
      <div className="px-6 py-4 md:border-t">{availability}</div>
    </>
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
      availability={<Skeleton />}
    />
  );
}
