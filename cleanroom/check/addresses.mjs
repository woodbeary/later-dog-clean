#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const OFF_LIMITS = /openmaus|milind-soni|woodbeary\/later-dog(?!-clean)/i;
const EXEMPT = new Set(["CLEANROOM.md", "cleanroom/check/addresses.mjs"]);
const EXEMPT_PREFIXES = ["cleanroom/record/"];

const files = execFileSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"]).toString("utf8").split("\0").filter(Boolean);
const hits = [];
for (const file of files) {
  if (EXEMPT.has(file) || EXEMPT_PREFIXES.some((prefix) => file.startsWith(prefix))) continue;
  let text;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    continue;
  }
  if (text.includes("\u0000")) continue;
  text.split("\n").forEach((line, index) => {
    if (OFF_LIMITS.test(line)) hits.push(`${file}:${index + 1}: ${line.trim().slice(0, 160)}`);
  });
}
for (const hit of hits) process.stdout.write(`${hit}\n`);
process.stdout.write(`${hits.length} reference(s) to off-limits sources\n`);
if (hits.length) process.exitCode = 1;
