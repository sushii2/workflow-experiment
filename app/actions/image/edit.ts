"use server";

import { gateway } from "@ai-sdk/gateway";
import { generateImage } from "ai";
import { readBlob, writeBlob } from "@/lib/blob";
import { parseError } from "@/lib/error/parse";

interface EditImageActionProps {
  images: {
    url: string;
    type: string;
  }[];
  modelId: string;
  instructions?: string;
}

export const editImageAction = async ({
  images,
  instructions,
  modelId,
}: EditImageActionProps): Promise<
  | {
      url: string;
      type: string;
      description: string;
    }
  | {
      error: string;
    }
> => {
  try {
    const defaultPrompt =
      images.length > 1
        ? "Create a variant of the image."
        : "Create a single variant of the images.";

    const prompt =
      !instructions || instructions === "" ? defaultPrompt : instructions;

    const imageData = await Promise.all(
      images.map(async (img) => (await readBlob(img.url)).data)
    );

    const result = await generateImage({
      model: gateway.imageModel(modelId),
      prompt: {
        images: imageData,
        text: prompt,
      },
    });

    const { image } = result;

    const url = await writeBlob(image.uint8Array, "png", "image/png");

    return {
      url,
      type: "image/png",
      description: instructions ?? defaultPrompt,
    };
  } catch (error) {
    const message = parseError(error);

    return { error: message };
  }
};
