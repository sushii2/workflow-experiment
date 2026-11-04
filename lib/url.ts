/**
 * Files live in a private Vercel Blob store, so the browser can't load blob
 * URLs directly. Instead, files are referenced by an app-relative URL that is
 * served by `app/api/blob/[pathname]/route.ts`.
 */
export const BLOB_PROXY_PREFIX = "/api/blob/";

// Every file is stored as `<nanoid>.<extension>` at the store root. Allowing
// only that shape blocks path traversal and access to anything else.
const BLOB_PATHNAME_PATTERN = /^[A-Za-z0-9_-]{1,64}\.[A-Za-z0-9]{1,10}$/;

export const assertBlobPathname = (pathname: string): string => {
  if (!BLOB_PATHNAME_PATTERN.test(pathname)) {
    throw new Error("Invalid file pathname");
  }

  return pathname;
};

export const toBlobProxyUrl = (pathname: string): string =>
  `${BLOB_PROXY_PREFIX}${assertBlobPathname(pathname)}`;

export const isBlobProxyUrl = (input: string): boolean =>
  input.startsWith(BLOB_PROXY_PREFIX);

export const blobPathnameFromUrl = (input: string): string => {
  if (!isBlobProxyUrl(input)) {
    throw new Error("Invalid file URL");
  }

  return assertBlobPathname(input.slice(BLOB_PROXY_PREFIX.length));
};
