import { ActionFunctionArgs, redirect } from "@remix-run/cloudflare";
import { setupSessionStorage } from "~/lib/session";

export const action = async ({ request, context }: ActionFunctionArgs) => {
  const { getSession, destroySession } = setupSessionStorage(
    context.cloudflare.env,
  );
  const session = await getSession(request.headers.get("Cookie"));
  return redirect("/", {
    headers: {
      "Set-Cookie": await destroySession(session),
    },
  });
};
