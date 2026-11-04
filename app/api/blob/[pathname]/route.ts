import { get } from "@vercel/blob";
import { type NextRequest, NextResponse } from "next/server";
import { assertBlobPathname } from "@/lib/url";

// Files are served from the app's own origin, so a user-uploaded HTML or SVG
// file must never be able to run scripts here.
const SECURITY_HEADERS = {
  "Content-Security-Policy":
    "default-src 'none'; style-src 'unsafe-inline'; sandbox",
  "X-Content-Type-Options": "nosniff",
};

export const GET = async (
  request: NextRequest,
  { params }: { params: Promise<{ pathname: string }> }
) => {
  const { pathname } = await params;

  try {
    assertBlobPathname(pathname);
  } catch {
    return new NextResponse("Invalid pathname", { status: 400 });
  }

  // Forward Range so <video> can seek (Safari won't play without it).
  const range = request.headers.get("range");

  const result = await get(pathname, {
    access: "private",
    ifNoneMatch: request.headers.get("if-none-match") ?? undefined,
    headers: range ? { range } : undefined,
  });

  if (!result) {
    return new NextResponse("Not found", { status: 404 });
  }

  if (result.statusCode === 304) {
    return new NextResponse(null, {
      status: 304,
      headers: { ETag: result.blob.etag, "Cache-Control": "private, no-cache" },
    });
  }

  const contentRange = result.headers.get("content-range");
  const headers: Record<string, string> = {
    ...SECURITY_HEADERS,
    "Content-Type": result.blob.contentType,
    "Accept-Ranges": "bytes",
    ETag: result.blob.etag,
    "Cache-Control": "private, no-cache",
  };
  const contentLength = result.headers.get("content-length");

  if (contentLength) {
    headers["Content-Length"] = contentLength;
  }

  if (contentRange) {
    headers["Content-Range"] = contentRange;
  }

  return new NextResponse(result.stream, {
    status: contentRange ? 206 : 200,
    headers,
  });
};
