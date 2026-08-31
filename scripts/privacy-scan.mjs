import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

const projectRoot = process.cwd();
const ignoredDirectories = new Set([
  ".data",
  ".git",
  ".next",
  "coverage",
  "node_modules",
  "playwright-report",
  "test-results",
]);
const ignoredFiles = new Set(["package-lock.json"]);
const sensitiveFileEndings = [
  ".7z",
  ".bak",
  ".core",
  ".dmp",
  ".dump",
  ".key",
  ".p12",
  ".pcap",
  ".pcapng",
  ".pem",
  ".pfx",
  ".rar",
  ".tar",
  ".tar.gz",
  ".tgz",
  ".zip",
];

// Do not commit real customer/person names here. If a private deployment has
// additional terms to scan, provide them through MOARIX_PRIVACY_TOKENS in CI.
const knownPrivateTokens = (process.env.MOARIX_PRIVACY_TOKENS ?? "")
  .split(",")
  .map((token) => token.trim())
  .filter(Boolean);

const contentRules = [
  {
    name: "realistic service case identifier",
    pattern: /\bCS0[1-9][0-9]{5}\b/giu,
  },
  {
    name: "realistic external asset identifier",
    pattern: /\b(?:ee-[1-9][0-9]{4,}|zen[1-9][0-9]{4,})\b/giu,
  },
  {
    name: "known customer or person token",
    pattern: knownPrivateTokens.length > 0
      ? new RegExp(`\\b(?:${knownPrivateTokens.map(escapeRegExp).join("|")})\\b`, "giu")
      : /(?!)/gu,
  },
  {
    name: "private IPv4 address",
    pattern: /\b(?:10(?:\.[0-9]{1,3}){3}|172\.(?:1[6-9]|2[0-9]|3[01])(?:\.[0-9]{1,3}){2}|192\.168(?:\.[0-9]{1,3}){2})\b/gu,
  },
];

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isSensitiveFile(relativePath) {
  const normalized = relativePath.toLowerCase();
  return sensitiveFileEndings.some((ending) => normalized.endsWith(ending));
}

function isProbablyBinary(buffer) {
  const sample = buffer.subarray(0, Math.min(buffer.length, 8192));
  return sample.includes(0);
}

function locationFor(content, index) {
  const before = content.slice(0, index);
  const line = before.split("\n").length;
  const lastNewline = before.lastIndexOf("\n");
  return { line, column: index - lastNewline };
}

async function collectFiles(directory, relativeDirectory = "") {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (entry.isSymbolicLink()) continue;
    const relativePath = path.join(relativeDirectory, entry.name);
    if (entry.isDirectory()) {
      if (!ignoredDirectories.has(entry.name)) {
        files.push(...await collectFiles(path.join(directory, entry.name), relativePath));
      }
      continue;
    }
    if (entry.isFile() && !ignoredFiles.has(entry.name)) files.push(relativePath);
  }

  return files;
}

const failures = [];
const files = await collectFiles(projectRoot);

for (const relativePath of files) {
  if (isSensitiveFile(relativePath)) {
    failures.push(`${relativePath}: sensitive attachment or credential file extension`);
    continue;
  }

  const buffer = await readFile(path.join(projectRoot, relativePath));
  if (isProbablyBinary(buffer)) continue;
  const content = buffer.toString("utf8");

  for (const rule of contentRules) {
    rule.pattern.lastIndex = 0;
    for (const match of content.matchAll(rule.pattern)) {
      const { line, column } = locationFor(content, match.index ?? 0);
      failures.push(`${relativePath}:${line}:${column}: ${rule.name}`);
    }
  }
}

if (failures.length > 0) {
  console.error("Privacy scan failed. Replace real operational data with explicitly synthetic fixtures:\n");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.info(`Privacy scan passed (${files.length} repository files checked)`);
}
