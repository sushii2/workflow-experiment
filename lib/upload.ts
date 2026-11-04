import { upload } from "@vercel/blob/client";
import { nanoid } from "nanoid";
import { toBlobProxyUrl } from "@/lib/url";

export const uploadFile = async (file: File) => {
  const extension = file.name.split(".").pop();
  const name = `${nanoid()}.${extension}`;

  const blob = await upload(name, file, {
    access: "private",
    handleUploadUrl: "/api/upload",
  });

  return {
    url: toBlobProxyUrl(blob.pathname),
    type: file.type,
  };
};
