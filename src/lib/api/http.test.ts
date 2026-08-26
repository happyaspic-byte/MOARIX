import { describe, expect, it } from "vitest";
import { readJsonBody } from "./http";

function streamRequest(stream: ReadableStream<Uint8Array>) {
  return new Request("http://moarix.test/api/v1/commands", {
    method: "POST",
    body: stream,
    duplex: "half",
  } as RequestInit & { duplex: "half" });
}

describe("command API request bodies", () => {
  it("parses a chunked JSON body without relying on Content-Length", async () => {
    const encoder = new TextEncoder();
    const request = streamRequest(new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode('{"operation":"assets.list",'));
        controller.enqueue(encoder.encode('"input":{}}'));
        controller.close();
      },
    }));

    await expect(readJsonBody(request)).resolves.toEqual({
      operation: "assets.list",
      input: {},
    });
  });

  it("cancels a chunked body as soon as it exceeds 1 MiB", async () => {
    let cancelled = false;
    const request = streamRequest(new ReadableStream({
      pull(controller) {
        controller.enqueue(new Uint8Array(600 * 1024));
      },
      cancel() {
        cancelled = true;
      },
    }));

    await expect(readJsonBody(request)).rejects.toMatchObject({
      code: "INVALID_REQUEST",
      status: 413,
    });
    expect(cancelled).toBe(true);
  });
});
