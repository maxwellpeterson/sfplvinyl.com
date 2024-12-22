import { data, redirect, type LoaderFunctionArgs } from "@remix-run/cloudflare";
import { setupSessionStorage } from "~/lib/session";
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
import { Album, getEmbeddingText, meta, searchParams } from "~/lib/util";
import { SpotifyClient } from "~/lib/spotify";
import { LogoutButton } from "~/components/LogoutButton";
import { AlbumRow } from "~/components/AlbumRow";
import { AlbumRowLoading } from "~/components/AlbumRowLoading";

export { meta };

export const loader = async ({ request, context }: LoaderFunctionArgs) => {
  const { getSession, commitSession, destroySession } = setupSessionStorage(
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
  const response = await spotify
    .get(
      `/me/top/tracks?` +
        new URLSearchParams({
          limit: "50",
          time_range: parsed.data.time_range,
        }),
    )
    .catch(async () => {
      throw redirect("/", {
        headers: { "Set-Cookie": await destroySession(session) },
      });
    });

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

const defaultTimeRange = "short_term";
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
        album_type: z.string(),
        external_urls: z.object({
          spotify: z.string(),
        }),
      }),
    }),
  ),
});
type TopTracksResponse = z.infer<typeof TopTracksResponseSchema>;

async function getTopAlbums(
  env: Env,
  { items }: TopTracksResponse,
): Promise<Album[]> {
  const albums = items
    .filter((track) => track.album.album_type === "album")
    .reduce((acc, track) => {
      const existing = acc.find((album) => album.uri === track.album.uri);
      if (existing !== undefined) {
        existing.topTracks.push(track);
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

  const embeddings = await env.AI.run("@cf/baai/bge-base-en-v1.5", {
    text: albums.map(({ name, artists }) =>
      getEmbeddingText({ name, artists: artists.map((artist) => artist.name) }),
    ),
  });

  await Promise.all(
    embeddings.data.map(async (embedding, i) => {
      const {
        matches: [match],
      } = await env.SFPL_CATALOG_INDEX.query(embedding, { topK: 1 });
      if (match.score >= 0.88) {
        albums[i].sfplId = match.id;
      }
    }),
  );
  // Return albums available at the SFPL first.
  albums.sort((a, b) => Number(Boolean(b.sfplId)) - Number(Boolean(a.sfplId)));

  return albums;
}

export default function Search() {
  const { user, albums } = useLoaderData<typeof loader>();
  const [searchParams] = useSearchParams();
  const navigation = useNavigation();
  const submit = useSubmit();
  const currentTimeRange = searchParams.get("time_range") || defaultTimeRange;
  // We want the album list to fall back into a suspended state as soon as the
  // time range is changed and navigation begins, which we force to happen by
  // changing the suspense key. Importantly, the suspense key shouldn't change
  // when navigation completes (but the data is still loading), otherwise the
  // fallback component will be re-mounted and the loading animation will be
  // awkwardly interrupted.
  const suspenseKey =
    new URLSearchParams(navigation.location?.search).get("time_range") ||
    currentTimeRange;
  // The albums list doesn't turn back into a promise until navigation
  // completes, but we want to fall back into a suspended state as soon as
  // navigation begins. We achieve this by suspending based on a second promise
  // that resolves when navigation completes, at which point the albums list
  // becomes the suspending promise.
  const navigationPromise =
    navigation.state === "loading" && navigation.location.pathname === "/search"
      ? new Promise(() => {})
      : // : Promise.resolve();
        Promise.reject();

  return (
    <div className="w-full">
      <div className="flex p-4 border-b">
        <div className="flex-auto">
          <div className="text-2xl font-bold">Hi {user.name}!</div>
          <div>
            <span>Find top tracks from the past </span>
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
        <LogoutButton className="hidden md:block" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 text-sm text-gray-500 dark:text-gray-400">
        {["ALBUM", "TOP TRACKS", "AVAILABILITY"].map((header) => (
          <div
            key={header}
            className="hidden md:block px-6 py-3 border-b text-xs font-bold bg-gray-50 dark:bg-gray-900"
          >
            {header}
          </div>
        ))}
        <Suspense
          key={suspenseKey}
          fallback={
            <>
              {[1, 2, 3, 4, 5].map((i) => (
                <AlbumRowLoading key={i} />
              ))}
            </>
          }
        >
          <Await
            resolve={Promise.all([albums, navigationPromise])}
            errorElement="Oh no!"
          >
            {([albums]) => (
              <>
                {albums.map((album) => (
                  <AlbumRow
                    key={album.uri}
                    cover={
                      <a href={album.img.href} rel="noreferrer" target="_blank">
                        <img
                          src={album.img.src}
                          alt={album.name}
                          className="w-16-h-16"
                        />
                      </a>
                    }
                    name={album.name}
                    artists={album.artists
                      .map((artist) => artist.name)
                      .join(", ")}
                    year={album.year}
                    tracks={album.topTracks
                      .slice(0, 3)
                      .map(({ name }, i) => `${["🥇", "🥈", "🥉"][i]} ${name}`)}
                    availability={
                      album.sfplId ? (
                        <a
                          href={`https://sfpl.bibliocommons.com/v2/record/${album.sfplId}`}
                          rel="noreferrer"
                          target="_blank"
                        >
                          <span className="underline underline-offset-2">
                            Available at the San Francisco Public Library
                          </span>{" "}
                          🎉
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
      <LogoutButton className="md:hidden p-6" />
    </div>
  );
}
