import { get, put } from "@vercel/blob";
import { nanoid } from "nanoid";
import { blobPathnameFromUrl, toBlobProxyUrl } from "@/lib/url";

/** Reads a private blob (referenced by its app proxy URL) into memory. */
export const readBlob = async (
  url: string
): Promise<{ data: Uint8Array; mediaType: string }> => {
  const pathname = blobPathnameFromUrl(url);
  const result = await get(pathname, { access: "private" });

  if (result?.statusCode !== 200) {
    throw new Error("File not found");
  }

  const buffer = await new Response(result.stream).arrayBuffer();

  return { data: new Uint8Array(buffer), mediaType: result.blob.contentType };
};

/** Writes a file to the private store and returns its app proxy URL. */
export const writeBlob = async (
  data: Uint8Array,
  extension: string,
  contentType: string
): Promise<string> => {
  const blob = await put(`${nanoid()}.${extension}`, Buffer.from(data), {
    access: "private",
    contentType,
  });

  return toBlobProxyUrl(blob.pathname);
};

/** Converts a proxy URL to a base64 data URL that AI models can read. */
export const blobToDataUrl = async (url: string): Promise<string> => {
  const { data, mediaType } = await readBlob(url);

  return `data:${mediaType};base64,${Buffer.from(data).toString("base64")}`;
};
