# Project Creation Findings

- Creating sessions without extra parameters hits the default project resolved from the server's process working directory. The API layer populates the project context by wrapping every request in `Instance.provide`, which pulls the `directory` query parameter (falling back to `process.cwd()`). See `packages/opencode/src/server/server.ts:124`.
- `Instance.provide` lazily calls `Project.fromDirectory`. That lookup walks up from the directory to find a `.git` folder; if a repository root is found, the first commit SHA becomes the project ID and is cached via `Storage.write` under `storage/project/<id>.json`. If no `.git` is found, the project is hard-coded to an ID of `global` with a worktree of `/`, so all sessions collapse into that bucket. See `packages/opencode/src/project/instance.ts:14` and `packages/opencode/src/project/project.ts:25`.
- The server only exposes two project endpoints (`GET /project` and `GET /project/current`). There is no REST entry point to create/initialize a project or to bind sessions to an arbitrary project ID. See `packages/opencode/src/server/project.ts:7`. The `specs/project.md` document still lists a planned `POST /project/init`, but it has not been implemented.
- Sessions inherit the resolved project automatically during creation. The `Session.create` handler writes each new session beneath `storage/session/<projectID>/<sessionID>.json` and stores the request directory alongside the project ID, but does not allow callers to override that project binding. See `packages/opencode/src/session/index.ts:100`.
- The JavaScript SDK mirrors this behavior. `Session.create` accepts a `query.directory` parameter, which maps directly to the server’s `directory` query string. Without it, the server keeps using `process.cwd()`, so SDK consumers will always create sessions inside the default project. See `packages/sdk/js/src/gen/types.gen.ts:1387`.

## How to Create a Project Programmatically (Current Behavior)

1. Ensure the target directory is (or becomes) a Git repository. `Project.fromDirectory` only distinguishes projects by finding a `.git` directory; otherwise, everything falls back to the `"global"` project.
2. Make any API call with the `directory` query string set to that path (for example, `GET /project/current?directory=/path/to/repo` or `POST /session?directory=/path/to/repo`). The first request primes storage with a `Project` record for that repo.
3. Subsequent session creations should reuse the same `directory` query parameter to keep writing into that project’s namespace.

There is currently no way to create multiple projects inside the same Git worktree, nor to create non-Git projects, because the resolver always normalizes to the repository root or the `"global"` fallback.

## Gaps & Recommendations

1. Implement the planned project endpoints (`POST /project/init` at minimum) so callers can register folders that are not Git roots, or register metadata (aliases, titles) before creating sessions.
2. Add a way to supply `projectID` explicitly when creating sessions or expose a dedicated project-creation API that returns the ID/session base path.
3. Update the SDK to surface helper methods (e.g., `client.project.ensure({ directory })`) that wrap the `directory` query usage so consumers do not need to remember the query-string contract.
