import fs from "node:fs";
import { Readable } from "node:stream";

/** Streams a stored file with HTTP Range support (needed for video seeking). */
export function stream(req: Request, file: string, type: string, size: number, cache: string) {
  if (!fs.existsSync(file)) return new Response("File missing from storage", { status: 410 });
  const range = req.headers.get("range")?.match(/bytes=(\d*)-(\d*)/);
  const base = { "Content-Type": type, "Accept-Ranges": "bytes", "Cache-Control": cache, "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'; img-src 'self'; media-src 'self'; style-src 'unsafe-inline'" };
  if (range) {
    const start = range[1] ? Number(range[1]) : 0; const end = range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
    if (start > end || start >= size) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
    return new Response(Readable.toWeb(fs.createReadStream(file, { start, end })) as ReadableStream, { status: 206, headers: { ...base, "Content-Range": `bytes ${start}-${end}/${size}`, "Content-Length": String(end - start + 1) } });
  }
  return new Response(Readable.toWeb(fs.createReadStream(file)) as ReadableStream, { headers: { ...base, "Content-Length": String(size) } });
}
