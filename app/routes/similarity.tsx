import { LoaderFunctionArgs, redirect } from "@remix-run/cloudflare";
import { Form, useLoaderData } from "@remix-run/react";
import { z } from "zod";
import { setupSessionStorage } from "~/session";
import { searchParams } from "~/util";

export const loader = async ({ request, context }: LoaderFunctionArgs) => {
  const { getSession } = setupSessionStorage(context.cloudflare.env);
  const session = await getSession(request.headers.get("Cookie"));
  const user = session.get("user");
  if (!user) {
    // User needs to sign in with Spotify.
    return redirect("/");
  }

  const parsed = SimilarityParamsSchema.safeParse(searchParams(request));
  if (!parsed.success) {
    return { similarity: undefined };
  } 

  const embeddings = await context.cloudflare.env.AI.run(
    "@cf/baai/bge-base-en-v1.5",
    {
      text: [parsed.data.left, parsed.data.right],
    }
  );

  return {
    similarity: cosineSimilarity(embeddings.data[0], embeddings.data[1]),
  };
};

const SimilarityParamsSchema = z
  .object({
    left: z.string().min(1),
    right: z.string().min(1),
  })

function cosineSimilarity(vector1: number[], vector2: number[]) {
  if (vector1.length !== vector2.length) {
    throw new Error("Vectors must have the same length");
  }

  let dotProduct = 0;
  let magnitude1 = 0;
  let magnitude2 = 0;

  for (let i = 0; i < vector1.length; i++) {
    dotProduct += vector1[i] * vector2[i];
    magnitude1 += vector1[i] ** 2;
    magnitude2 += vector2[i] ** 2;
  }

  magnitude1 = Math.sqrt(magnitude1);
  magnitude2 = Math.sqrt(magnitude2);

  if (magnitude1 === 0 || magnitude2 === 0) {
    return 0;
  }

  return dotProduct / (magnitude1 * magnitude2);
}

export default function Similarity() {
  const { similarity } = useLoaderData<typeof loader>();
  return (
    <div className="grid h-screen items-center justify-center">
      <Form className="flex gap-2">
        <input type="text" name="left"></input>
        <div>vs.</div>
        <input type="text" name="right"></input>
        <button>Compare!</button>
      </Form>
      <div>
        Similarity: {similarity ?? "N/A"}
      </div>
    </div>
  );
}