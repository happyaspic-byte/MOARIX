import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer, type IncomingHttpHeaders, type Server } from "node:http";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const cliPath = path.resolve(process.cwd(), "bin/moarix.mjs");
const openServers: Server[] = [];
const temporaryDirectories: string[] = [];

interface CliResult {
  code: number | null;
  stderr: string;
  stdout: string;
}

interface CapturedRequest {
  body: string;
  headers: IncomingHttpHeaders;
  method: string | undefined;
  url: string | undefined;
}

function cleanEnvironment(overrides: Partial<NodeJS.ProcessEnv> = {}): NodeJS.ProcessEnv {
  const inheritedEnvironment: Partial<NodeJS.ProcessEnv> = { ...process.env };
  delete inheritedEnvironment.MOARIX_TOKEN;
  return {
    ...inheritedEnvironment,
    ...overrides,
    NODE_ENV: overrides.NODE_ENV ?? "test",
  };
}

async function runCli(
  args: string[],
  { environment = {}, stdin = "" }: { environment?: Partial<NodeJS.ProcessEnv>; stdin?: string } = {},
): Promise<CliResult> {
  const child = spawn(process.execPath, [cliPath, ...args], {
    env: cleanEnvironment(environment),
    stdio: ["pipe", "pipe", "pipe"],
  });

  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => {
    stdout += chunk;
  });
  child.stderr.on("data", (chunk: string) => {
    stderr += chunk;
  });
  child.stdin.end(stdin);

  const [code] = await once(child, "close") as [number | null, NodeJS.Signals | null];
  return { code, stderr, stdout };
}

async function startJsonServer(
  response: { body: unknown; status?: number },
): Promise<{ requests: CapturedRequest[]; url: string }> {
  const requests: CapturedRequest[] = [];
  const server = createServer(async (request, serverResponse) => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    requests.push({
      body: Buffer.concat(chunks).toString("utf8"),
      headers: request.headers,
      method: request.method,
      url: request.url,
    });
    serverResponse.writeHead(response.status ?? 200, { "Content-Type": "application/json" });
    serverResponse.end(JSON.stringify(response.body));
  });
  openServers.push(server);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("test server did not expose a TCP port");
  return { requests, url: `http://127.0.0.1:${address.port}` };
}

async function startDisconnectServer(): Promise<{ requests: CapturedRequest[]; url: string }> {
  const requests: CapturedRequest[] = [];
  const server = createServer(async (request) => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    requests.push({
      body: Buffer.concat(chunks).toString("utf8"),
      headers: request.headers,
      method: request.method,
      url: request.url,
    });
    request.socket.destroy();
  });
  openServers.push(server);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("test server did not expose a TCP port");
  return { requests, url: `http://127.0.0.1:${address.port}` };
}

async function startRawServer(body: string): Promise<{ requests: CapturedRequest[]; url: string }> {
  const requests: CapturedRequest[] = [];
  const server = createServer(async (request, response) => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    requests.push({
      body: Buffer.concat(chunks).toString("utf8"),
      headers: request.headers,
      method: request.method,
      url: request.url,
    });
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(body);
  });
  openServers.push(server);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("test server did not expose a TCP port");
  return { requests, url: `http://127.0.0.1:${address.port}` };
}

afterEach(async () => {
  await Promise.all(openServers.splice(0).map(async (server) => {
    server.close();
    await once(server, "close");
  }));
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { force: true, recursive: true })));
});

describe.sequential("MOARIX CLI", () => {
  it("prints a compact discovery schema without a token", async () => {
    const result = await runCli(["--agent"]);

    expect(result.code).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout.trim().split("\n")).toHaveLength(1);
    const output = JSON.parse(result.stdout) as {
      data: { commands: { resources: Record<string, string[]> }; safety: { token: string } };
      ok: boolean;
    };
    expect(output.ok).toBe(true);
    expect(output.data.commands.resources.asset).toEqual(["list", "get", "create", "update"]);
    expect(output.data.commands.resources.customer).toEqual(["list", "create"]);
    expect(output.data.commands.resources.case).toContain("attachment-add");
    expect(output.data.safety.token).toContain("MOARIX_TOKEN");
  });

  it("calls the unauthenticated health endpoint and normalizes JSON output", async () => {
    const mock = await startJsonServer({ body: { status: "ok" } });

    const result = await runCli(["health", "--machine"], {
      environment: { MOARIX_URL: mock.url },
    });

    expect(result).toMatchObject({ code: 0, stderr: "" });
    expect(mock.requests).toHaveLength(1);
    expect(mock.requests[0]).toMatchObject({ body: "", method: "GET", url: "/api/health" });
    expect(mock.requests[0]?.headers.authorization).toBeUndefined();
    expect(JSON.parse(result.stdout)).toEqual({
      apiVersion: "moarix/v1",
      data: { status: "ok" },
      meta: { httpStatus: 200 },
      ok: true,
    });
  });

  it("maps a friendly write, reads stdin JSON, and sends the retry key", async () => {
    const mock = await startJsonServer({
      body: {
        apiVersion: "moarix/v1",
        data: { id: "asset_demo_001" },
        meta: { requestId: "request_demo_001" },
        ok: true,
      },
      status: 201,
    });

    const result = await runCli([
      "asset",
      "create",
      "--data",
      "-",
      "--dry-run",
      "--idempotency-key",
      "asset-demo-create-0001",
      "--machine",
    ], {
      environment: { MOARIX_TOKEN: "test-bearer-value", MOARIX_URL: mock.url },
      stdin: JSON.stringify({ name: "합성 테스트 자산" }),
    });

    expect(result).toMatchObject({ code: 0, stderr: "" });
    expect(mock.requests).toHaveLength(1);
    expect(mock.requests[0]).toMatchObject({ method: "POST", url: "/api/v1/commands" });
    expect(mock.requests[0]?.headers.authorization).toBe("Bearer test-bearer-value");
    expect(mock.requests[0]?.headers["idempotency-key"]).toBe("asset-demo-create-0001");
    expect(JSON.parse(mock.requests[0]?.body ?? "")).toEqual({
      dryRun: true,
      input: { name: "합성 테스트 자산" },
      operation: "assets.create",
    });
    expect(JSON.parse(result.stdout).meta).toEqual({
      httpStatus: 201,
      idempotencyKey: "asset-demo-create-0001",
      requestId: "request_demo_001",
    });
  });

  it("maps a resource reference, reads @file JSON, and omits idempotency for reads", async () => {
    const mock = await startJsonServer({
      body: { apiVersion: "moarix/v1", data: { id: "case_demo_result" }, meta: {}, ok: true },
    });
    const directory = await mkdtemp(path.join(os.tmpdir(), "moarix-cli-"));
    temporaryDirectories.push(directory);
    const inputPath = path.join(directory, "request.json");
    await writeFile(inputPath, JSON.stringify({}), "utf8");

    const result = await runCli([
      "case",
      "get",
      "CASE-DEMO-001",
      "--data",
      `@${inputPath}`,
      "--machine",
    ], {
      environment: { MOARIX_TOKEN: "test-bearer-value", MOARIX_URL: mock.url },
    });

    expect(result).toMatchObject({ code: 0, stderr: "" });
    expect(JSON.parse(mock.requests[0]?.body ?? "")).toEqual({
      dryRun: false,
      input: { id: "CASE-DEMO-001" },
      operation: "cases.get",
    });
    expect(mock.requests[0]?.headers["idempotency-key"]).toBeUndefined();
  });

  it("automatically creates an idempotency key for a generic write", async () => {
    const mock = await startJsonServer({
      body: { apiVersion: "moarix/v1", data: { accepted: true }, meta: {}, ok: true },
    });

    const result = await runCli([
      "command",
      "run",
      "cases.transition",
      "--data",
      '{"id":"CASE-DEMO-001","nextStatus":"in_progress"}',
      "--machine",
    ], {
      environment: { MOARIX_TOKEN: "test-bearer-value", MOARIX_URL: mock.url },
    });

    expect(result).toMatchObject({ code: 0, stderr: "" });
    expect(mock.requests[0]?.headers["idempotency-key"]).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it("fails closed for an unknown operation even when its name looks like a read", async () => {
    const mock = await startJsonServer({
      body: { apiVersion: "moarix/v1", data: { accepted: true }, meta: {}, ok: true },
    });

    const result = await runCli([
      "command",
      "run",
      "experimental.mutation.get",
      "--machine",
    ], {
      environment: { MOARIX_TOKEN: "test-bearer-value", MOARIX_URL: mock.url },
    });

    expect(result).toMatchObject({ code: 0, stderr: "" });
    expect(mock.requests[0]?.headers["idempotency-key"]).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it("reports the generated retry key when a write outcome is unknown", async () => {
    const mock = await startDisconnectServer();

    const result = await runCli([
      "case",
      "transition",
      "CASE-DEMO-001",
      "--data",
      '{"nextStatus":"in_progress"}',
      "--machine",
    ], {
      environment: { MOARIX_TOKEN: "test-bearer-value", MOARIX_URL: mock.url },
    });

    expect(result).toMatchObject({ code: 6, stdout: "" });
    expect(mock.requests).toHaveLength(1);
    const sentKey = mock.requests[0]?.headers["idempotency-key"];
    const error = JSON.parse(result.stderr) as {
      error: { code: string };
      meta: { idempotencyKey: string; outcome: string; retry: string };
    };
    expect(error.error.code).toBe("CONNECTION_FAILED");
    expect(error.meta.idempotencyKey).toBe(sentKey);
    expect(error.meta.outcome).toBe("unknown");
    expect(error.meta.retry).toContain("identical write");
  });

  it("reports the generated retry key when a write response is truncated", async () => {
    const mock = await startRawServer('{"apiVersion":"moarix/v1","ok":true');

    const result = await runCli([
      "asset",
      "create",
      "--data",
      '{"name":"Synthetic asset"}',
      "--machine",
    ], {
      environment: { MOARIX_TOKEN: "test-bearer-value", MOARIX_URL: mock.url },
    });

    expect(result).toMatchObject({ code: 6, stdout: "" });
    const error = JSON.parse(result.stderr) as {
      error: { code: string };
      meta: { idempotencyKey: string; outcome: string };
    };
    expect(error.error.code).toBe("INVALID_API_RESPONSE");
    expect(error.meta.idempotencyKey).toBe(mock.requests[0]?.headers["idempotency-key"]);
    expect(error.meta.outcome).toBe("unknown");
  });

  it("keeps API failures on stderr and maps authorization to exit code 3", async () => {
    const mock = await startJsonServer({
      body: {
        apiVersion: "moarix/v1",
        error: { code: "FORBIDDEN", message: "Insufficient role" },
        meta: { requestId: "request_demo_denied" },
        ok: false,
      },
      status: 403,
    });

    const result = await runCli(["context", "--machine"], {
      environment: { MOARIX_TOKEN: "test-bearer-value", MOARIX_URL: mock.url },
    });

    expect(result.code).toBe(3);
    expect(result.stdout).toBe("");
    expect(mock.requests[0]).toMatchObject({ method: "GET", url: "/api/v1/context" });
    expect(mock.requests[0]?.headers.authorization).toBe("Bearer test-bearer-value");
    expect(JSON.parse(result.stderr)).toEqual({
      apiVersion: "moarix/v1",
      error: { code: "FORBIDDEN", message: "Insufficient role" },
      meta: { httpStatus: 403, requestId: "request_demo_denied" },
      ok: false,
    });
  });

  it("rejects token argv without echoing the secret", async () => {
    const result = await runCli(["context", "--token", "do-not-print-this", "--machine"]);

    expect(result.code).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).not.toContain("do-not-print-this");
    expect(JSON.parse(result.stderr).error.code).toBe("TOKEN_ARG_FORBIDDEN");
  });

  it("rejects invalid JSON before making a request", async () => {
    const result = await runCli(["asset", "create", "--data", "{bad-json", "--machine"], {
      environment: { MOARIX_TOKEN: "test-bearer-value" },
    });

    expect(result.code).toBe(2);
    expect(result.stdout).toBe("");
    expect(JSON.parse(result.stderr).error.code).toBe("INVALID_DATA_JSON");
  });

  it("refuses to send a bearer token over remote plaintext HTTP", async () => {
    const result = await runCli(["context", "--machine"], {
      environment: {
        MOARIX_TOKEN: "do-not-print-this-token",
        MOARIX_URL: "http://erp.example.com",
      },
    });

    expect(result).toMatchObject({ code: 2, stdout: "" });
    expect(result.stderr).not.toContain("do-not-print-this-token");
    expect(JSON.parse(result.stderr).error.code).toBe("INSECURE_URL");
  });
});
