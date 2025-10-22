# OpenCode Web Interface

OpenCode Web is a web-based interface for the OpenCode Server API, providing a browser-based way to interact with OpenCode sessions. Built on TanStack Start, React, and Bun, it offers a complete web experience for managing and monitoring OpenCode workflows.

## Why a web interface?
- Access OpenCode sessions from any browser without additional software installation
- Real-time monitoring of active sessions with live updates
- Browser-native features like screenshots, downloads, and responsive design
- Ideal for demonstrations, training, and remote collaboration

## Feature Highlights

### Session continuation anywhere
Reconnect to an existing conversation with full command history, agent context, and pending tasks so you can pick up work between devices.  
![New session walkthrough](docs/screenshots/session-new.png)

### Live session timeline
Follow model outputs, reasoning traces, and tool runs via Server-Sent Events so you always know what the agent is doing—even from your phone.  
![Session timeline with history](docs/screenshots/session-history.png)

### Multi-agent command deck
Switch between saved agent presets, route complex tasks to specialists, and keep context switching frictionless from the browser.  
![Agent picker modal](docs/screenshots/picker-session.png)

### Model + command palette
Quick access to different AI models with an intuitive picker interface
![Model picker details](docs/screenshots/picker-model.png)

### File-aware problem solving
Browse project trees, view files, and download artifacts directly from the web interface. Syntax highlighting keeps context rich.  
![File browser with syntax highlighting](docs/screenshots/file-browser.png)

### Inline asset preview
Quickly view images and animations in your browser, or download other binary files.
![Inline asset preview](docs/screenshots/file-image.png)

### Theme gallery for every setup
Toggle between opencode color palettes to match whatever theme you prefer.  
![OpenCode theme](docs/screenshots/theme-opencode.png)  
![Dracula theme](docs/screenshots/theme-dracula.png)  
![Tokyo Night theme](docs/screenshots/theme-tokyonight.png)

### One-tap PWA install
Progressive Web App hooks keep the client a tap away with full-screen, app-like usage—ideal for tablets or a second monitor.  
![PWA install prompt](docs/screenshots/picker-theme.png)

## Architecture at a Glance
- **TanStack Start + React Router** power hybrid SSR/CSR routing with file-based conventions.
- **Bun server (`server.ts`)** proxies event streams to the OpenCode backend and serves the compiled client.
- **Shared lib layer** (`src/lib/`) wraps the OpenCode HTTP API for seamless integration.
- **Composable UI primitives** in `src/app/_components/ui/` provide a consistent design system.

## Requirements
- Bun 1.3.x (toolchain pinned in `bunfig.toml`)
- Node.js 18+ for editor integrations and lint tooling
- Running OpenCode server (default port 4096)

## Getting Started

1. **Install dependencies**
   ```bash
   bun install
   ```
2. **Configure environment**  
   Create `.env.local` and point the client at your OpenCode server:
   ```bash
   VITE_OPENCODE_SERVER_URL=http://localhost:4096
   ```
3. **Run the dev server**
   ```bash
   bun run dev
   ```
   The app listens on [http://localhost:3000](http://localhost:3000). Replace `localhost` with a LAN IP to check in from another device on the same network.

## Production Build & Serve

1. **Build the client + SSR bundles**
   ```bash
   bun run build
   ```
   Compiled assets land in `dist/client` (static) and `dist/server` (SSR handler).
2. **Serve the production bundle**
   ```bash
   bun run start
   ```
   The `start` script executes `server.ts`, which:
   - Loads the TanStack Start handler from `dist/server/server.js`
   - Serves static assets from `dist/client`
   - Proxies `/api/events` to your OpenCode server for SSE streaming

Set `PORT`, `VITE_OPENCODE_SERVER_URL`, or `NODE_ENV` to customize runtime behavior.

## Project Structure
```
src/
├── app/                        # TanStack Start routes & UI components
│   └── _components/            # Message renderers, UI primitives, dialogs, pickers
├── contexts/                   # React contexts for session + theme state
├── hooks/                      # Reusable hooks around OpenCode data flows
├── lib/                        # HTTP client, command parser, theme helpers
├── router.tsx                  # Router configuration
server.ts                       # Bun production server wrapper
vite.config.ts                  # Vite + TanStack Start configuration
```

Key entry points include:
- `src/lib/opencode-server-fns.ts` – server-side wrappers for the OpenCode HTTP API
- `src/app/_components/message/` – renders reasoning, snapshots, tool output, and patches
- `src/app/_components/ui/` – button, dialog, picker, and form controls

## Helpful Commands
- `bun run dev` – launch the development server with hot reload
- `bun run build` – produce production-ready client + SSR bundles
- `bun run start` – serve the compiled build via the Bun runtime
- `bun run lint` – enforce shared ESLint rules
- `bun x tsc --noEmit` – typecheck without generating artifacts
- `bun run test` – run Playwright smoke tests when present

## Development Notes
- Silence logs in production by guarding with `if (process.env.NODE_ENV !== "production")`.
- Favor Bun utilities (e.g., `Bun.file`) in shared helpers when they simplify IO or streaming.
- Keep server function schemas synced with the OpenCode SDK.
- Confirm UI changes in both desktop and mobile breakpoints.

## Contributing
Follow the shared contributor handbook in `AGENTS.md`. Before opening a PR, run lint + typecheck, describe UI-visible changes, and flag any server-function updates.
