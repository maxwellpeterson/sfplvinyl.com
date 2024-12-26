import { redirect, type LoaderFunctionArgs } from "@remix-run/cloudflare";
import { setupSessionStorage } from "~/lib/session";
import {
  Await,
  Form,
  useLoaderData,
  useRevalidator,
  useSearchParams,
  useSubmit,
} from "@remix-run/react";
import { z } from "zod";
import { Suspense } from "react";
import { Album, meta, searchParams } from "~/lib/util";
import { SpotifyClient } from "~/lib/spotify";
import { LogoutButton } from "~/components/LogoutButton";
import { AlbumRow } from "~/components/AlbumRow";
import { AlbumRowLoading } from "~/components/AlbumRowLoading";
import { getTopAlbums } from "~/lib/search";

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

  const cacheKey = `${user.uri}|${parsed.data.time_range}`;
  const cached: Album[] | null = await context.cloudflare.env.RESULT_CACHE.get(
    cacheKey,
    "json",
  );
  if (cached) {
    return {
      user: { name: user.name },
      albums: cached,
    };
  }

  const spotify = new SpotifyClient(context.cloudflare.env, user.credentials);
  return {
    user: { name: user.name },
    albums: getTopAlbums({
      env: context.cloudflare.env,
      spotify,
      time_range: parsed.data.time_range,
    }).then((albums) => {
      // Update session credentials in case Spotify API calls triggered an
      // access token refresh.
      session.set("user", { ...user, credentials: spotify.credentials });
      context.cloudflare.ctx.waitUntil(commitSession(session));
      // Cache search results for the current time range for one hour.
      context.cloudflare.ctx.waitUntil(
        context.cloudflare.env.RESULT_CACHE.put(
          cacheKey,
          JSON.stringify(albums),
          {
            expirationTtl: 60 * 60,
          },
        ),
      );
      return albums;
    }),
  };
};

const defaultTimeRange = "short_term";
const SearchParamsSchema = z.object({
  time_range: z
    .enum(["short_term", "medium_term", "long_term"])
    .default(defaultTimeRange),
});

export default function Search() {
  const { user, albums } = useLoaderData<typeof loader>();
  const [searchParams] = useSearchParams();
  const revalidator = useRevalidator();
  const submit = useSubmit();

  const currentTimeRange = searchParams.get("time_range") || defaultTimeRange;

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
              <select
                name="time_range"
                value={currentTimeRange}
                // Include stub handler to prevent angry warning about setting
                // value without onChange.
                onChange={() => {}}
              >
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
          key={currentTimeRange + revalidator.state}
          fallback={
            <>
              {[1, 2, 3, 4, 5].map((i) => (
                <AlbumRowLoading key={i} />
              ))}
            </>
          }
        >
          <Await
            resolve={albums}
            errorElement={
              <div className="md:col-start-2 border-b md:border-none px-6 py-12 flex flex-col items-center">
                <div className="w-min">
                  <div className="pb-2 text-lg text-nowrap">
                    Oh no! Something went wrong.
                  </div>
                  <button
                    className="w-full p-4 font-medium bg-gray-200"
                    onClick={() => revalidator.revalidate()}
                  >
                    Retry
                  </button>
                </div>
              </div>
            }
          >
            {(albums) => (
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
