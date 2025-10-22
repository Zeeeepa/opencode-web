#!/usr/bin/env bun
import { $ } from "bun";
import { Script } from "@opencode-ai/script";

const root = new URL("..", import.meta.url).pathname;
process.chdir(root);

console.log(`Building opencode-web server v${Script.version}`);

await $`rm -rf release dist`;

console.log("Building client assets...");
await $`bun run build`;

console.log("Assembling package...");
await $`mkdir -p release/package`;
await $`cp -r dist release/package/`;
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

console.log(`Build complete: release/${archiveName}.tar.gz`);
