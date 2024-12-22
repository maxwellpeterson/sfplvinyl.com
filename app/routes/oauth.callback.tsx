import { LoaderFunctionArgs, redirect } from "@remix-run/server-runtime";
import { z } from "zod";
import { createStateCookie } from "~/lib/session";
import { createSession } from "~/lib/spotify";
import { searchParams } from "~/lib/util";

export async function loader({ request, context }: LoaderFunctionArgs) {
  const { data, success } = CallbackParamsSchema.safeParse(
    searchParams(request),
  );
  const stateCookie = createStateCookie(context.cloudflare.env);
  const state = await stateCookie.parse(request.headers.get("Cookie"));
  if (!success || state !== data.state) {
    return redirect("/");
  }
  return redirect("/search", {
    headers: [
      // Clear the state cookie since we're done with it.
      ["Set-Cookie", await stateCookie.serialize(undefined, { maxAge: 0 })],
      [
        "Set-Cookie",
        await createSession(context.cloudflare.env, data.code).catch(() => {
          throw redirect("/");
        }),
      ],
    ],
  });
}

const CallbackParamsSchema = z.object({
  code: z.string(),
  state: z.string(),
});
