import { createRequestHandler, type ServerBuild } from "react-router";
// @ts-ignore This file won't exist if it hasn't yet been built
import * as build from "./build/server"; // eslint-disable-line import/no-unresolved
import { getLoadContext } from "./load-context";
import { RefreshCatalog } from "~/workflows/RefreshCatalog";

export { RefreshCatalog };

const handleRequest = createRequestHandler(build as unknown as ServerBuild);

export default {
  async fetch(request, env, ctx) {
    try {
      const loadContext = getLoadContext({
        request,
        context: {
          cloudflare: {
            cf: request.cf,
            ctx,
            caches,
            env,
          },
        },
      });
      return await handleRequest(request, loadContext);
    } catch (error) {
      console.log(error);
      return new Response("An unexpected error occurred", { status: 500 });
    }
  },
  async scheduled(event, env) {
    console.log("Kicking off catalog refresh workflow...");
    const instance = await env.REFRESH_CATALOG.create();
    console.log(`Created workflow instance: ${instance.id}`);
  },
} satisfies ExportedHandler<Env>;
