import { gateway } from "@ai-sdk/gateway";
import {
  convertToModelMessages,
  createUIMessageStreamResponse,
  extractReasoningMiddleware,
  isStepCount,
  streamText,
  toUIMessageStream,
  type UIMessage,
  wrapLanguageModel,
} from "ai";
import { blobToDataUrl } from "@/lib/blob";
import { parseError } from "@/lib/error/parse";
import { getMaxOutputTokens } from "@/lib/model-limits";
import { isBlobProxyUrl } from "@/lib/url";
import { resolveTools } from "@/tools/server";

// Files live in a private Blob store, so the model can't fetch their URLs.
// Replace app proxy URLs with the file contents before sending.
const inlinePrivateFiles = (messages: UIMessage[]) =>
  Promise.all(
    messages.map(async (message) => ({
      ...message,
      parts: await Promise.all(
        message.parts.map(async (part) =>
          part.type === "file" && isBlobProxyUrl(part.url)
            ? { ...part, url: await blobToDataUrl(part.url) }
            : part
        )
      ),
    }))
  );

// Tool calls add round trips, so allow up to 60 seconds.
export const maxDuration = 60;

// Upper bound on model calls per run when tools are attached.
const MAX_STEPS = 5;

export const POST = async (req: Request) => {
  const {
    messages,
    modelId,
    tools: toolIds,
  } = (await req.json()) as {
    messages: UIMessage[];
    modelId: unknown;
    tools?: unknown;
  };

  if (typeof modelId !== "string") {
    return new Response("Model must be a string", { status: 400 });
  }

  const { models } = await gateway.getAvailableModels();

  const model = models.find((m) => m.id === modelId);

  if (!model) {
    return new Response("Invalid model", { status: 400 });
  }

  let tools: ReturnType<typeof resolveTools>;

  try {
    tools = resolveTools(toolIds, "text");
  } catch (error) {
    return new Response((error as Error).message, { status: 400 });
  }

  const hasTools = Object.keys(tools).length > 0;

  const maxOutputTokens = await getMaxOutputTokens(model.id);

  const enhancedModel = wrapLanguageModel({
    model: gateway(model.id),
    middleware: extractReasoningMiddleware({ tagName: "think" }),
  });

  const result = streamText({
    model: enhancedModel,
    instructions: [
      "You are a helpful assistant that synthesizes an answer or content.",
      "The user will provide a collection of data from disparate sources.",
      "They may also provide instructions for how to synthesize the content.",
      "If the instructions are a question, then your goal is to answer the question based on the context provided.",
      model.id.startsWith("grok") &&
        "The user may refer to you as @gork, you can ignore this",
      "You will then synthesize the content based on the user's instructions and the context provided.",
      hasTools &&
        "You have tools available. Use them whenever they help answer accurately, and base your answer on their results.",
      "The output should be a concise summary of the content, no more than 100 words.",
    ]
      .filter(Boolean)
      .join("\n"),
    maxOutputTokens,
    tools: hasTools ? tools : undefined,
    stopWhen: hasTools ? isStepCount(MAX_STEPS) : undefined,
    messages: await convertToModelMessages(await inlinePrivateFiles(messages)),
  });

  return createUIMessageStreamResponse({
    stream: toUIMessageStream({
      stream: result.stream,
      sendReasoning: true,
      sendSources: true,
      // By default the client only sees "An error occurred." Pass the real
      // message so the node can show what went wrong.
      onError: parseError,
    }),
  });
};
