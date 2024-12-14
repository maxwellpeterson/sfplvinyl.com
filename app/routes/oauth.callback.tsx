import { LoaderFunctionArgs, redirect } from "@remix-run/server-runtime";
import { z } from "zod";
import { createSession } from "~/spotify";
import { searchParams } from "~/util";

export async function loader({ request, context }: LoaderFunctionArgs) {
  const { code } = CallbackParamsSchema.parse(searchParams(request));
  return redirect("/", {
    headers: {
      "Set-Cookie": await createSession(context.cloudflare.env, code),
    },
  });
}

const CallbackParamsSchema = z.object({
  code: z.string(),
});
