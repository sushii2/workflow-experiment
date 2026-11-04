// Per-model token limits from the AI Gateway's public model catalog.
//
// Without an explicit max output, some providers default it to the model's
// entire context window, leaving no room for the prompt. For example,
// alibaba/qwen-3-30b (40,960-token context) then fails with "maximum context
// length is 40960 tokens. However, you requested 40960 output tokens".

const MODELS_URL = "https://ai-gateway.vercel.sh/v1/models";

// Answers are short (~100 words), but reasoning models spend output tokens on
// thinking too, so leave generous headroom.
const DEFAULT_MAX_OUTPUT_TOKENS = 8192;

// Used if the catalog can't be fetched. Small enough for the smallest
// context windows in the catalog (8,000 tokens).
const FALLBACK_MAX_OUTPUT_TOKENS = 4000;

interface CatalogModel {
  id: string;
  context_window?: number;
  max_tokens?: number;
}

const fetchCatalog = async (): Promise<CatalogModel[]> => {
  const response = await fetch(MODELS_URL, {
    // Limits rarely change; cache for an hour.
    next: { revalidate: 3600 },
    signal: AbortSignal.timeout(5000),
  });

  if (!response.ok) {
    throw new Error(`Model catalog request failed (${response.status})`);
  }

  const { data } = (await response.json()) as { data: CatalogModel[] };

  return data;
};

/**
 * Max output tokens to request for a model: the default, but never more than
 * the model's own output limit or half its context window.
 */
export const getMaxOutputTokens = async (modelId: string): Promise<number> => {
  try {
    const model = (await fetchCatalog()).find((m) => m.id === modelId);

    if (!model) {
      return FALLBACK_MAX_OUTPUT_TOKENS;
    }

    return Math.min(
      DEFAULT_MAX_OUTPUT_TOKENS,
      model.max_tokens ?? Number.POSITIVE_INFINITY,
      model.context_window
        ? Math.floor(model.context_window / 2)
        : Number.POSITIVE_INFINITY
    );
  } catch {
    return FALLBACK_MAX_OUTPUT_TOKENS;
  }
};
