# OpenCode Web Release Plan

## Overview

This document outlines the release mechanism for opencode-web when distributed as a self-hosted server package. The objective is to generate reproducible artifacts that bundle the server entrypoint, static client assets, and release metadata so operators can run opencode-web on their own infrastructure. Hosted deployments, Docker images, and CDN rollouts are intentionally out of scope.

## Current State Analysis

Based on research of the upstream sst/opencode repository:

### Main Repository Release Components
1. **Build System** (`packages/opencode/script/build.ts`):
   - Cross-platform binary compilation (Windows, Linux, macOS)
   - Multiple architecture support (x64, arm64, x64-baseline)
   - Web-based server package
   - Platform-specific packaging with optional dependencies

2. **Publish Orchestrator** (`script/publish.ts`):
   - Multi-package publishing coordination
   - AI-generated changelog using OpenCode
   - Automated version bumping across package.json files
   - Git tag creation and GitHub releases
   - NPM publishing with platform-specific packages
   - AUR (Arch Linux) package generation
   - Homebrew formula updates

3. **GitHub Actions** (`.github/workflows/publish.yml`):
   - Manual workflow dispatch with version bump options
   - Environment setup (Go, Bun, makepkg)
   - Secure credential handling
   - Automated release execution

Only the build orchestration, version management, and GitHub Release automation pieces apply to opencode-web. Registry publishing and container distribution are excluded.

## Proposed Release System for opencode-web

### Phase 1: Build Infrastructure

#### 1.1 Build Script (`script/build.ts`)
```typescript
#!/usr/bin/env bun
import { $ } from "bun";
import { Script } from "@opencode-ai/script";

const root = new URL("..", import.meta.url).pathname;
process.chdir(root);

console.log(`🏗️  Building opencode-web server v${Script.version}`);

await $`rm -rf release dist`;

console.log("📦 Building client assets...");
await $`bun run build`;

console.log("📋 Assembling package...");
await $`mkdir -p release/package/client`;
await $`cp -r dist/. release/package/client`;
await $`cp server.ts release/package/`;
await $`cp package.json release/package/`;
await $`cp bun.lock release/package/`;

const commit = (await $`git rev-parse HEAD`.text()).trim();
const branch = (await $`git rev-parse --abbrev-ref HEAD`.text()).trim();

const buildInfo = {
  version: Script.version,
  channel: Script.channel,
  buildTime: new Date().toISOString(),
  commit,
  branch,
  buildNumber: process.env.GITHUB_RUN_NUMBER ?? "local",
};

await Bun.write(
  "release/package/build-info.json",
  JSON.stringify(buildInfo, null, 2),
);

const archiveName = `opencode-web-server-v${Script.version}`;
await $`cd release && tar -czf ${archiveName}.tar.gz package`;

console.log(`✅ Build complete: release/${archiveName}.tar.gz`);
```

This script produces a single tarball containing everything needed to run the server (`server.ts`, static client assets under `client/`, dependency manifests, and build metadata).

#### 1.2 Workspace Setup

**`package.json`** (root):
```json
{
  "name": "opencode-web",
  "version": "0.1.0",
  "private": true,
  "workspaces": [
    "packages/*"
  ],
  "scripts": {
    "dev": "vite dev --host",
    "build": "vite build",
    "build:release": "bun ./script/build.ts",
    "start": "bun server.ts",
    "lint": "bun run lint",
    "test": "bun test",
    "typecheck": "bun x tsc --noEmit",
    "publish": "bun ./script/publish.ts"
  }
}
```

### Phase 2: Release Automation

#### 2.1 Script Package Setup

Create a local `@opencode-ai/script` helper for version/channel management.

**`packages/script/package.json`**:
```json
{
  "$schema": "https://json.schemastore.org/package",
  "name": "@opencode-ai/script",
  "version": "0.1.0",
  "private": true,
  "exports": {
    ".": "./src/index.ts"
  }
}
```

**`packages/script/src/index.ts`**:
```typescript
import { readFileSync } from "node:fs";

const rootPackagePath = new URL("../../package.json", import.meta.url);

const readRootPackage = () =>
  JSON.parse(readFileSync(rootPackagePath, "utf8")) as { version: string };

const bumpVersion = (current: string, bump: "major" | "minor" | "patch") => {
  const [major, minor, patch] = current.split(".").map(Number);
  switch (bump) {
    case "major":
      return `${major + 1}.0.0`;
    case "minor":
      return `${major}.${minor + 1}.0`;
    default:
      return `${major}.${minor}.${patch + 1}`;
  }
};

export const Script = {
  get version() {
    const bump = process.env.OPENCODE_BUMP as "major" | "minor" | "patch" | undefined;
    if (!bump) throw new Error("OPENCODE_BUMP not set");
    const pkg = readRootPackage();
    return bumpVersion(pkg.version, bump);
  },
  get channel() {
    return process.env.OPENCODE_CHANNEL ?? "latest";
  },
  get preview() {
    return this.channel === "preview";
  }
};
```

#### 2.2 Publish Script (`script/publish.ts`)
```typescript
#!/usr/bin/env bun
import { $ } from "bun";
import { Script } from "@opencode-ai/script";

const root = new URL("..", import.meta.url).pathname;
process.chdir(root);

console.log(`🚀 Publishing opencode-web server v${Script.version}`);

const notes: string[] = [];

if (!Script.preview) {
  const previousTag = await fetch(
    "https://api.github.com/repos/kcrommett/opencode-web/releases/latest",
  )
    .then((res) => (res.ok ? res.json() : { tag_name: "v0.0.0" }))
    .then((data) => (data.tag_name as string).replace("v", ""));

  const commits = await $`git log v${previousTag}..HEAD --oneline --format="%h %s"`.text();

  console.log("📝 Generating changelog...");
  for (const line of commits.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (/\b(feat|fix|break)\b/.test(trimmed)) {
      notes.push(`- ${trimmed.substring(trimmed.indexOf(" ") + 1)}`);
    }
  }
}

console.log("📋 Updating version numbers...");
const glob = new Bun.Glob("**/package.json");
const files: string[] = [];

for await (const file of glob.scan({ absolute: true })) {
  if (file.includes("node_modules") || file.includes("/release/")) continue;
  files.push(file);
}

for (const file of files) {
  const contents = await Bun.file(file).text();
  const updated = contents.replace(/"version": "[^"]+"/g, `"version": "${Script.version}"`);
  await Bun.write(file, updated);
  console.log("Updated:", file);
}

await $`bun install`;

console.log("🏗️  Building release artifact...");
await import("./build.ts");

if (!Script.preview) {
  console.log("📚 Committing changes...");
  await $`git add .`;
  await $`git commit -m "release: v${Script.version}"`;
  await $`git tag v${Script.version}`;
  await $`git push origin main --tags --no-verify --force-with-lease`;

  console.log("🎉 Creating GitHub release...");
  const releaseNotes = notes.length > 0 ? notes.join("\n") : "No notable changes";
  await $`gh release create v${Script.version} --title "v${Script.version}" --notes "${releaseNotes}" ./release/opencode-web-server-v${Script.version}.tar.gz`;

  console.log("✅ Release complete!");
} else {
  console.log("🔍 Preview build complete - no release created");
}
```

### Phase 3: CI Pipeline

#### 3.1 Composite Action for Bun Setup (`.github/actions/setup-bun/action.yml`)
```yaml
name: "Setup Bun with caching"
description: "Setup Bun with caching and install dependencies"
runs:
  using: "composite"
  steps:
    - name: Setup Bun
      uses: oven-sh/setup-bun@v2
      shell: bash

    - name: Cache ~/.bun
      id: cache-bun
      uses: actions/cache@v4
      with:
        path: ~/.bun
        key: bun-${{ runner.os }}-${{ hashFiles('**/bun.lock') }}
        restore-keys: |
          bun-${{ runner.os }}-

    - name: Install dependencies
      run: bun install
      shell: bash
```

#### 3.2 GitHub Actions Workflow (`.github/workflows/release.yml`)
```yaml
name: release
run-name: "${{ format('release {0}', inputs.bump) }}"

on:
  workflow_dispatch:
    inputs:
      bump:
        description: "Bump major, minor, or patch"
        required: true
        type: choice
        options:
          - major
          - minor
          - patch

concurrency: ${{ github.workflow }}-${{ github.ref }}

permissions:
  contents: write

jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Setup Bun
        uses: ./.github/actions/setup-bun

      - name: Setup Git
        run: |
          git config --global user.email "bot@opencode.ai"
          git config --global user.name "opencode-web-bot"

      - name: Run tests
        run: bun run test

      - name: Run linting
        run: bun run lint

      - name: Type check
        run: bun x tsc --noEmit

      - name: Build and publish server package
        run: bun ./script/publish.ts
        env:
          OPENCODE_BUMP: ${{ inputs.bump }}
          OPENCODE_CHANNEL: latest
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

### Phase 4: Distribution Strategy

#### 4.1 Release Artifact
- `opencode-web-server-v{version}.tar.gz`: Contains `server.ts`, compiled client assets under `client/`, dependency manifests, and `build-info.json`.

#### 4.2 Distribution Channel
- **GitHub Releases**: Sole distribution point for operators to download the server package.

#### 4.3 Operator Checklist
- Download the archive from the matching Git tag.
- Extract contents on the target host.
- Run `bun install --production` inside the extracted directory.
- No localhost configuration required: the packaged server assumes an OpenCode backend on `http://localhost` and serves the client for browser access at `http://localhost`.
- Start the server with `bun server.ts` (or wrap with a process manager such as systemd or pm2).

### Implementation Timeline

#### Week 1: Foundation
- [x] Create `packages/script` package with version helpers.
- [x] Implement `script/build.ts` to assemble server release artifacts.
- [x] Update `package.json` workspace scripts.
- [x] Verify local release build produces expected tarball (2025-10-22 via `OPENCODE_BUMP=patch OPENCODE_CHANNEL=latest bun run build:release`, yielding `release/opencode-web-server-v0.1.1.tar.gz`).

#### Week 2: Automation
- [x] Implement `script/publish.ts` with changelog, version bump, and archive upload.
- [x] Add `.github/actions/setup-bun/action.yml` composite action.
- [x] Configure `.github/workflows/release.yml`.
- [x] Seed required GitHub secrets (only `GITHUB_TOKEN`).
  - Uses repository-provided `GITHUB_TOKEN`; ensure Actions permission for `contents: write`.
- [ ] Dry-run release workflow on a non-production branch.
  - Pending manual trigger: dispatch the workflow from a feature branch with `bump=patch`, temporarily set `OPENCODE_CHANNEL=preview`, and verify build logs without publishing.

#### Week 3: Hardening
- [ ] Configure GitHub Release template and verify artifact contents.
- [ ] Document operator installation instructions alongside the release.
- [ ] Establish rollback procedure (re-tag previous version and upload prior artifact).
- [ ] Capture post-release validation steps (smoke test on fresh host).

#### Week 4: Release Execution
- [ ] Conduct release readiness review (publish script output, workflow inputs, release notes draft).
- [ ] Trigger GitHub `release` workflow with agreed semantic bump and channel.
- [ ] Monitor CI jobs, validate uploaded artifact checksum, and confirm tag alignment.
- [ ] Announce release availability in maintainer channels and update CHANGELOG with final notes.

#### Week 5: Post-Release Monitoring
- [ ] Collect operator feedback and triage any reported regressions or installation issues.
- [ ] Record download metrics, checksum confirmations, and workflow duration in the release log.
- [ ] Schedule follow-up backlog grooming focused on automation gaps discovered during release.
- [ ] Prep preview-channel experiment plan, including decision gates for future iterations.

### Security Considerations

1. **Secret Management**
   - Use GitHub-provided `GITHUB_TOKEN`; no registry tokens required.
   - Scope additional tokens (if ever needed) to release automation only.
   - Rotate credentials during regular security reviews.

2. **Dependency Scanning**
   - Enable Dependabot for Bun/JS dependencies.
   - Review dependency updates before release bumps.

3. **Code Signing**
   - Publish SHA256 checksums alongside the tarball for operators to verify integrity.
   - Consider GPG-signing Git tags in a future iteration.

4. **Access Control**
   - Limit workflow dispatch permissions to release maintainers.
   - Enforce branch protection and required reviews on `main`.

### Monitoring and Maintenance

1. **Release Metrics**
   - Track GitHub release download counts.
   - Record release metadata (version, date, checksum) in CHANGELOG.md.

2. **Build Performance**
   - Monitor workflow duration and failure rates via GitHub Actions insights.
   - Alert maintainers on failed release runs.

3. **Error Tracking**
   - Ensure release workflow logs are retained for auditing.
   - Provide operators with guidance for reporting issues discovered post-release.

4. **Documentation**
   - Keep `RELEASE_PLAN.md` and operational runbooks updated.
   - Maintain a troubleshooting section for common self-hosting issues.

### Future Enhancements

1. **Automated Testing**
   - Add E2E smoke tests that execute against the packaged server.
   - Include accessibility and performance checks in CI.

2. **Rollback Mechanism**
   - Automate rollback GitHub release creation using the previous artifact.
   - Add health-check script that operators can run after upgrade.

3. **Preview Channel**
   - Optional “preview” channel that publishes unsigned artifacts for internal testing without tagging latest.

4. **Feature Flags**
   - Simplify toggling experimental features via environment-variable driven flags documented per release.

5. **Snapshot Builds**
   - Provide nightly snapshot archives with a commit-based identifier for advanced testers.

### Key Differences from sst/opencode

1. **Self-Hosted Only**: opencode-web ships as a server package; no managed hosting or container images.
2. **No Registry Publishing**: Artifacts are distributed exclusively through GitHub Releases.
3. **Simpler Build**: Only Bun/Vite pipelines—no Go binaries or multi-architecture compilation.
4. **Lean CI**: Single release workflow; no preview, Docker, or environment deployments.
5. **Repository**: Uses `kcrommett/opencode-web` with Bun-first tooling.

## Conclusion

This plan defines a lightweight yet reliable release process tailored for self-hosted deployments of opencode-web. By focusing on reproducible server packages, automating version management, and streamlining the CI workflow, we can deliver consistent artifacts without maintaining public hosting infrastructure.
