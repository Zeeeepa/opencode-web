#!/usr/bin/env bun
import { $ } from "bun";
import { Script } from "@opencode-ai/script";

const root = new URL("..", import.meta.url).pathname;
process.chdir(root);

const log = (prefix: string, message: string) => console.log(`${prefix} ${message}`);

const RELEASE_REPO = "kcrommett/opencode-web";

async function resolvePreviousVersion(): Promise<string | null> {
  const endpoint = `https://api.github.com/repos/${RELEASE_REPO}/releases/latest`;

  try {
    const response = await fetch(endpoint, {
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "opencode-web-release-script",
      },
    });

    if (response.ok) {
      const data = (await response.json()) as { tag_name?: string };
      if (data.tag_name) {
        return data.tag_name.replace(/^v/, "").trim();
      }
    }
  } catch {
    log("⚠️", "Unable to determine previous release via GitHub API");
  }

  try {
    const tag = (await $`git describe --tags --abbrev=0`.text()).trim();
    if (tag) {
      return tag.replace(/^v/, "");
    }
  } catch {
    log("ℹ️", "No existing tags found locally; treating release as initial publish");
  }

  return null;
}

async function collectReleaseNotes(previousVersion: string | null): Promise<string[]> {
  const notes: string[] = [];

  if (!previousVersion) {
    notes.push("- Initial release");
    return notes;
  }

  try {
    const commits = await $`git log v${previousVersion}..HEAD --oneline --format="%h %s"`.text();
    for (const line of commits.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      if (/\b(feat|fix|break)\b/i.test(trimmed)) {
        const spaceIndex = trimmed.indexOf(" ");
        notes.push(`- ${spaceIndex === -1 ? trimmed : trimmed.slice(spaceIndex + 1)}`);
      }
    }
  } catch (error) {
    log("⚠️", `Failed to derive changelog entries: ${(error as Error).message}`);
  }

  return notes;
}

async function updatePackageVersions(version: string) {
  const glob = new Bun.Glob("**/package.json");
  const files: string[] = [];

  for await (const file of glob.scan({ absolute: true })) {
    if (file.includes("node_modules") || file.includes("/release/")) continue;
    files.push(file);
  }

  files.sort();

  for (const file of files) {
    const contents = await Bun.file(file).text();
    const next = contents.replace(/"version": "[^"]+"/g, `"version": "${version}"`);
    if (next !== contents) {
      await Bun.write(file, next);
      log("📝", `Updated version in ${file}`);
    }
  }
}

async function ensureDependencies() {
  log("📦", "Installing workspace dependencies...");
  await $`bun install`;
}

async function buildReleaseArtifact() {
  log("🏗️", "Building release artifact...");
  await import("./build");
}

async function commitAndTag(version: string) {
  const status = (await $`git status --porcelain`.text()).trim();
  if (!status) {
    log("ℹ️", "No changes detected, skipping commit and tag");
    return false;
  }

  await $`git add .`;
  await $`git commit -m ${`release: v${version}`}`;
  await $`git tag v${version}`;
  return true;
}

async function pushChanges(versionCommitted: boolean) {
  if (!versionCommitted) return;
  const branch = (await $`git rev-parse --abbrev-ref HEAD`.text()).trim();
  log("⬆️", `Pushing release commit and tags to ${branch}...`);
  await $`git push origin ${branch} --tags --no-verify --force-with-lease`;
}

async function createGitHubRelease(version: string, notes: string[]) {
  const releaseNotes = notes.length > 0 ? notes.join("\n") : "No notable changes";
  const notesPath = `release/notes-v${version}.md`;
  await $`mkdir -p release`;
  await Bun.write(notesPath, `${releaseNotes}\n`);

  log("🎉", "Creating GitHub release...");
  await $`gh release create v${version} --title ${`v${version}`} --notes-file ${notesPath} ./release/opencode-web-server-v${version}.tar.gz`;

  try {
    await $`rm -f ${notesPath}`;
  } catch {
    // ignore cleanup issues
  }

  log("✅", "Release complete!");
}

async function run() {
  log("🚀", `Publishing opencode-web server v${Script.version}`);

  const preview = Script.preview;
  const previousVersion = preview ? null : await resolvePreviousVersion();
  const notes = preview ? [] : await collectReleaseNotes(previousVersion);

  log("📋", "Updating package versions...");
  await updatePackageVersions(Script.version);

  await ensureDependencies();
  await buildReleaseArtifact();

  if (preview) {
    log("🔍", "Preview build complete - skipping release automation");
    return;
  }

  const committed = await commitAndTag(Script.version);
  await pushChanges(committed);
  await createGitHubRelease(Script.version, notes);
}

await run().catch((error) => {
  log("❌", error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
