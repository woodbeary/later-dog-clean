#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, extname, basename } from "node:path";

const CODE_EXTENSIONS = new Set([".ts", ".tsx", ".mts", ".cts", ".js", ".mjs", ".cjs", ".jsx", ".css", ".scss", ".html", ".swift", ".py", ".sh", ".bash", ".zsh", ".kt", ".java", ".go", ".rs", ".yml", ".yaml", ".toml", ".sql", ".plist", ".xml"]);
const PROSE_EXTENSIONS = new Set([".md", ".mdx", ".txt", ".json"]);
const SKIPPED_DIRECTORIES = new Set(["node_modules", ".git", "dist", "dist-server", "dist-companion", "dist-native", "release", "third_party", "coverage", ".turbo", ".next", "build-output"]);
const SKIPPED_FILES = new Set(["LICENSE", "LICENSE.md", "LICENSE.txt", "NOTICE", "NOTICE.md", "package-lock.json", "pnpm-lock.yaml", "yarn.lock", "bun.lockb"]);
const MAX_FILE_BYTES = 2_000_000;

const KEYWORDS = new Set(("abstract any as async await boolean break case catch class const constructor continue debugger declare default delete do else enum export extends false finally for from function get if implements import in infer instanceof interface is keyof let module namespace never new null number object of package private protected public readonly require return satisfies set static string super switch symbol this throw true try type typeof undefined unique unknown var void while with yield " +
  "def elif except lambda None True False pass raise self nonlocal global func guard struct protocol extension init deinit inout fileprivate internal open some where fun val when then fi esac done local echo").split(" "));

export const SETTINGS = { exact: { k: 30, w: 12 }, shape: { k: 60, w: 20 }, prose: { k: 25, w: 10 } };

export function familyOf(path) {
  const name = basename(path);
  if (SKIPPED_FILES.has(name)) return null;
  const extension = extname(name).toLowerCase();
  if (CODE_EXTENSIONS.has(extension)) return "code";
  if (PROSE_EXTENSIONS.has(extension)) return "prose";
  return null;
}

export function skippedPath(path) {
  return path.split("/").some((part) => SKIPPED_DIRECTORIES.has(part));
}

const HASH_COMMENT_EXTENSIONS = new Set([".py", ".sh", ".bash", ".zsh", ".yml", ".yaml", ".toml"]);
const CODE_TOKEN = /\/\*[\s\S]*?\*\/|\/\/[^\n]*|<!--[\s\S]*?-->|"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`|[A-Za-z_$][\w$]*|\d[\w.]*|=>|===|!==|==|!=|<=|>=|&&|\|\||\?\?|\?\.|\.\.\.|\S/g;

function codeTokens(text, extension) {
  const exact = [];
  const shape = [];
  const prose = [];
  let source = text;
  if (HASH_COMMENT_EXTENSIONS.has(extension)) {
    source = text.replace(/(^|[ \t])#(?!!)([^\n]*)/g, (whole, lead, comment) => {
      prose.push(...proseTokens(comment));
      return lead;
    });
  }
  for (const match of source.matchAll(CODE_TOKEN)) {
    const token = match[0];
    const first = token[0];
    if (token.startsWith("/*") || token.startsWith("//") || token.startsWith("<!--")) {
      prose.push(...proseTokens(token));
      continue;
    }
    exact.push(token);
    if (first === '"' || first === "'" || first === "`") {
      shape.push("S");
      prose.push(...proseTokens(token.slice(1, -1)));
    } else if (/^\d/.test(token)) shape.push("N");
    else if (/^[A-Za-z_$]/.test(token)) shape.push(KEYWORDS.has(token) ? token : "I");
    else shape.push(token);
  }
  return { exact, shape, prose };
}

function proseTokens(text) {
  return text.toLowerCase().match(/[\p{L}\p{N}]+(?:['’][\p{L}]+)?/gu) ?? [];
}

const FENCE = /^([ \t]*)(`{3,}|~{3,})([^\n]*)\n([\s\S]*?)\n\1\2[ \t]*$/gm;

function markdownStreams(text) {
  const exact = [];
  const shape = [];
  const prose = [];
  const outside = text.replace(FENCE, (whole, indent, fence, info, body) => {
    const language = info.trim().split(/\s+/)[0].toLowerCase();
    const extension = language ? `.${{ typescript: "ts", javascript: "js", shell: "sh", bash: "sh", zsh: "sh", python: "py", yml: "yaml", tsx: "tsx", jsx: "jsx" }[language] ?? language}` : ".ts";
    const streams = codeTokens(body, CODE_EXTENSIONS.has(extension) ? extension : ".ts");
    exact.push(...streams.exact);
    shape.push(...streams.shape);
    prose.push(...streams.prose);
    return "\n";
  });
  prose.push(...proseTokens(outside.replace(/`([^`\n]+)`/g, (whole, inline) => {
    exact.push(...codeTokens(inline, ".ts").exact);
    return inline;
  })));
  return { exact, shape, prose };
}

function tokenHash(token) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < token.length; index += 1) {
    hash ^= token.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function powerOf(base, exponent) {
  let result = 1;
  for (let index = 0; index < exponent; index += 1) result = Math.imul(result, base) >>> 0;
  return result;
}

const BASE_A = 0x9e3779b1;
const BASE_B = 0x85ebca77;

export function windowHashes(tokens, k) {
  const count = tokens.length - k + 1;
  if (count <= 0) return new Float64Array(0);
  const ids = new Uint32Array(tokens.length);
  for (let index = 0; index < tokens.length; index += 1) ids[index] = tokenHash(tokens[index]);
  const highA = powerOf(BASE_A, k - 1);
  const highB = powerOf(BASE_B, k - 1);
  let a = 0;
  let b = 0;
  for (let index = 0; index < k; index += 1) {
    a = (Math.imul(a, BASE_A) + ids[index]) >>> 0;
    b = (Math.imul(b, BASE_B) + (ids[index] ^ 0x5bd1e995)) >>> 0;
  }
  const hashes = new Float64Array(count);
  hashes[0] = a * 2097152 + (b & 0x1fffff);
  for (let start = 1; start < count; start += 1) {
    const out = ids[start - 1];
    const incoming = ids[start + k - 1];
    a = (Math.imul((a - Math.imul(out, highA)) >>> 0, BASE_A) + incoming) >>> 0;
    b = (Math.imul((b - Math.imul(out ^ 0x5bd1e995, highB)) >>> 0, BASE_B) + (incoming ^ 0x5bd1e995)) >>> 0;
    hashes[start] = a * 2097152 + (b & 0x1fffff);
  }
  return hashes;
}

export function winnow(hashes, w) {
  const chosen = [];
  if (hashes.length === 0) return chosen;
  if (hashes.length <= w) {
    let best = 0;
    for (let index = 1; index < hashes.length; index += 1) if (hashes[index] <= hashes[best]) best = index;
    chosen.push(hashes[best]);
    return chosen;
  }
  let last = -1;
  const queue = [];
  for (let index = 0; index < hashes.length; index += 1) {
    while (queue.length && hashes[queue[queue.length - 1]] >= hashes[index]) queue.pop();
    queue.push(index);
    if (queue[0] <= index - w) queue.shift();
    if (index >= w - 1 && queue[0] !== last) {
      last = queue[0];
      chosen.push(hashes[last]);
    }
  }
  return chosen;
}

export function streamsOf(path, text) {
  const family = familyOf(path);
  const extension = extname(path).toLowerCase();
  if (family === "code") return codeTokens(text, extension);
  if (family === "prose" && (extension === ".md" || extension === ".mdx")) return markdownStreams(text);
  if (family === "prose") return { prose: proseTokens(text) };
  return {};
}

function listDirectory(root) {
  const files = [];
  const walk = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const full = join(directory, entry.name);
      const rel = relative(root, full);
      if (entry.isDirectory()) {
        if (!SKIPPED_DIRECTORIES.has(entry.name)) walk(full);
      } else if (entry.isFile() && familyOf(rel) && statSync(full).size <= MAX_FILE_BYTES) {
        files.push({ path: rel, read: () => readFileSync(full, "utf8") });
      }
    }
  };
  walk(root);
  return files;
}

function listGitTree(repository, ref, prefixes) {
  const listing = execFileSync("git", ["-C", repository, "ls-tree", "-r", "-l", "-z", ref], { maxBuffer: 1 << 28 }).toString("utf8").split("\0").filter(Boolean);
  const wanted = [];
  for (const line of listing) {
    const [meta, path] = line.split("\t");
    const [, type, sha, size] = meta.split(/\s+/);
    if (type !== "blob" || skippedPath(path) || !familyOf(path) || Number(size) > MAX_FILE_BYTES) continue;
    if (prefixes.length && !prefixes.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))) continue;
    wanted.push({ path, sha });
  }
  const unique = [...new Set(wanted.map((entry) => entry.sha))];
  const output = execFileSync("git", ["-C", repository, "cat-file", "--batch"], { input: unique.join("\n") + "\n", maxBuffer: 1 << 30 });
  const contents = new Map();
  let offset = 0;
  while (offset < output.length) {
    const headerEnd = output.indexOf(10, offset);
    const header = output.subarray(offset, headerEnd).toString("utf8").split(" ");
    const size = Number(header[2]);
    contents.set(header[0], output.subarray(headerEnd + 1, headerEnd + 1 + size).toString("utf8"));
    offset = headerEnd + 1 + size + 1;
  }
  return wanted.map((entry) => ({ path: `${ref}:${entry.path}`, sha: entry.sha, read: () => contents.get(entry.sha) }));
}

function sourceFiles(source) {
  if (source.startsWith("git:")) {
    const [, repository, ref, ...prefixes] = source.split(":");
    return listGitTree(repository, ref, prefixes.filter(Boolean).flatMap((prefix) => prefix.split(",")));
  }
  return listDirectory(source);
}

function build(output, sources) {
  const sets = { exact: new Set(), shape: new Set(), prose: new Set() };
  const seen = new Set();
  let files = 0;
  for (const source of sources) {
    for (const file of sourceFiles(source)) {
      if (file.sha && seen.has(file.sha)) continue;
      if (file.sha) seen.add(file.sha);
      files += 1;
      const streams = streamsOf(file.path, file.read());
      for (const [mode, tokens] of Object.entries(streams)) {
        const { k, w } = SETTINGS[mode];
        for (const hash of winnow(windowHashes(tokens, k), w)) sets[mode].add(hash);
      }
    }
  }
  const header = { format: "laterdog-cleanroom-fingerprints", version: 2, settings: SETTINGS, files, counts: {} };
  const parts = [];
  for (const mode of ["exact", "shape", "prose"]) {
    const sorted = Float64Array.from(sets[mode]).sort();
    header.counts[mode] = sorted.length;
    parts.push(Buffer.from(sorted.buffer));
  }
  const headerBytes = Buffer.from(JSON.stringify(header));
  const length = Buffer.alloc(4);
  length.writeUInt32LE(headerBytes.length);
  writeFileSync(output, Buffer.concat([length, headerBytes, ...parts]));
  process.stdout.write(`${JSON.stringify(header)}\n`);
}

export function loadReference(file) {
  const bytes = readFileSync(file);
  const headerLength = bytes.readUInt32LE(0);
  const header = JSON.parse(bytes.subarray(4, 4 + headerLength).toString("utf8"));
  let offset = 4 + headerLength;
  const sets = {};
  for (const mode of ["exact", "shape", "prose"]) {
    const count = header.counts[mode];
    const slice = bytes.subarray(offset, offset + count * 8);
    const copy = new Float64Array(count);
    Buffer.from(copy.buffer).set(slice);
    sets[mode] = new Set(copy);
    offset += count * 8;
  }
  return { header, sets };
}

export function scoreText(reference, path, text) {
  const result = { path, modes: {} };
  for (const [mode, tokens] of Object.entries(streamsOf(path, text))) {
    const { k } = reference.header.settings[mode];
    const hashes = windowHashes(tokens, k);
    const covered = new Uint8Array(tokens.length);
    let longest = 0;
    let runStart = -1;
    let runEnd = -1;
    for (let start = 0; start < hashes.length; start += 1) {
      if (!reference.sets[mode].has(hashes[start])) continue;
      covered.fill(1, start, start + k);
      if (start <= runEnd) runEnd = start + k;
      else {
        runStart = start;
        runEnd = start + k;
      }
      longest = Math.max(longest, runEnd - runStart);
    }
    let coveredCount = 0;
    for (const flag of covered) coveredCount += flag;
    result.modes[mode] = { tokens: tokens.length, covered: coveredCount, longest };
  }
  return result;
}

function scan(referenceFile, sources, options) {
  const reference = loadReference(referenceFile);
  const rows = [];
  for (const source of sources) for (const file of sourceFiles(source)) rows.push(scoreText(reference, file.path, file.read()));
  const totals = {};
  for (const row of rows) {
    for (const [mode, value] of Object.entries(row.modes)) {
      totals[mode] ??= { tokens: 0, covered: 0, files: 0, flagged: 0 };
      totals[mode].tokens += value.tokens;
      totals[mode].covered += value.covered;
      totals[mode].files += 1;
    }
  }
  const limits = { exact: options.longest ?? 100, prose: options.proseLongest ?? 80 };
  const failing = (mode, value) => mode in limits && value.longest >= limits[mode];
  const flagged = rows.filter((row) => Object.entries(row.modes).some(([mode, value]) => failing(mode, value)));
  for (const row of flagged) for (const [mode, value] of Object.entries(row.modes)) if (failing(mode, value)) totals[mode].flagged += 1;
  const summary = Object.fromEntries(Object.entries(totals).map(([mode, value]) => [mode, { ...value, percent: value.tokens ? Number((100 * value.covered / value.tokens).toFixed(2)) : 0 }]));
  if (options.json) writeFileSync(options.json, JSON.stringify({ limits, summary, rows }, null, 1));
  process.stdout.write(`${JSON.stringify({ limits, summary })}\n`);
  const strongest = (row) => Math.max(0, ...Object.entries(row.modes).filter(([mode]) => mode in limits).map(([, value]) => value.longest));
  const worst = rows.map((row) => ({ path: row.path, longest: strongest(row), shape: row.modes.shape?.longest ?? 0, failing: flagged.includes(row), covered: Object.values(row.modes).reduce((sum, value) => sum + value.covered, 0), tokens: Object.values(row.modes).reduce((sum, value) => sum + value.tokens, 0) }))
    .filter((row) => row.longest > 0).sort((left, right) => right.longest - left.longest).slice(0, options.top ?? 25);
  for (const row of worst) process.stdout.write(`${row.failing ? "FAIL" : "    "} ${String(row.longest).padStart(6)} ${String(row.shape).padStart(6)} ${String(Math.round(100 * row.covered / Math.max(row.tokens, 1))).padStart(4)}% ${row.path}\n`);
  return flagged.length;
}

function main(argv) {
  const [command, ...rest] = argv;
  const options = {};
  const positional = [];
  for (let index = 0; index < rest.length; index += 1) {
    const value = rest[index];
    if (value === "--json") options.json = rest[++index];
    else if (value === "--top") options.top = Number(rest[++index]);
    else if (value === "--longest") options.longest = Number(rest[++index]);
    else if (value === "--prose-longest") options.proseLongest = Number(rest[++index]);
    else if (value === "--fail") options.fail = true;
    else positional.push(value);
  }
  if (command === "build") return build(positional[0], positional.slice(1));
  if (command === "scan") {
    const flagged = scan(positional[0], positional.slice(1), options);
    if (options.fail && flagged > 0) process.exitCode = 1;
    return;
  }
  process.stderr.write("usage: fingerprint.mjs build <out.fp> <dir | git:<repo>:<ref>[:prefix,...]>...\n       fingerprint.mjs scan <ref.fp> <dir | git:...>... [--json out] [--top n] [--longest tokens] [--prose-longest words] [--fail]\n");
  process.exitCode = 2;
}

if (import.meta.url === `file://${process.argv[1]}`) main(process.argv.slice(2));
