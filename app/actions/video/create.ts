"use server";

import { gateway } from "@ai-sdk/gateway";
import { experimental_generateVideo as generateVideo } from "ai";
import { readBlob, writeBlob } from "@/lib/blob";
import { parseError } from "@/lib/error/parse";

interface GenerateVideoActionProps {
  modelId: string;
  prompt: string;
  image?: string;
}

export const generateVideoAction = async ({
  modelId,
  prompt,
  image,
}: GenerateVideoActionProps): Promise<
  | {
      url: string;
      type: string;
    }
  | {
      error: string;
    }
> => {
  try {
    const imageData = image ? (await readBlob(image)).data : undefined;

    const result = await generateVideo({
      model: gateway.videoModel(modelId),
      prompt: imageData ? { image: imageData, text: prompt } : prompt,
    });

    const url = await writeBlob(result.video.uint8Array, "mp4", "video/mp4");

    return {
      url,
      type: "video/mp4",
    };
  } catch (error) {
    const message = parseError(error);

    return { error: message };
  }
};
