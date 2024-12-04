import { LoaderFunctionArgs, redirect } from "@remix-run/server-runtime";
import { z } from "zod";
import { createSession } from "~/spotify";

export async function loader({ request, context }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const { code } = CallbackParamsSchema.parse(
    Object.fromEntries(url.searchParams.entries())
  );
  return redirect("/", {
    headers: {
      "Set-Cookie": await createSession(context.cloudflare.env, code),
    },
  });
}

const CallbackParamsSchema = z.object({
  code: z.string(),
});
