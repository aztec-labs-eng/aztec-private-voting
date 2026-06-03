/**
 * Bump the pinned Aztec version everywhere in one shot:
 *   - every `@aztec/*` dependency in every package.json
 *   - the git `tag = "..."` of every aztec-packages dependency in every Nargo.toml
 *
 *   npm run update -- --version v5.0.0-nightly.20260601
 *
 * This is what keeps `main` (stable) and `next` (nightly) each internally
 * consistent: one version string, applied to JS deps and Noir deps together.
 * After running it, re-run `npm install` and `npm run build:contracts`.
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "..");

function getVersionArg(): string {
  const args = process.argv.slice(2);
  const i = args.indexOf("--version");
  if (i === -1 || i === args.length - 1) {
    console.error("Usage: npm run update -- --version <aztec-version>");
    console.error("  e.g. --version v5.0.0-nightly.20260601   (or a stable like 4.3.0)");
    process.exit(1);
  }
  return args[i + 1];
}

/** Walk the repo, skipping node_modules / build output, collecting matching files. */
function findFiles(name: string | RegExp, dir = root, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === "target" || entry === "dist" || entry === ".git") {
      continue;
    }
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      findFiles(name, full, acc);
    } else if (typeof name === "string" ? entry === name : name.test(entry)) {
      acc.push(full);
    }
  }
  return acc;
}

const version = getVersionArg();

// package.json: rewrite every "@aztec/*": "<anything>" to the new version.
for (const file of findFiles("package.json")) {
  const original = readFileSync(file, "utf8");
  const updated = original.replace(
    /("@aztec\/[^"]+"\s*:\s*)"[^"]*"/g,
    (_m, prefix) => `${prefix}"${version}"`,
  );
  if (updated !== original) {
    writeFileSync(file, updated);
    console.log(`updated @aztec/* deps in ${file.replace(root + "/", "")}`);
  }
}

// Nargo.toml: rewrite the tag on any aztec-packages git dependency.
for (const file of findFiles("Nargo.toml")) {
  const original = readFileSync(file, "utf8");
  const updated = original.replace(
    /(git\s*=\s*"https:\/\/github\.com\/AztecProtocol\/aztec-packages\/?"\s*,\s*tag\s*=\s*)"[^"]*"/g,
    (_m, prefix) => `${prefix}"${version}"`,
  );
  if (updated !== original) {
    writeFileSync(file, updated);
    console.log(`updated aztec-nr tag in ${file.replace(root + "/", "")}`);
  }
}

console.log(`\nPinned Aztec version -> ${version}`);
console.log(`Next: run \`aztec-up -v ${version.replace(/^v/, "")}\`, then \`npm install\` and \`npm run build:contracts\`.`);
