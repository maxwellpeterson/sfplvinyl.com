import {
  WorkflowEntrypoint,
  WorkflowStep,
  WorkflowEvent,
  // TODO: Why does this happen?
  // eslint-disable-next-line import/no-unresolved
} from "cloudflare:workers";
import { z } from "zod";
import { check, chunk, getEmbeddingText } from "~/util";

export class RefreshCatalog extends WorkflowEntrypoint<Env> {
  async run(event: WorkflowEvent<unknown>, step: WorkflowStep) {
    const { pages, albums } = await step.do(
      "fetch page 1 of search results from sfpl",
      async () => {
        const results = await getSearchResults({ page: 1 });
        return {
          pages: results.catalogSearch.pagination.pages,
          albums: flattenSearchResults(results),
        };
      },
    );

    for (let page = 2; page <= pages; page++) {
      const albumBatch = await step.do(
        `fetch page ${page} of search results from sfpl`,
        async () => {
          const results = await getSearchResults({ page });
          return flattenSearchResults(results);
        },
      );
      albums.push(...albumBatch);
    }

    const embeddings = [];
    for (const [i, batch] of chunk(albums, EMBEDDING_BATCH_SIZE).entries()) {
      const embeddingBatch = await step.do(
        `generate embeddings for batch ${i} of search results`,
        async () => {
          const text = batch.map(({ briefInfo: { title, authors } }) =>
            getEmbeddingText({ name: title, artists: authors }),
          );
          const embeddings = await this.env.AI.run(
            "@cf/baai/bge-base-en-v1.5",
            {
              text,
            },
          );
          return embeddings.data.map((values, i) => ({
            id: batch[i].id,
            values,
            metadata: {
              text: text[i],
            },
          }));
        },
      );
      embeddings.push(...embeddingBatch);
    }

    for (const [i, batch] of chunk(embeddings, VECTOR_BATCH_SIZE).entries()) {
      await step.do(
        `insert batch ${i} of vectors into search index`,
        async () => {
          return this.env.SFPL_CATALOG_INDEX.upsert(batch);
        },
      );
    }
  }
}

async function getSearchResults({ page }: { page: number }) {
  const url =
    "https://gateway.bibliocommons.com/v2/libraries/sfpl/bibs/search?locale=en-US";
  const body = JSON.stringify({
    query: "LP",
    f_FORMAT: "LP",
    searchType: "keyword",
    page: page.toString(),
  });
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent": "curl/7.81.0",
    },
    body,
  });
  await check(url, response);
  return SearchResponseSchema.parse(await response.json());
}

function flattenSearchResults(results: z.infer<typeof SearchResponseSchema>) {
  return Object.values(results?.entities?.bibs ?? {});
}

const SearchResponseSchema = z.object({
  catalogSearch: z.object({
    pagination: z.object({
      pages: z.number(),
    }),
  }),
  entities: z
    .object({
      bibs: z
        .record(
          z.string(),
          z.object({
            id: z.string(),
            briefInfo: z.object({
              title: z.string(),
              authors: z.array(z.string()),
            }),
          }),
        )
        .optional(),
    })
    .optional(),
});

/**
 * Maximum number of embeddings our model can generate at once.
 *
 * @see https://developers.cloudflare.com/workers-ai/models/bge-base-en-v1.5/#API%20Schemas
 */
const EMBEDDING_BATCH_SIZE = 100;

/**
 * Maximum number of embeddings Vectorize can upsert at once.
 *
 * @see https://developers.cloudflare.com/vectorize/platform/limits/
 */
const VECTOR_BATCH_SIZE = 1000;
