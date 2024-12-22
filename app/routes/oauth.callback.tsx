import { LoaderFunctionArgs, redirect } from "@remix-run/server-runtime";
import { z } from "zod";
import { createStateCookie } from "~/session";
import { createSession } from "~/spotify";
import { searchParams } from "~/util";

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
      ["Set-Cookie", await stateCookie.serialize(undefined, { maxAge: 0 })],
      ["Set-Cookie", await createSession(context.cloudflare.env, data.code)],
    ],
  });
}

const CallbackParamsSchema = z.object({
  code: z.string(),
  state: z.string(),
});
