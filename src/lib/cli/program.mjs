import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import process from "node:process";

const API_VERSION = "moarix/v1";
const DEFAULT_URL = "http://localhost:3000";
const DEFAULT_TIMEOUT_MS = 30_000;

const EXIT = Object.freeze({
  OK: 0,
  USAGE: 2,
  AUTH: 3,
  NOT_FOUND: 4,
  REJECTED: 5,
  UNAVAILABLE: 6,
});

const FRIENDLY_OPERATIONS = Object.freeze({
  customer: Object.freeze({
    list: "master.counterparties.list",
    create: "master.counterparties.create",
    update: "master.counterparties.update",
    delete: "master.counterparties.delete",
  }),
  item: Object.freeze({
    list: "master.items.list",
    create: "master.items.create",
  }),
  site: Object.freeze({
    list: "sites.list",
    create: "sites.create",
    update: "sites.update",
    delete: "sites.delete",
  }),
  asset: Object.freeze({
    list: "assets.list",
    get: "assets.get",
    create: "assets.create",
    update: "assets.update",
  }),
  case: Object.freeze({
    list: "cases.list",
    get: "cases.get",
    create: "cases.create",
    "activity-add": "cases.activity.add",
    "attachment-add": "cases.attachment.add",
    "watcher-add": "cases.watcher.add",
    transition: "cases.transition",
  }),
  inspection: Object.freeze({
    list: "inspections.list",
    get: "inspections.get",
    create: "inspections.create",
    transition: "inspections.transition",
  }),
  quote: Object.freeze({
    list: "quotes.list",
    get: "quotes.get",
    create: "quotes.create",
    update: "quotes.update",
    transition: "quotes.transition",
  }),
  trip: Object.freeze({
    list: "trips.list",
    get: "trips.get",
    create: "trips.create",
    update: "trips.update",
    transition: "trips.transition",
    summary: "trips.summary",
  }),
  report: Object.freeze({
    run: "reports.run",
  }),
});

const RESOURCE_ALIASES = Object.freeze({
  assets: "asset",
  cases: "case",
  counterparty: "customer",
  counterparties: "customer",
  customers: "customer",
  inspections: "inspection",
  items: "item",
  quotes: "quote",
  reports: "report",
  sites: "site",
  trips: "trip",
});

const ACTIONS_REQUIRING_ID = new Set([
  "activity-add",
  "attachment-add",
  "delete",
  "get",
  "transition",
  "update",
  "watcher-add",
]);

// Keep this list exact and fail closed: an operation unknown to this CLI is
// treated as a write, even when its name happens to end in `.get` or `.list`.
// The server remains the source of truth and will ignore an idempotency header
// for a real read command.
const READ_OPERATIONS = new Set([
  "assets.get",
  "assets.list",
  "capabilities.get",
  "cases.get",
  "cases.list",
  "context.get",
  "inspections.get",
  "inspections.list",
  "master.counterparties.list",
  "master.items.list",
  "master.warehouses.list",
  "quotes.get",
  "quotes.list",
  "reports.run",
  "sites.list",
  "trips.get",
  "trips.list",
  "trips.summary",
]);
const SECRET_OPTIONS = new Set(["--api-key", "--authorization", "--token"]);

export const agentSchema = Object.freeze({
  apiVersion: API_VERSION,
  dataInput: Object.freeze({
    inline: "--data '{\"field\":\"value\"}'",
    file: "--data @request.json",
    stdin: "--data -",
  }),
  environment: Object.freeze({
    MOARIX_TIMEOUT_MS: "optional request timeout in milliseconds (default 30000)",
    MOARIX_TOKEN: "required bearer token except for health and local schema",
    MOARIX_URL: "server base URL (default http://localhost:3000)",
  }),
  executableAliases: Object.freeze(["moarix", "mx"]),
  exitCodes: Object.freeze({
    0: "success",
    2: "CLI usage, input, or configuration error",
    3: "authentication or authorization failed",
    4: "resource or endpoint not found",
    5: "API rejected the request",
    6: "network, timeout, or server failure",
  }),
  globalOptions: Object.freeze([
    "--agent",
    "--machine",
    "--dry-run",
    "--data <json|@file|->",
    "--idempotency-key <key>",
  ]),
  commands: Object.freeze({
    capabilities: "capabilities",
    context: "context",
    generic: "command run <operation> [--data ...]",
    health: "health",
    resources: Object.fromEntries(
      Object.entries(FRIENDLY_OPERATIONS).map(([resource, actions]) => [
        resource,
        Object.keys(actions),
      ]),
    ),
    schema: "schema (or --agent with no command)",
  }),
  idempotency: "Writes automatically send Idempotency-Key; reuse --idempotency-key when retrying the same write.",
  inputContract: "Commands requiring a resource ID accept it as the third positional argument and send it as input.id.",
  outputContract: "Success JSON is written only to stdout. Error JSON is written only to stderr. --machine and --agent use one JSON line.",
  safety: Object.freeze({
    deletion: "Delete operations are not exposed until audited soft-delete rules exist.",
    dryRun: "Use --dry-run before a write when the server capability allows it.",
    token: "MOARIX_TOKEN is accepted only from the environment; never put a token in argv or --data.",
  }),
});

const HELP = `MOARIX operations CLI

Usage (mx may replace moarix):
  moarix health
  moarix context
  moarix capabilities
  moarix schema | moarix --agent
  moarix command run <operation> [--data <json|@file|->] [--dry-run]
  moarix <resource> <action> [id] [--data <json|@file|->] [--dry-run]

Resources:
  customer item site asset case inspection quote trip report

Environment:
  MOARIX_URL         server base URL (default ${DEFAULT_URL})
  MOARIX_TOKEN       bearer token; required except for health and schema
  MOARIX_TIMEOUT_MS  request timeout (default ${DEFAULT_TIMEOUT_MS})

AI-safe output:
  --machine          compact single-line JSON
  --agent            compact JSON; without a command prints the agent schema

Secrets:
  Token command-line options are intentionally rejected. Set MOARIX_TOKEN in
  the process environment or a protected secret manager.
`;

class CliError extends Error {
  constructor(code, message, exitCode = EXIT.USAGE, details) {
    super(message);
    this.name = "CliError";
    this.code = code;
    this.exitCode = exitCode;
    this.details = details;
  }
}

function stableCopy(value) {
  if (Array.isArray(value)) return value.map(stableCopy);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, stableCopy(value[key])]),
    );
  }
  return value;
}

export function stableStringify(value, compact = false) {
  return JSON.stringify(stableCopy(value), null, compact ? undefined : 2);
}

function writeJson(stream, value, compact) {
  stream.write(`${stableStringify(value, compact)}\n`);
}

function usageError(code, message, details) {
  return new CliError(code, message, EXIT.USAGE, details);
}

function takeOptionValue(args, index, option) {
  const token = args[index];
  const equalsPrefix = `${option}=`;
  if (token.startsWith(equalsPrefix)) {
    const value = token.slice(equalsPrefix.length);
    if (!value) throw usageError("OPTION_VALUE_REQUIRED", `${option} requires a value`);
    return { consumed: 1, value };
  }

  const value = args[index + 1];
  if (!value || value.startsWith("--")) {
    throw usageError("OPTION_VALUE_REQUIRED", `${option} requires a value`);
  }
  return { consumed: 2, value };
}

function parseArgs(args) {
  const options = {
    agent: false,
    compact: false,
    dataSource: undefined,
    dryRun: false,
    help: false,
    idempotencyKey: undefined,
  };
  const positional = [];

  for (let index = 0; index < args.length;) {
    const token = args[index];
    const optionName = token.includes("=") ? token.slice(0, token.indexOf("=")) : token;

    if (SECRET_OPTIONS.has(optionName)) {
      throw usageError(
        "TOKEN_ARG_FORBIDDEN",
        "Bearer tokens are accepted only through MOARIX_TOKEN, never command-line arguments",
      );
    }

    if (token === "--agent") {
      options.agent = true;
      options.compact = true;
      index += 1;
    } else if (token === "--machine") {
      options.compact = true;
      index += 1;
    } else if (token === "--dry-run") {
      options.dryRun = true;
      index += 1;
    } else if (token === "--help" || token === "-h") {
      options.help = true;
      index += 1;
    } else if (token === "--data" || token.startsWith("--data=")) {
      if (options.dataSource !== undefined) {
        throw usageError("DUPLICATE_OPTION", "--data may be provided only once");
      }
      const parsed = takeOptionValue(args, index, "--data");
      options.dataSource = parsed.value;
      index += parsed.consumed;
    } else if (token === "--idempotency-key" || token.startsWith("--idempotency-key=")) {
      if (options.idempotencyKey !== undefined) {
        throw usageError("DUPLICATE_OPTION", "--idempotency-key may be provided only once");
      }
      const parsed = takeOptionValue(args, index, "--idempotency-key");
      options.idempotencyKey = parsed.value;
      index += parsed.consumed;
    } else if (token.startsWith("-")) {
      throw usageError("UNKNOWN_OPTION", `Unknown option: ${optionName}`);
    } else {
      positional.push(token);
      index += 1;
    }
  }

  return { options, positional };
}

async function readStdin(stream) {
  const chunks = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8");
}

async function readInput(dataSource, stdin) {
  if (dataSource === undefined) return {};

  let content;
  try {
    if (dataSource === "-") {
      content = await readStdin(stdin);
    } else if (dataSource.startsWith("@")) {
      const filename = dataSource.slice(1);
      if (!filename) throw usageError("DATA_FILE_REQUIRED", "--data @ requires a file path");
      content = await readFile(filename, "utf8");
    } else {
      content = dataSource;
    }
  } catch (error) {
    if (error instanceof CliError) throw error;
    throw usageError("DATA_READ_FAILED", "Could not read --data input", {
      reason: error instanceof Error ? error.message : "unknown read error",
    });
  }

  try {
    const parsed = JSON.parse(content);
    if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") {
      throw new TypeError("input must be a JSON object");
    }
    return parsed;
  } catch (error) {
    throw usageError("INVALID_DATA_JSON", "--data must contain one JSON object", {
      reason: error instanceof Error ? error.message : "invalid JSON",
    });
  }
}

function parseTimeout(rawValue) {
  if (rawValue === undefined || rawValue === "") return DEFAULT_TIMEOUT_MS;
  const timeout = Number(rawValue);
  if (!Number.isSafeInteger(timeout) || timeout < 1_000 || timeout > 300_000) {
    throw usageError(
      "INVALID_TIMEOUT",
      "MOARIX_TIMEOUT_MS must be an integer from 1000 through 300000",
    );
  }
  return timeout;
}

function parseBaseUrl(rawValue) {
  let url;
  try {
    url = new URL(rawValue || DEFAULT_URL);
  } catch {
    throw usageError("INVALID_URL", "MOARIX_URL must be a valid HTTP or HTTPS URL");
  }
  if (!new Set(["http:", "https:"]).has(url.protocol) || url.username || url.password) {
    throw usageError(
      "INVALID_URL",
      "MOARIX_URL must use HTTP(S) and must not contain credentials",
    );
  }
  const loopbackHosts = new Set(["127.0.0.1", "::1", "[::1]", "localhost"]);
  if (url.protocol === "http:" && !loopbackHosts.has(url.hostname.toLowerCase())) {
    throw usageError(
      "INSECURE_URL",
      "MOARIX_URL must use HTTPS unless it targets localhost or a loopback address",
    );
  }
  url.pathname = url.pathname.replace(/\/+$/, "");
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/$/, "");
}

function resolveFriendlyCommand(positional) {
  const resourceInput = positional[0];
  const resource = RESOURCE_ALIASES[resourceInput] ?? resourceInput;
  const actions = FRIENDLY_OPERATIONS[resource];
  if (!actions) return undefined;

  const action = positional[1];
  const operation = actions[action];
  if (!operation) {
    throw usageError("UNKNOWN_ACTION", `Unsupported ${resourceInput} action: ${action ?? "(missing)"}`, {
      allowedActions: Object.keys(actions),
    });
  }

  const id = positional[2];
  const requiresId = ACTIONS_REQUIRING_ID.has(action);
  if (requiresId && !id) {
    throw usageError("RESOURCE_ID_REQUIRED", `${resourceInput} ${action} requires a resource ID`);
  }
  if (!requiresId && id) {
    throw usageError("UNEXPECTED_ARGUMENT", `${resourceInput} ${action} does not accept a positional ID`);
  }
  if (positional.length > (requiresId ? 3 : 2)) {
    throw usageError("UNEXPECTED_ARGUMENT", "Too many positional arguments");
  }

  return { id, operation };
}

function resolveCommand(positional, agent) {
  if (positional.length === 0 && agent) return { kind: "schema" };
  if (positional.length === 0) throw usageError("COMMAND_REQUIRED", "A command is required; run --help or schema");

  const command = positional[0];
  if (command === "health" || command === "context" || command === "capabilities" || command === "schema") {
    if (positional.length !== 1) throw usageError("UNEXPECTED_ARGUMENT", `${command} accepts no arguments`);
    return { kind: command };
  }

  if (command === "command") {
    if (positional[1] !== "run" || !positional[2] || positional.length !== 3) {
      throw usageError("INVALID_COMMAND", "Use: command run <operation> [--data ...]");
    }
    if (!/^[a-z][a-z0-9]*(?:\.[a-z][a-z0-9]*)+$/.test(positional[2])) {
      throw usageError("INVALID_OPERATION", "Operation must be a lowercase dot-separated identifier");
    }
    return { kind: "operation", operation: positional[2] };
  }

  const friendly = resolveFriendlyCommand(positional);
  if (!friendly) throw usageError("UNKNOWN_COMMAND", `Unknown command: ${command}`);
  return { kind: "operation", ...friendly };
}

function isWriteOperation(operation) {
  return !READ_OPERATIONS.has(operation);
}

function mergeId(input, id) {
  if (!id) return input;
  if (input.id !== undefined && input.id !== id) {
    throw usageError("CONFLICTING_RESOURCE_ID", "Positional ID and input.id must match");
  }
  return { ...input, id };
}

function successEnvelope(body, status, idempotencyKey) {
  if (body && typeof body === "object" && !Array.isArray(body) && body.ok === true) {
    return {
      ...body,
      meta: {
        ...(body.meta && typeof body.meta === "object" ? body.meta : {}),
        ...(idempotencyKey ? { idempotencyKey } : {}),
        httpStatus: status,
      },
    };
  }
  return {
    apiVersion: API_VERSION,
    data: body,
    meta: { ...(idempotencyKey ? { idempotencyKey } : {}), httpStatus: status },
    ok: true,
  };
}

function errorEnvelope(body, status, idempotencyKey) {
  if (body && typeof body === "object" && !Array.isArray(body) && body.ok === false) {
    return {
      ...body,
      meta: {
        ...(body.meta && typeof body.meta === "object" ? body.meta : {}),
        ...(idempotencyKey ? { idempotencyKey } : {}),
        httpStatus: status,
      },
    };
  }
  return {
    apiVersion: API_VERSION,
    error: {
      code: `HTTP_${status}`,
      message: `MOARIX API returned HTTP ${status}`,
      ...(body === undefined ? {} : { details: body }),
    },
    meta: { ...(idempotencyKey ? { idempotencyKey } : {}), httpStatus: status },
    ok: false,
  };
}

function ambiguousTransportEnvelope(code, message, idempotencyKey) {
  return {
    apiVersion: API_VERSION,
    error: {
      code,
      message,
    },
    meta: {
      idempotencyKey,
      outcome: "unknown",
      retry: "Retry the identical write with this idempotency key; do not create a new key.",
    },
    ok: false,
  };
}

async function parseResponse(response) {
  const contentType = response.headers.get("content-type") ?? "";
  if (response.status === 204) return undefined;
  if (contentType.includes("application/json")) {
    try {
      return await response.json();
    } catch {
      throw new CliError("INVALID_API_RESPONSE", "MOARIX API returned invalid JSON", EXIT.UNAVAILABLE);
    }
  }
  const text = await response.text();
  return text ? { message: text } : undefined;
}

function exitForStatus(status) {
  if (status === 401 || status === 403) return EXIT.AUTH;
  if (status === 404) return EXIT.NOT_FOUND;
  if (status >= 400 && status < 500) return EXIT.REJECTED;
  return EXIT.UNAVAILABLE;
}

function validateIdempotencyKey(key) {
  if (key === undefined) return;
  if (key.length < 8 || key.length > 128 || !/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(key)) {
    throw usageError(
      "INVALID_IDEMPOTENCY_KEY",
      "--idempotency-key must be 8-128 URL-safe characters",
    );
  }
}

async function requestApi({ baseUrl, command, dryRun, fetchImpl, idempotencyKey, input, timeout, token }) {
  const headers = { Accept: "application/json" };
  let method = "GET";
  let pathname;
  let body;
  let effectiveIdempotencyKey;

  if (command.kind === "health") {
    pathname = "/api/health";
  } else if (command.kind === "context") {
    pathname = "/api/v1/context";
    headers.Authorization = `Bearer ${token}`;
  } else if (command.kind === "capabilities") {
    pathname = "/api/v1/capabilities";
    headers.Authorization = `Bearer ${token}`;
  } else {
    pathname = "/api/v1/commands";
    method = "POST";
    headers.Authorization = `Bearer ${token}`;
    headers["Content-Type"] = "application/json";
    if (isWriteOperation(command.operation) || idempotencyKey) {
      effectiveIdempotencyKey = idempotencyKey ?? randomUUID();
      headers["Idempotency-Key"] = effectiveIdempotencyKey;
    }
    body = JSON.stringify({ dryRun, input, operation: command.operation });
  }

  let response;
  try {
    response = await fetchImpl(`${baseUrl}${pathname}`, {
      body,
      headers,
      method,
      signal: AbortSignal.timeout(timeout),
    });
  } catch (error) {
    const isTimeout = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
    const code = isTimeout ? "REQUEST_TIMEOUT" : "CONNECTION_FAILED";
    const message = isTimeout ? `MOARIX API did not respond within ${timeout}ms` : "Could not connect to the MOARIX API";
    throw new CliError(
      code,
      message,
      EXIT.UNAVAILABLE,
      effectiveIdempotencyKey
        ? ambiguousTransportEnvelope(code, message, effectiveIdempotencyKey)
        : undefined,
    );
  }

  let responseBody;
  try {
    responseBody = await parseResponse(response);
  } catch (error) {
    if (error instanceof CliError && effectiveIdempotencyKey) {
      throw new CliError(
        error.code,
        error.message,
        error.exitCode,
        ambiguousTransportEnvelope(error.code, error.message, effectiveIdempotencyKey),
      );
    }
    throw error;
  }
  if (!response.ok) {
    throw new CliError(
      "API_REQUEST_FAILED",
      `MOARIX API returned HTTP ${response.status}`,
      exitForStatus(response.status),
      errorEnvelope(responseBody, response.status, effectiveIdempotencyKey),
    );
  }
  return successEnvelope(responseBody, response.status, effectiveIdempotencyKey);
}

function localErrorEnvelope(error) {
  if (error instanceof CliError && error.details?.ok === false) return error.details;
  return {
    apiVersion: API_VERSION,
    error: {
      code: error instanceof CliError ? error.code : "CLI_INTERNAL_ERROR",
      message: error instanceof Error ? error.message : "Unexpected CLI error",
      ...(error instanceof CliError && error.details !== undefined ? { details: error.details } : {}),
    },
    ok: false,
  };
}

export async function runCli(
  args,
  {
    env = process.env,
    fetchImpl = globalThis.fetch,
    stderr = process.stderr,
    stdin = process.stdin,
    stdout = process.stdout,
  } = {},
) {
  let compact = args.includes("--machine") || args.includes("--agent");
  try {
    const parsed = parseArgs(args);
    compact = parsed.options.compact;
    if (parsed.options.help) {
      stdout.write(HELP);
      return EXIT.OK;
    }

    const command = resolveCommand(parsed.positional, parsed.options.agent);
    if (parsed.options.dataSource !== undefined && command.kind !== "operation") {
      throw usageError("DATA_NOT_ALLOWED", `--data is not accepted by ${command.kind}`);
    }
    if (parsed.options.dryRun && command.kind !== "operation") {
      throw usageError("DRY_RUN_NOT_ALLOWED", `--dry-run is not accepted by ${command.kind}`);
    }
    if (parsed.options.idempotencyKey !== undefined && command.kind !== "operation") {
      throw usageError("IDEMPOTENCY_NOT_ALLOWED", `--idempotency-key is not accepted by ${command.kind}`);
    }
    validateIdempotencyKey(parsed.options.idempotencyKey);

    if (command.kind === "schema") {
      writeJson(stdout, { apiVersion: API_VERSION, data: agentSchema, ok: true }, compact);
      return EXIT.OK;
    }

    const token = env.MOARIX_TOKEN?.trim();
    if (command.kind !== "health" && (!token || !token.trim())) {
      throw usageError("TOKEN_REQUIRED", "MOARIX_TOKEN is required for authenticated commands");
    }

    const rawInput = await readInput(parsed.options.dataSource, stdin);
    const input = command.kind === "operation" ? mergeId(rawInput, command.id) : rawInput;
    const result = await requestApi({
      baseUrl: parseBaseUrl(env.MOARIX_URL),
      command,
      dryRun: parsed.options.dryRun,
      fetchImpl,
      idempotencyKey: parsed.options.idempotencyKey,
      input,
      timeout: parseTimeout(env.MOARIX_TIMEOUT_MS),
      token,
    });
    writeJson(stdout, result, compact);
    return EXIT.OK;
  } catch (error) {
    writeJson(stderr, localErrorEnvelope(error), compact);
    return error instanceof CliError ? error.exitCode : EXIT.UNAVAILABLE;
  }
}
