import { ActionFunctionArgs, redirect } from "@remix-run/cloudflare";
import { setupSessionStorage } from "~/session";

export const action = async ({
  request,context
}: ActionFunctionArgs) => {
  const { getSession, destroySession } = setupSessionStorage(
    context.cloudflare.env
  );
  const session = await getSession(
    request.headers.get("Cookie")
  );
  return redirect("/oauth", {
    headers: {
      "Set-Cookie": await destroySession(session),
    },
  });
};