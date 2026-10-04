# Chrome DevTools MCP (`chrome-devtools-mcp`) — research findings for eguidar

> **Research-only document.** Every factual claim below is traced to a primary source: the official ChromeDevTools repository (README, generated documentation, source tree, package metadata, releases, and commit API), official Model Context Protocol and Chrome documentation, or files read in this eguidar checkout. **Retrieval date for all sources: 24 September 2026 (UTC).** The upstream `main` branch was inspected at commit `3c12a91c38386485164e2605c4cbac3adf2911d9`; npm `@latest` resolved to `1.10.1` on that date. [R30][R31][R33][R34] No application code, package file, or runtime configuration was modified.

## Summary

- `chrome-devtools-mcp` is the Chrome DevTools team's MCP server for coding agents. It lets an agent inspect and control a live Chrome browser, record performance traces, inspect network/console data, and run browser-oriented debugging workflows. The repository also ships an experimental terminal CLI. [R1][R40]
- **Assessment:** It is best understood as a **local browser-control tool server**, not as an LLM and not as a Next.js runtime integration. An MCP host (for example an editor or coding agent) starts the server as a subprocess; the server exposes named tools whose calls are translated into Puppeteer and Chrome DevTools operations. [R35][R15][R16]
- The package's server manifest and executable use the MCP **stdio** transport. The project does not expose a native Streamable HTTP endpoint in the source inspected here; the repository's HTTP example wraps the stdio server with an external `mcp-proxy`. [R3][R15][R8]
- The npm release available on the retrieval date is **1.10.1**, published on 23 September 2026. The repository's `main` branch is already ahead of that release: its generated tool reference contains one additional memory tool (`analyze_heapsnapshot_contexts`). This distinction matters when reproducing an install with `@latest`. [R4][R5][R31][R32][R33][R34]
- **Assessment/recommendation:** For eguidar, the practical fit is strong as a **developer/QA instrument** for the rendered Next.js storefront and Administration, but it should not become an application dependency. The local project already starts its web app and backing services independently; the MCP server can inspect that running site without changing the app. [L2][L3][L7][L8]

## 1. What the MCP server is

MCP has three relevant roles: an **MCP host** is the AI application, an **MCP client** is its connection to one server, and an **MCP server** is the program that provides context or executable tools. The protocol is transport-agnostic at its data layer; the binding determines how JSON-RPC messages are delivered. [R35][R43]

In this project, the server is primarily a tool provider. The official description says that it gives a coding agent control over and insight into a live Chrome browser, and the README identifies performance insights, browser debugging, screenshots, network/console inspection, and Puppeteer-driven reliable automation as its key features. [R1] The server implementation constructs an MCP server, registers each tool with a description and input schema, and exposes logging; tool handlers then resolve a browser context and execute the selected operation. [R15][R16][R20]

The server is intentionally agent-agnostic. The upstream design principles call for standards-based interoperability rather than coupling the API to one model, and recommend composable, token-conscious tools. [R12]

### The important trust boundary

The upstream README warns that `chrome-devtools-mcp` exposes the content of the browser instance to MCP clients, allowing them to inspect, debug, and modify browser or DevTools data. The project therefore assumes that the calling agent and its human operator have established an appropriate trust boundary. [R1][R10]

That boundary is broader than a read-only DOM viewer. Depending on the enabled tools, the server can navigate and click, execute JavaScript, read network headers and bodies, capture screenshots and traces, write files, load extensions, install/launch PWAs, and inspect heap snapshots. [R4][R10]

## 2. Architecture and request lifecycle

The current source can be summarized as this pipeline:

```text
MCP host / MCP client
        │  MCP JSON-RPC over stdio
        ▼
Node `chrome-devtools-mcp` process
        │  argument parsing, tool registration, Zod validation
        ▼
ToolHandler + McpContext
        │  lazy browser/context resolution, page routing, formatting
        ▼
BrowserManager ── Puppeteer ── Chrome / Chrome DevTools Protocol
        │                         │
        │                         ├─ pages, tabs, isolated contexts
        │                         ├─ accessibility snapshots and UIDs
        │                         ├─ network + console collectors
        │                         ├─ DevTools frontend models/CSS/trace data
        │                         └─ Lighthouse runner
        ▼
MCP response: text, images, structured content, and/or files
```

The diagram is a synthesis of the entrypoint, server, browser manager, context/page, collector, snapshot, and dependency source files. [R15][R16][R17][R18][R19][R21][R22][R23]

### 2.1 Process and transport layer

The package exposes two binaries, `chrome-devtools-mcp` and `chrome-devtools`. The executable wrapper checks supported Node versions; the main MCP entrypoint parses command-line options, creates a `BrowserManager` and `McpServer`, and connects the server to `StdioServerTransport`. It shuts down when the client's stdin closes or when it receives a termination signal. [R2][R15][R47]

The server manifest advertises the package as `io.github.ChromeDevTools/chrome-devtools-mcp`, version `1.10.1`, with a `stdio` transport. [R3] This is the MCP client/server transport; it is distinct from the way the server talks to Chrome.

### 2.2 Lazy browser initialization

Creating the MCP process does not necessarily create a browser. The server registers tools first, and a browser is initialized when a tool call needs an `McpContext`. The README explicitly says that connecting the MCP server alone does not start Chrome; the first relevant tool call does. [R1][R16][R17]

This is useful for editor startup: an agent can load the server and decide later whether browser automation is needed. It also means that connection or startup success is not proof that Chrome itself is usable; the first browser tool call is the meaningful integration test. [R1][R11]

### 2.3 Tool registration, validation, and serialization

`McpServer` asks `createTools` for the enabled tool set and registers each definition through the MCP SDK. `ToolHandler` turns the tool's Zod shape into a strict input schema, checks category/feature conditions, acquires a shared mutex, resolves the selected page or browser context, invokes the handler, formats the response, and records telemetry when enabled. [R16][R20]

The shared mutex means tool calls handled by one server instance are serialized. For concurrent agent sessions, the default `pageIdRouting` option adds a `pageId` to page-scoped tools so a caller can route a call to the intended tab; `--no-page-id-routing` restores selected-page-only behavior. [R7][R24][R20]

### 2.4 Browser and page model

`BrowserManager` chooses between two modes. With no connection option it launches Chrome; with `browserUrl`, `wsEndpoint`, or `autoConnect` it calls Puppeteer's connect path. The launched browser uses Puppeteer's `pipe: true` mode, a persistent user-data directory by default, a stable Chrome channel, and a target filter. [R17]

`McpContext` owns the browser-level state: page IDs, selected-page state, isolated browser contexts, extension service workers, heap-snapshot state, filesystem roots, and network allow/block rules. It creates an `McpPage` for each eligible page and listens for target creation and destruction. [R18]

`McpPage` wraps one Puppeteer page and owns its dialog, snapshot, emulation, network collector, console collector, DevTools session, and page-specific helpers. It can initialize a DevTools frontend session for data that is easier to obtain from Chrome's own models, and it adjusts timeouts when CPU or network throttling is active. [R19]

### 2.5 Accessibility snapshots and stable-ish element references

`take_snapshot` is based on Puppeteer's accessibility tree, includes iframes, and assigns an identifier (`uid`) to exposed elements; the implementation reuses an identifier when the same backend node is seen again. Input tools then resolve a UID back to a DOM element handle. The documentation tells agents to use the latest snapshot and prefer it to a screenshot when choosing an element. [R4][R22]

This is the central interaction model: snapshot the page, select a UID, then call an input or inspection tool. It also explains why an agent must take a new snapshot after a page changes; a UID from an older snapshot may no longer identify the intended element. [R4][R19][R22]

### 2.6 Event collection and response formatting

`PageCollector` attaches listeners to each page. The network collector retains recent requests and rotates history at navigations; the console collector retains console messages, uncaught errors, and DevTools-aggregated issues. The implementation caps per-navigation retention (1,000 network requests and 10,000 console messages) and keeps a small navigation history. [R21]

Tool responses are not limited to raw JSON. `McpResponse` can produce human-readable text, attached images, optional structured content, and file paths for large artifacts. Network bodies are size-limited when returned inline, and screenshots larger than the implementation threshold are saved to a temporary file rather than attached directly. [R48][R29][R44] The response and design principles intentionally optimize for semantic summaries and file references rather than returning very large raw payloads. [R12]

The tool reference's detailed JSON-like formatting and the response source are the authoritative references for the current output shape; client-specific rendering of images and structured content still depends on the MCP client. [R4][R35][R48]

## 3. Exposed tools and capabilities

### 3.1 Version boundary and counts

The generated tool reference on `main` lists **59 tools** across 11 categories: Input 10, Navigation 6, Emulation 2, Performance 3, Network 2, Debugging 9, Memory 14, Extensions 5, Third-party 2, WebMCP 2, and Progressive Web Apps 4. The `chrome-devtools-mcp-v1.10.1` tag lists **58** tools: the difference is the post-release `analyze_heapsnapshot_contexts` tool. [R4][R5][R31]

The counts above are counts of the generated reference, not a promise that every tool is active in every configuration. Categories and individual experimental conditions can disable tools, and the published npm package is the release tag rather than the later `main` snapshot. [R6][R20][R31]

### 3.2 Full inventory on `main`

| Category | Tools in the current `main` reference | What the category covers |
|---|---|---|
| **Input automation (10)** | `click`, `drag`, `fill`, `fill_form`, `handle_dialog`, `hover`, `press_key`, `type_text`, `upload_file`, `click_at` | UID-based element interaction, form filling, keyboard input, drag/drop, file upload, dialogs, and experimental coordinate clicking. `click_at` requires `--experimental-vision`. [R4][R6] |
| **Navigation automation (6)** | `close_page`, `list_pages`, `navigate_page`, `new_page`, `select_page`, `wait_for` | Tab discovery/selection, URL/back/forward/reload navigation, text waits, timeouts, `initScript`, and named isolated browser contexts. [R4][R6] |
| **Emulation (2)** | `emulate`, `resize_page` | Network and CPU throttling, geolocation, user agent, color scheme, viewport/mobile/touch settings, extra HTTP headers, and window resizing. [R4][R6] |
| **Performance (3)** | `performance_analyze_insight`, `performance_start_trace`, `performance_stop_trace` | Chrome tracing, Core Web Vitals-oriented performance analysis, raw trace files, and follow-up insight inspection. [R4][R6] |
| **Network (2)** | `get_network_request`, `list_network_requests` | Recent/preserved request lists, request and response headers/bodies, redirects, failures, and optional request/response files. The detailed tool can expose `Cookie` and `Set-Cookie` headers. [R4][R29] |
| **Debugging (9)** | `evaluate_script`, `get_console_message`, `get_css_styles`, `lighthouse_audit`, `list_console_messages`, `take_screenshot`, `take_snapshot`, `screencast_start`, `screencast_stop` | Page JavaScript, console/issue details, matched CSS, Lighthouse audits, screenshots, accessibility snapshots, and experimental screencast. `screencast_*` requires the experimental flag and ffmpeg. [R4][R6] |
| **Memory (14 on `main`; 13 in v1.10.1)** | `take_heapsnapshot`, `analyze_heapsnapshot_contexts`, `close_heapsnapshot`, `compare_heapsnapshots`, `get_heapsnapshot_class_nodes`, `get_heapsnapshot_details`, `get_heapsnapshot_dominators`, `get_heapsnapshot_duplicate_strings`, `get_heapsnapshot_edges`, `get_heapsnapshot_object_details`, `get_heapsnapshot_retainers`, `get_heapsnapshot_retaining_paths`, `get_heapsnapshot_summary`, `query_heapsnapshot_objects` | Heap capture, summaries, retained-size/object queries, retainers and paths, duplicate strings, snapshot comparison, and closure-context analysis. The analysis tools require `--memory-debugging`. [R4][R5][R6] |
| **Extensions (5)** | `install_extension`, `list_extensions`, `reload_extension`, `trigger_extension_action`, `uninstall_extension` | Inspect and operate unpacked extensions. This category is off by default and documented as pipe-only; `autoConnect`, `browserUrl`, and `wsEndpoint` are not supported for it in the current configuration guidance. [R4][R6] |
| **Third-party (2)** | `execute_3p_developer_tool`, `list_3p_developer_tools` | Discover and invoke developer tools exposed by the inspected page. This is experimental and off by default. [R4][R13] |
| **WebMCP (2)** | `execute_webmcp_tool`, `list_webmcp_tools` | Discover and execute WebMCP tools exposed by a page. This is experimental, off by default, and documented as requiring Chrome 150+ with `--enable-features=WebMCP`. [R4][R6] |
| **Progressive Web Apps (4)** | `get_os_app_state`, `install_pwa`, `launch_pwa`, `uninstall_pwa` | Inspect OS integration, install/launch/uninstall a PWA, and inspect badge/file-handler state. The category is off by default and pipe-only in the current guidance. [R4][R6] |

The generated reference contains the complete parameter schemas; the table above is an orientation map rather than a replacement for that reference. [R4]

### 3.3 Slim mode

`--slim` replaces the full tool set with exactly three tools: `navigate`, `evaluate`, and `screenshot`. This is intended for basic browser tasks and reduces the tool surface an agent has to choose from. [R6][R42]

### 3.4 Particularly useful debugging tools

- `get_css_styles` returns matched CSS rules, inline and inherited styles, custom properties, cascade wrappers, source line information, and winning/overridden declarations for a snapshot UID. It is useful when an agent needs to explain why a CSS rule wins rather than merely see a screenshot. [R4]
- `lighthouse_audit` covers accessibility, SEO, best practices, and agentic browsing; the tool description explicitly excludes performance. Performance work is handled by the separate trace tools. [R4]
- `evaluate_script` runs a JavaScript function in the page and returns JSON-serializable output. It can be disabled with `--no-javascript-evaluation`; in that mode the regular and slim evaluation tools, `initScript`, and `javascript:`, `data:`, and `vbscript:` navigation are disabled. [R6]
- `new_page` can create a named isolated browser context. Pages in one context share cookies/storage, while different contexts are isolated; the reference specifically describes this as useful for clean-slate authentication/cookie testing. [R4][R18]

## 4. Transports, clients, and setup

### 4.1 MCP transport versus Chrome connection transport

These are two different layers and are easy to conflate:

| Layer | Supported/observed mechanism | Evidence and qualification |
|---|---|---|
| **MCP client ↔ server** | **stdio**: the client launches the Node process and exchanges newline-delimited JSON-RPC over stdin/stdout. | The package manifest and executable explicitly use stdio. MCP's transport specification defines stdio and Streamable HTTP as standard transports. [R3][R15][R43] |
| **Server ↔ Chrome, launched mode** | Puppeteer process pipe (`pipe: true`) when the server launches Chrome. | This is an internal Puppeteer connection, not an MCP network transport. [R17] |
| **Server ↔ Chrome, attached mode** | `--browser-url` (HTTP remote-debugging endpoint), `--ws-endpoint` (WebSocket, optionally with custom headers), or `--auto-connect` (Chrome 144+). | These are documented Puppeteer connection modes. [R6][R7][R17] |
| **CLI daemon ↔ CLI commands** | Unix-domain socket on Linux/macOS or a named pipe on Windows. | This is an internal CLI daemon channel; the daemon then speaks MCP over stdio to the server. [R9] |
| **Native remote HTTP MCP endpoint** | **Not found in the current project source.** | The current server manifest and executable are stdio-only. The repository's Katalon recipe invokes an external `mcp-proxy --transport streamablehttp` around the stdio process; that is a wrapper, not a native server listener. [R3][R8][R15] |

### 4.2 Standard local configuration

The upstream README's minimal configuration is:

```json
{
  "mcpServers": {
    "chrome-devtools": {
      "command": "npx",
      "args": ["-y", "chrome-devtools-mcp@latest"]
    }
  }
}
```

The `-y`/`--yes` form avoids an interactive npm install prompt in clients that launch `npx` as a subprocess. The README says `@latest` intentionally follows the newest published version. [R1][R11]

For eguidar artifacts, a more explicit starting point is:

```json
{
  "mcpServers": {
    "chrome-devtools": {
      "command": "npx",
      "args": [
        "-y",
        "chrome-devtools-mcp@1.10.1",
        "--workspace=/config/workspace/eguidar",
        "--isolated"
      ]
    }
  }
}
```

`--workspace`/`--filesystem-root` grants file-writing tools a project root; `--isolated` uses a temporary browser profile that is removed when the browser closes. The upstream configuration defaults file access to the OS temp directory when no roots are available, so the explicit workspace is a deliberate expansion, not a no-op. [R6][R7][R10]

### 4.3 Client recipes published upstream

The repository publishes setup recipes rather than a formal compatibility matrix. Examples include Claude Code, Codex, Gemini CLI, VS Code/Copilot, Cursor, Cline, Amp, Antigravity, Bob, Devin, Factory, JetBrains, Kiro, OpenCode, Qoder, Warp, Windsurf, and others. [R8][R41]

Selected commands from the official guide are:

```bash
# Claude Code (MCP only)
claude mcp add chrome-devtools --scope user npx chrome-devtools-mcp@latest

# Codex
codex mcp add chrome-devtools -- npx chrome-devtools-mcp@latest

# Gemini CLI (MCP only)
gemini mcp add chrome-devtools npx chrome-devtools-mcp@latest
```

The same guide gives an OpenCode configuration:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "chrome-devtools": {
      "type": "local",
      "command": ["npx", "-y", "chrome-devtools-mcp@latest"]
    }
  }
}
```

Claude Code and Gemini can alternatively install the repository as a plugin/extension that bundles the MCP server with upstream skills. Those plugin paths require network access to the repository and are distinct from the plain `npx` MCP configuration. [R8][R11][R41]

On Windows, the troubleshooting guide recommends launching `npx` through `cmd /c` in clients whose process host cannot otherwise start the npm shim. [R11]

### 4.4 First smoke test

The upstream first prompt is:

```text
Check the performance of https://developers.chrome.com
```

A successful result should open the browser and produce a performance trace/report. This tests the MCP handshake, browser initialization, navigation, and performance path together. [R1]

## 5. How Chrome is launched or connected

### 5.1 Default launched instance

If no attached-browser option is supplied, the parser selects the stable channel and `BrowserManager` launches Chrome with Puppeteer. The launch includes a target filter, `pipe: true`, a null default viewport, optional proxy/Chrome arguments, and support for headless mode. [R17][R24][R25]

The default user-data directory is persistent and channel-specific:

- Linux/macOS: `$HOME/.cache/chrome-devtools-mcp/chrome-profile`
- Windows: `%USERPROFILE%\.cache\chrome-devtools-mcp\chrome-profile`
- Non-stable channels append the channel name, such as `chrome-profile-canary`. [R7][R17]

Only one browser can use that directory at a time. `--isolated` switches to a temporary profile that is cleaned up after the browser closes. [R7][R17]

The default MCP launch is headed (`--headless` defaults to false). The experimental CLI has different defaults: it enables headless mode and, when launching a new browser without an explicit user-data directory, defaults to an isolated profile. [R6][R9][R24]

### 5.2 Manual HTTP connection

To attach to a Chrome instance started elsewhere, configure:

```json
{
  "mcpServers": {
    "chrome-devtools": {
      "command": "npx",
      "args": [
        "-y",
        "chrome-devtools-mcp@1.10.1",
        "--browser-url=http://127.0.0.1:9222"
      ]
    }
  }
}
```

The browser must already be running with remote debugging enabled. The upstream guide warns that any local application able to reach the debugging port can control the browser, so sensitive browsing must not be happening while it is open. [R7][R17]

For example, on Linux:

```bash
/usr/bin/google-chrome \
  --remote-debugging-port=9222 \
  --user-data-dir=/tmp/eguidar-chrome-profile
```

Chrome's own security guidance says that, from Chrome 136, remote-debugging switches are not honored for the default data directory and require a non-default `--user-data-dir`; the upstream guide makes the same recommendation. [R7][R38]

### 5.3 WebSocket connection

For a direct CDP WebSocket endpoint:

```json
{
  "mcpServers": {
    "chrome-devtools": {
      "command": "npx",
      "args": [
        "-y",
        "chrome-devtools-mcp@1.10.1",
        "--ws-endpoint=ws://127.0.0.1:9222/devtools/browser/<id>",
        "--ws-headers={\"Authorization\":\"Bearer YOUR_TOKEN\"}"
      ]
    }
  }
}
```

`--ws-endpoint` accepts `ws://` or `wss://`; `--ws-headers` is only meaningful with that option. The option is useful when a proxy or tunnel already exposes a WebSocket endpoint. [R6][R17]

### 5.4 Automatic connection

For Chrome 144+, the upstream guide describes this sequence:

1. Open `chrome://inspect/#remote-debugging` in the running Chrome.
2. Enable incoming remote debugging and approve the connection prompt.
3. Start the MCP server with `--auto-connect`.

This mode attaches to the Chrome instance selected by the channel/user-data directory and can access all open windows for that selected profile. It does not launch Chrome for you. [R6][R7][R17]

### 5.5 Shutdown semantics

A browser launched by the MCP server is closed when the server shuts down. For an attached browser, the server disconnects but leaves the user's Chrome process running. This is a deliberate distinction in `BrowserManager`. [R17]

## 6. Notable configuration options

The generated configuration guide is the complete option reference. The following are the most consequential groups. [R6]

| Concern | Options | Practical meaning |
|---|---|---|
| **Tool surface** | `--slim`; `--category-input`, `--category-navigation`, `--category-emulation`, `--category-performance`, `--category-network`, `--category-debugging`, `--category-memory` | Reduce or exclude tool groups. Input, navigation, emulation, performance, network, debugging, and memory are on by default; extensions, third-party tools, WebMCP, and PWA tools are off by default. [R6][R26] |
| **Experimental gates** | `--experimental-vision`, `--experimental-screencast`, `--memory-debugging`, `--experimental-devtools`, `--experimental-structured-content`, `--experimental-include-all-pages` | Enable coordinate input, video capture, heap analysis, DevTools-target automation, structured responses, or broader page targets. Screencast requires ffmpeg. [R6] |
| **Browser lifecycle** | `--headless`, `--isolated`, `--user-data-dir`, `--channel`, `--executable-path` | Control UI mode, profile lifetime, Chrome channel, and executable. `--auto-connect`, `--browser-url`, and `--ws-endpoint` select attached-browser modes instead. [R6][R17] |
| **Chrome launch customization** | `--chrome-arg`, `--ignore-default-chrome-arg`, `--proxy-server`, `--accept-insecure-certs`, `--viewport` | Add/remove launch arguments, proxy Chrome, accept invalid certificates, or set the initial viewport. The certificate and Chrome-argument options carry explicit security trade-offs. [R6][R17] |
| **Page routing** | `--page-id-routing` / `--no-page-id-routing` | Require and use `pageId` for page-scoped tools. It is enabled by default for safer concurrent-session routing. [R6][R7] |
| **Browser network guardrails** | `--blocked-url-pattern`, `--allowed-url-pattern` | Restrict browser navigation and runtime requests using URLPattern patterns. The two options conflict; allowlisting requires Chrome 149+. The project warns this is not a complete sandbox. [R6][R10] |
| **JavaScript and source maps** | `--javascript-evaluation`, `--source-maps` | Disable page evaluation/init scripts and dangerous URL schemes, or disable DevTools source-map loading. [R6][R24] |
| **Response size** | `--screenshot-format`, `--screenshot-quality`, `--screenshot-max-width`, `--screenshot-max-height` | Use JPEG/WebP instead of PNG and downscale screenshots to reduce transfer and image-token cost. [R6][R44] |
| **Filesystem roots** | `--workspace` / `--filesystem-root`, `--allow-unrestricted-paths` | Restrict file-writing tools to configured roots, or explicitly restore permissive paths for a trusted legacy client. The latter is compatibility/deprecated behavior and should not be the default. [R6][R10][R24] |
| **Privacy** | `--performance-crux`, `--usage-statistics` | Disable CrUX field-data requests and Google usage-statistics collection respectively. `CI` and `CHROME_DEVTOOLS_MCP_NO_USAGE_STATISTICS` also disable usage statistics. [R1][R6][R24] |
| **Operations** | `--log-file`, `--config` | Send verbose logs to a file and load a JSON configuration file. Update checks can be disabled with `CHROME_DEVTOOLS_MCP_NO_UPDATE_CHECKS`. [R1][R6][R24] |

## 7. Security, privacy, and limitations

### 7.1 Security and privacy facts

1. **The browser is an execution and inspection surface.** The README explicitly warns that the server can expose browser/DevTools content to the MCP client. The tool set includes arbitrary page JavaScript, interaction, screenshots, network bodies, file writes, extensions, and heap data. [R1][R4][R10]

2. **Remote debugging is control of the browser, not read-only observation.** The upstream guide warns that any application on the machine can connect to an enabled debugging port and control the browser. Chrome now requires a non-default user-data directory for remote-debugging switches. [R7][R38]

3. **Web content is returned as data, not safely interpreted instructions.** The security policy says web content is returned as Markdown-like text or structured data as-is, and recommends trusted content or client-side precautions against prompt injection. [R10]

4. **File access has a roots boundary, but it is not a complete OS sandbox.** The server supports MCP roots, validates file paths against configured roots, and always includes the OS temp directory in its roots. The project recommends OS/VM sandboxing for full isolation. [R10][R18][R36]

5. **Remote file paths have a different boundary.** `upload_file` expects paths local to the browser instance, and the tool-handler validation deliberately skips local path validation for a remote browser because the MCP server does not access the remote host's filesystem. [R4][R20]

6. **Network header redaction is optional.** `--redact-network-headers` is off by default; without it, the detailed network formatter can return request and response headers, including sensitive cookie-related headers. [R6][R4][R29]

7. **Usage statistics are enabled by default.** The README says Google collects tool-invocation success, latency, and environment information; `--no-usage-statistics`, `CHROME_DEVTOOLS_MCP_NO_USAGE_STATISTICS`, or `CI` opt out. The implementation sends events to its default Google Clearcut endpoint, including app version, OS type, client category, tool name, success, bucketed latency, and sanitized/bucketed parameter metadata. The transformation code excludes `uid`, `reqid`, and `msgid` and reduces page URLs to a localhost boolean for the logged context. [R1][R6][R27][R28][R45]

8. **Performance tracing can send URLs to CrUX.** The README and configuration guide say field-performance lookups can send trace URLs to the Google Chrome UX Report API; `--no-performance-crux` disables that integration. [R1][R6][R38]

9. **Experimental capabilities expand the attack surface.** Extensions, third-party page tools, WebMCP, PWA installation, arbitrary evaluation, screencast, and memory analysis are separately gated. The third-party tool guide says page-defined tools execute in the page's context and do not grant privileges beyond what page code could already do, but enabling them still runs code supplied by the inspected site. [R6][R13]

10. **URL allow/block lists are defense in depth, not isolation.** The security policy says they apply to browser targets while the server is attached and do not replace an OS or VM network sandbox. [R10]

### 7.2 Security recommendations

The following are recommendations derived from the facts above, not upstream guarantees:

- **Use a dedicated browser profile for development.** Do not attach the agent to a browser profile that is simultaneously used for personal or production accounts. Prefer `--isolated` for a clean test run; use a manually started, dedicated profile only when a deliberate authenticated flow requires persistent state. [R1][R7]
- **Keep the remote debugging endpoint loopback-only and short-lived.** Bind or tunnel it to localhost, use a separate user-data directory, and stop Chrome as soon as the debugging session ends. [R7][R38]
- **Treat MCP output as untrusted input.** A page's text, console output, network body, or tool result can contain prompt-injection instructions. Keep an allowlist/policy in the coding agent and do not let page text authorize filesystem, shell, credential, or deployment actions. [R10]
- **Use the narrowest tool set that solves the task.** Start with `--slim` or disable categories that are not needed; leave JavaScript evaluation, extensions, third-party tools, WebMCP, PWA installation, and screencast off unless the task explicitly requires them. [R6][R10]
- **Prefer `--redact-network-headers` for routine debugging.** Use it when inspecting APIs or authenticated pages, and avoid retrieving/saving bodies unless necessary. [R6][R29]
- **Use `--no-performance-crux` and `--no-usage-statistics` for sensitive/internal work.** This reduces the documented external data flows, but it is not a promise that the browser or MCP client will not retain local artifacts. [R1][R6]
- **Do not expose an HTTP-wrapped server casually.** If an external proxy is used, bind locally, validate `Origin`, and add authentication; these are the MCP transport security requirements, not features automatically supplied by this package. [R43]
- **Pin the tested package version in team automation.** The README's `@latest` behavior is convenient for discovery, but the current `main`/npm release boundary shows why a pinned version is more reproducible. [R1][R4][R5]

### 7.3 Operational limitations

- Upstream officially supports Google Chrome and Chrome for Testing. Other Chromium-based browsers may work, but behavior is not guaranteed. The project says it is committed to fixes for the latest Extended Stable Chrome channel. [R1] Chrome for Testing is a dedicated, versioned flavor intended for browser automation and testing. [R39]
- The package requires Node `^20.19.0 || ^22.12.0 || >=23`, plus npm and a supported Chrome installation. [R1][R2][R47]
- `--auto-connect` requires Chrome 144+; URL allowlisting requires Chrome 149+; WebMCP requires Chrome 150+ with a feature flag. [R6]
- The extensions and PWA categories are documented as pipe-only in the current main-branch guidance; they are not interchangeable with `autoConnect`, `browserUrl`, or `wsEndpoint`. [R6]
- Chrome can fail to start as root, inside an incompatible client sandbox, or in WSL without a suitable Linux Chrome environment. The upstream troubleshooting guide recommends a non-root container user, a manually started browser with `--browser-url`, or a supported WSL setup. [R11]
- Android debugging is explicitly experimental because Puppeteer does not officially support Chrome on Android as a target. [R46]
- The current troubleshooting guide warns that auto-connect can force tabs to load and that hundreds of tabs are not recommended in Chrome versions up to 149. [R11]
- The inspected client guide publishes configuration recipes rather than a formal compatibility promise for every MCP client. The exact behavior of a particular client, its roots capability, image rendering, and structured-content support must be tested in that client. [R8][R10]

## 8. Version and activity snapshot (24 September 2026)

| Signal | Observation at retrieval |
|---|---|
| **Published package** | npm `@latest` = `chrome-devtools-mcp@1.10.1`; the full registry metadata records publication at `2026-09-23T10:42:53.202Z` and `gitHead` `e52c6b59b476c5e04d8dd9fd4bd017ba3b3d65df`. [R33][R34] |
| **Latest GitHub release** | `chrome-devtools-mcp-v1.10.1`, published `2026-09-23T10:37:16Z`, targeting the same release commit. Its release note describes a Rollup build/export-condition fix. [R32] |
| **Current `main`** | Commit `3c12a91c38386485164e2605c4cbac3adf2911d9` (`docs: update documentation and SKILL for get_css_styles tool`), authored `2026-09-24T09:23:45Z`; the repository API reported a push at `09:35:12Z`. [R30][R31] |
| **Release/main difference** | `main` lists 59 tools while the v1.10.1 tag lists 58. The extra current-main tool is `analyze_heapsnapshot_contexts`; the main commit history shows that work after the release commit, even though the main `package.json` still carries version `1.10.1`. [R2][R4][R5][R31] |
| **Repository activity** | The GitHub API snapshot showed 52,551 stars, 4,495 forks, 110 open issues, Apache-2.0 licensing, and a `main` default branch. These counts are time-sensitive. [R30] |
| **Recent direction** | The changelog records recent additions/fixes around CSS inspection/formatting, chunked trace parsing, config files, filesystem roots, telemetry, JavaScript-evaluation/source-map controls, PWA tools, and MCP SDK v2 migration. [R14] |

**Interpretation (not an upstream compatibility guarantee):** the project is actively changing, and `main` is a useful source for understanding the current architecture, while `@latest` is the reproducible install target only until the next npm release. For eguidar, pin the version used by a team or CI job after a local smoke test rather than silently tracking `main`. [R4][R31]

## 9. Practical examples

The commands and prompts below are starting points. The first three are **recommendations for local eguidar work**, not claims that a browser tool is a substitute for an automated test suite.

### 9.1 Start eguidar and the server

The repository documents starting its PostgreSQL, Redis, and Meilisearch services with Docker Compose and then starting Next with `npm run dev`; the local environment example uses `http://localhost:3000` for Better Auth. [L2][L3][L4]

```bash
# terminal 1 — eguidar services and app
cd /config/workspace/eguidar
docker compose up -d
npm run dev

# terminal 2 — smoke-test the standalone CLI, if desired
npx -y chrome-devtools-mcp@1.10.1 --help
```

Then configure the MCP host with the standard stdio entry and use a prompt such as:

```text
Open http://localhost:3000, take a snapshot, and report the page title,
main navigation, and any console errors. Do not submit forms yet.
```

This exercises lazy browser startup, navigation, the accessibility snapshot, and console collection without changing the application. [R1][R4]

### 9.2 A repeatable storefront QA profile

```json
{
  "mcpServers": {
    "chrome-devtools": {
      "command": "npx",
      "args": [
        "-y",
        "chrome-devtools-mcp@1.10.1",
        "--isolated",
        "--workspace=/config/workspace/eguidar",
        "--screenshot-format=webp",
        "--screenshot-max-width=1440"
      ]
    }
  }
}
```

Suggested prompts:

```text
On http://localhost:3000, inspect the product catalogue at a mobile viewport
(390x844,mobile,touch). Take a snapshot, check the product and category links,
and report any console errors or failed network requests.

On /recherche, search for a seeded product, exercise the result controls,
and verify that the visible result and URL state agree.

On a product page, inspect the matched CSS for the price and add-to-cart
controls with get_css_styles, then take a bounded screenshot.
```

These map directly to eguidar's product, search, responsive UI, and performance/debugging surfaces. The local app is a French-language storefront with product variants, search, cart, checkout, and an Administration area. [L2][L9][L10][L11][L12]

### 9.3 Performance and quality checks

```text
Record a performance trace for http://localhost:3000/produits, then report
the most important performance insights and save the raw trace under the
eguidar workspace.

Run a Lighthouse accessibility and SEO audit on the same page. For this local
run, disable CrUX and usage statistics before starting the server.
```

The corresponding server options are `--no-performance-crux` and
`--no-usage-statistics`; Lighthouse itself excludes performance, so the trace
and audit are separate operations. [R4][R6][R1]

For a production-like public URL, a trace can help investigate LCP/INP/CLS and other frontend performance issues, but the field-data lookup is an external Google request. Keep the distinction explicit when interpreting results. [R4][R38]

### 9.4 Authenticated checkout and Administration

eguidar's checkout page requires a current Client session, loads the profile and Panier, and computes a delivery quote before rendering the checkout form. Its Administration layout redirects non-admin sessions and renders the authenticated admin shell. [L8][L6]

A safe local workflow is:

1. Use the local seed data and a dedicated development account.
2. Start with `--isolated` and sign in manually in the agent-controlled browser if the flow requires authentication.
3. Test one complete local flow, then clear the isolated profile rather than reusing it for unrelated accounts.
4. Never point the browser at a production database or production customer/admin account for exploratory prompts.

The server's `new_page` isolated context and `--isolated` profile options provide ways to separate browser state, but they do not make an unsafe production target safe. [R4][R7][R10]

### 9.5 Connect to an already-running browser

```bash
/usr/bin/google-chrome \
  --remote-debugging-port=9222 \
  --user-data-dir=/tmp/eguidar-agent-chrome
```

```json
{
  "mcpServers": {
    "chrome-devtools": {
      "command": "npx",
      "args": [
        "-y",
        "chrome-devtools-mcp@1.10.1",
        "--browser-url=http://127.0.0.1:9222"
      ]
    }
  }
}
```

Use this when the agent and a human need to share the same local browser state. The upstream guide specifically identifies this as useful for manual/agent alternation and sign-in state, but repeats the warning that the debugging port grants browser control. [R7]

### 9.6 Experimental terminal CLI

The package's `chrome-devtools` binary is documented as experimental. It starts or reuses a background daemon, preserves browser state between commands, and uses a Unix socket or Windows named pipe internally:

```bash
npm i chrome-devtools-mcp@1.10.1 -g
chrome-devtools status
chrome-devtools new_page "http://localhost:3000"
chrome-devtools list_pages
chrome-devtools stop
```

The CLI is useful for a quick terminal smoke test or for an agent-generated browser script, but it is not the MCP transport used by an editor, and some MCP-only tools/options are filtered out of the CLI. [R9]

## 10. Does it fit this eguidar Next.js repository?

The local project identifies its stack as Next.js 16 App Router, React 19, Tailwind v4, Prisma/PostgreSQL, Better Auth, Meilisearch, Redis, Resend, and Docker Compose. [L2] The browser server therefore operates at the rendered HTTP boundary rather than becoming a Next.js dependency.

### 10.1 Static fit assessment

| eguidar concern | Assessment | Basis |
|---|---|---|
| **Rendered storefront QA** | **Good fit.** The server can navigate a real page, inspect the accessibility tree, emulate mobile/desktop conditions, capture screenshots, and inspect browser errors/network traffic. | Upstream tool reference; eguidar is a Next.js App Router storefront with product/search/cart pages. [R4][L2][L10][L11][L12] |
| **Next.js hydration/client errors** | **Good fit for browser-observed symptoms.** Console collection, source-map support, snapshots, and page evaluation can investigate errors that only appear after hydration or interaction. This does not replace server-side type checking or unit tests. | Upstream debugging tools and local test stack. [R4][L5] |
| **Performance and Lighthouse** | **Good fit.** Trace tools and Lighthouse audits operate on the live page and can be aimed at local routes or a public deployment. | Upstream performance/debugging tools. [R4] |
| **Authenticated checkout** | **Conditional fit.** Useful for exploratory/manual-agent testing of the local UI, but an order-submission flow can mutate local data and exposes credentials/session state to the agent. | Local checkout session gate and upstream browser-data warning. [L8][R1][R10] |
| **Administration** | **Conditional fit.** The route is server-gated and private, so a valid local admin session is required; use a disposable development account. | Local admin layout and dashboard. [L6][L7] |
| **Vitest/unit/integration suite** | **Complementary, not a replacement.** eguidar's documented suite is Vitest with a Node environment; the MCP server is an interactive browser/debugging tool rather than a test runner. | Local README, package scripts, and Vitest config. [L2][L1][L5] |
| **Production/runtime architecture** | **No direct integration required.** The MCP server talks to the running site over the browser; it does not need to be imported into Next.js server components or added to the application dependency graph. | Upstream stdio/Puppeteer architecture and local scripts. [R3][R15][R17][L1] |

### 10.2 Recommended eguidar workflow (recommendations, not upstream facts)

1. **Keep it outside the app package.** Configure it in the MCP host or a local operator config. Do not add `chrome-devtools-mcp` to eguidar's `package.json` solely to enable agent tooling; the standalone `npx` process already has its own Node/Chrome lifecycle. [R1][R2][L1]
2. **Start with the local stack, not production.** Run the documented Docker services and `npm run dev`, use seeded local data, and keep the browser target on `localhost`. [L2][L3][L4]
3. **Choose profile isolation deliberately.** Use `--isolated` for clean exploratory runs; use a separately started Chrome profile only for a deliberate authenticated flow. Never reuse a normal personal Chrome profile. [R7][R10]
4. **Scope artifacts.** Leave snapshots, traces, screenshots, and reports in the OS temp directory by default. If the team wants them under the repository for review, opt into `--workspace=/config/workspace/eguidar` and decide separately whether those files should be committed. [R6][R10]
5. **Minimize data exposure.** For local or internal URLs, start with `--no-performance-crux --no-usage-statistics --redact-network-headers`; disable JavaScript evaluation for read-only audits unless it is needed. [R6][R1]
6. **Use snapshots before screenshots and traces before guesses.** The upstream workflow is snapshot/UID-driven for interaction, `get_css_styles` for cascade questions, and trace/Lighthouse tools for performance claims. [R4][R12]
7. **Pin after qualification.** Start with `@latest` to verify the current release, then record the exact tested npm version. Remember that `main` currently contains one memory tool not present in v1.10.1. [R1][R4][R5]
8. **Do not infer server correctness from browser success.** A passing browser prompt does not replace eguidar's typecheck, lint, Vitest, build, database, or authorization checks. [L1][L2][L5]

## 11. Unverified gaps and boundaries

- **No live MCP/browser run was performed in this research session.** The architecture, tool inventory, and fit above are based on official source/docs and a static read of eguidar; actual Chrome launch, authentication, HMR, rendering, and client behavior on this workspace remain unverified. [R1][L1]
- **The `main`/npm boundary is real.** The current source reference has `analyze_heapsnapshot_contexts`, while the published v1.10.1 tag does not. The next npm release/versioning decision was not available from the sources inspected. [R4][R5][R31][R33]
- **No native Streamable HTTP listener was found.** The repository documents an external proxy route for that transport, but this note does not claim that the project will never add one; it only records the current source/manifest state. [R3][R8][R15]
- **Client compatibility is recipe-level.** The upstream guide names many clients, but it does not provide a formal matrix covering roots negotiation, image rendering, structured content, plugin behavior, or update timing for every client. [R8]
- **Telemetry retention and downstream governance are not fully specified in the repository.** The source and README identify collection fields/opt-outs, but this research did not infer a retention period or make a claim beyond the linked Google policy. [R1][R10][R27][R28][R45]
- **The eguidar-specific browser flows were not executed.** Seeded product availability, Better Auth behavior, Turnstile, delivery-city quote behavior, COD order creation, and Administration authorization should be verified with disposable local data before any broader use. [L2][L4][L6][L8]

## Sources

All remote sources were retrieved on **24 September 2026 (UTC)**. The repository files below are pinned to the inspected `main` commit unless explicitly identified as the v1.10.1 release tag. Local eguidar files were read from `/config/workspace/eguidar` on the same date.

### Upstream repository, documentation, and source

1. **R1** — README at `main`: purpose, key features, browser disclaimers, requirements, basic config, first prompt, usage statistics, and update checks. [README](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/3c12a91c38386485164e2605c4cbac3adf2911d9/README.md)
2. **R2** — `package.json` at `main`: package name/version, binaries, Node engine, build metadata, and dependencies. [package.json](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/3c12a91c38386485164e2605c4cbac3adf2911d9/package.json)
3. **R3** — `server.json`: MCP server identity, package version, and stdio transport declaration. [server.json](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/3c12a91c38386485164e2605c4cbac3adf2911d9/server.json)
4. **R4** — Generated full tool reference at `main`: category counts, names, descriptions, parameters, and feature conditions. [tool-reference.md](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/3c12a91c38386485164e2605c4cbac3adf2911d9/docs/tool-reference.md)
5. **R5** — Generated tool reference at the published `chrome-devtools-mcp-v1.10.1` tag: release-boundary tool list. [tool-reference.md](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/chrome-devtools-mcp-v1.10.1/docs/tool-reference.md)
6. **R6** — Generated configuration reference: browser, category, safety, privacy, screenshot, filesystem, and output options. [configuration.md](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/3c12a91c38386485164e2605c4cbac3adf2911d9/docs/configuration.md)
7. **R7** — Advanced usage: concurrent sessions, profile lifetime, auto-connect, manual browser connection, and remote-debugging warnings. [advanced-usage.md](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/3c12a91c38386485164e2605c4cbac3adf2911d9/docs/advanced-usage.md)
8. **R8** — Client configuration guide: generic JSON and named client/plugin recipes, including the external Streamable HTTP proxy example. [client-configurations.md](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/3c12a91c38386485164e2605c4cbac3adf2911d9/docs/client-configurations.md)
9. **R9** — Experimental CLI guide: daemon lifecycle, IPC behavior, commands, and CLI limitations. [cli.md](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/3c12a91c38386485164e2605c4cbac3adf2911d9/docs/cli.md)
10. **R10** — Security policy: browser-content exposure, prompt injection, roots, filesystem access, and URL guardrails. [SECURITY.md](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/3c12a91c38386485164e2605c4cbac3adf2911d9/SECURITY.md)
11. **R11** — Troubleshooting guide: Node/Chrome startup, sandboxing, root, WSL, Windows, auto-connect, and tab-count caveats. [troubleshooting.md](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/3c12a91c38386485164e2605c4cbac3adf2911d9/docs/troubleshooting.md)
12. **R12** — Upstream design principles: interoperability, token-conscious responses, composable tools, and file references. [design-principles.md](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/3c12a91c38386485164e2605c4cbac3adf2911d9/docs/design-principles.md)
13. **R13** — Third-party developer-tool guide and security/status notes. [third-party-developer-tools.md](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/3c12a91c38386485164e2605c4cbac3adf2911d9/docs/third-party-developer-tools.md)
14. **R14** — Upstream changelog, including recent releases and feature/fix themes. [CHANGELOG.md](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/3c12a91c38386485164e2605c4cbac3adf2911d9/CHANGELOG.md)
15. **R15** — Main executable: Node checks, argument parsing, lazy server creation, stdio connection, and shutdown. [chrome-devtools-mcp-main.ts](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/3c12a91c38386485164e2605c4cbac3adf2911d9/src/bin/chrome-devtools-mcp-main.ts#L15-L89)
16. **R16** — Server construction, tool registration, lazy context creation, and roots handling. [index.ts](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/3c12a91c38386485164e2605c4cbac3adf2911d9/src/index.ts#L47-L268)
17. **R17** — Browser lifecycle, launch/connect paths, profile handling, Puppeteer pipe mode, and shutdown semantics. [BrowserManager.ts](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/3c12a91c38386485164e2605c4cbac3adf2911d9/src/BrowserManager.ts#L110-L414)
18. **R18** — Browser context, isolated contexts, page registration, file-root validation, file writes, and URL guardrails. [McpContext.ts](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/3c12a91c38386485164e2605c4cbac3adf2911d9/src/McpContext.ts#L87-L975)
19. **R19** — Per-page collectors, DevTools session, emulation, page UID resolution, and emulation details. [McpPage.ts](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/3c12a91c38386485164e2605c4cbac3adf2911d9/src/McpPage.ts#L120-L1035)
20. **R20** — Tool status checks, strict schema registration, mutex, page routing, file validation, and telemetry invocation. [ToolHandler.ts](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/3c12a91c38386485164e2605c4cbac3adf2911d9/src/ToolHandler.ts#L146-L291)
21. **R21** — Network/console collection and per-navigation retention. [PageCollector.ts](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/3c12a91c38386485164e2605c4cbac3adf2911d9/src/collectors/PageCollector.ts#L48-L194)
22. **R22** — Accessibility snapshot creation and UID mapping. [TextSnapshot.ts](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/3c12a91c38386485164e2605c4cbac3adf2911d9/src/TextSnapshot.ts#L47-L149)
23. **R23** — Bundled dependencies: MCP SDK, Puppeteer, Lighthouse runner, and DevTools frontend exports. [third_party/index.ts](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/3c12a91c38386485164e2605c4cbac3adf2911d9/src/third_party/index.ts#L21-L113)
24. **R24** — Main option definitions, defaults, config-file loading, environment opt-outs, and workspace roots. [mcp-options.ts](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/3c12a91c38386485164e2605c4cbac3adf2911d9/src/config/mcp-options.ts#L18-L538)
25. **R25** — Browser option conflicts and connection validation. [browser-options.ts](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/3c12a91c38386485164e2605c4cbac3adf2911d9/src/config/browser-options.ts#L9-L138)
26. **R26** — Category defaults and off-by-default experimental categories. [category-options.ts](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/3c12a91c38386485164e2605c4cbac3adf2911d9/src/config/category-options.ts#L24-L105)
27. **R27** — Telemetry event construction and client/OS/tool fields. [ClearcutLogger.ts](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/3c12a91c38386485164e2605c4cbac3adf2911d9/src/telemetry/ClearcutLogger.ts#L137-L313)
28. **R28** — Telemetry parameter sanitization/bucketing and localhost context. [transformation.ts](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/3c12a91c38386485164e2605c4cbac3adf2911d9/src/telemetry/transformation.ts#L30-L296)
29. **R29** — Network body truncation and header-redaction behavior. [NetworkFormatter.ts](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/3c12a91c38386485164e2605c4cbac3adf2911d9/src/formatters/NetworkFormatter.ts#L15-L217)
30. **R30** — GitHub repository metadata snapshot. [repository API](https://api.github.com/repos/ChromeDevTools/chrome-devtools-mcp)
31. **R31** — GitHub commit history used for the release/main activity boundary. [commits API](https://api.github.com/repos/ChromeDevTools/chrome-devtools-mcp/commits?per_page=20)
32. **R32** — GitHub latest-release metadata and v1.10.1 release note. [latest release API](https://api.github.com/repos/ChromeDevTools/chrome-devtools-mcp/releases/latest)
33. **R33** — Full npm registry metadata, including publish time and git head. [npm registry metadata](https://registry.npmjs.org/chrome-devtools-mcp)
34. **R34** — npm `latest` package metadata. [npm latest](https://registry.npmjs.org/chrome-devtools-mcp/latest)
35. **R35** — Official MCP architecture overview. [MCP architecture](https://modelcontextprotocol.io/docs/concepts/architecture)
36. **R36** — Official MCP roots specification. [MCP roots](https://modelcontextprotocol.io/specification/2025-06-18/client/roots)
37. **R37** — Official Chrome remote-debugging security change. [remote debugging port security](https://developer.chrome.com/blog/remote-debugging-port/)
38. **R38** — Official Chrome CrUX overview. [CrUX](https://developer.chrome.com/docs/crux/)
39. **R39** — Official Chrome for Testing rationale. [Chrome for Testing](https://developer.chrome.com/blog/chrome-for-testing/)
40. **R40** — Official Chrome DevTools for agents overview and client examples. [Chrome DevTools for agents](https://developer.chrome.com/docs/devtools/agents/)
41. **R41** — Official Chrome DevTools for agents “Get started” page: supported IDE/model framing, security warning, prerequisites, setup, and smoke test. [Get started](https://developer.chrome.com/docs/devtools/agents/get-started)
42. **R42** — Generated slim tool reference. [slim-tool-reference.md](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/3c12a91c38386485164e2605c4cbac3adf2911d9/docs/slim-tool-reference.md)
43. **R43** — Official MCP transport specification, including stdio and Streamable HTTP behavior and HTTP security requirements. [MCP transports](https://modelcontextprotocol.io/specification/2025-06-18/basic/transports)
44. **R44** — Screenshot tool implementation, including the large-screenshot temporary-file behavior. [screenshot.ts](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/3c12a91c38386485164e2605c4cbac3adf2911d9/src/tools/screenshot.ts#L126-L287)
45. **R45** — Clearcut sender implementation, including the default Google endpoint, buffering, and batched event delivery. [ClearcutSender.ts](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/3c12a91c38386485164e2605c4cbac3adf2911d9/src/telemetry/watchdog/ClearcutSender.ts#L25-L235)
46. **R46** — Experimental Android debugging guide. [debugging-android.md](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/3c12a91c38386485164e2605c4cbac3adf2911d9/docs/debugging-android.md)
47. **R47** — Executable wrapper containing the runtime Node-version checks. [chrome-devtools-mcp.ts](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/3c12a91c38386485164e2605c4cbac3adf2911d9/src/bin/chrome-devtools-mcp.ts#L9-L34)
48. **R48** — Response formatter: text, images, structured content, pagination, snapshots, traces, and file-backed output. [McpResponse.ts](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/3c12a91c38386485164e2605c4cbac3adf2911d9/src/McpResponse.ts#L87-L1400)

### Official protocol and browser documentation

- **R35/R36/R43** are the MCP architecture, roots, and transport specifications; see the linked official pages above.
- **R37/R38/R39/R40** are Chrome's official remote-debugging, CrUX, Chrome for Testing, and agents pages; see the linked pages above.

### eguidar local sources

- **L1** — [`package.json`](../../package.json), especially scripts and dependency lists (lines 6–67).
- **L2** — [`README.md`](../../README.md), especially stack, local setup, and test commands (lines 3–48).
- **L3** — [`docker-compose.yml`](../../docker-compose.yml), local service bindings and health checks (lines 1–112).
- **L4** — [`.env.example`](../../.env.example), local URLs, database/test database, auth, and service variables (lines 4–47).
- **L5** — [`vitest.config.ts`](../../vitest.config.ts), Node test environment, parallelism, setup, and global setup (lines 5–23).
- **L6** — [`app/admin/layout.tsx`](../../app/admin/layout.tsx), admin session gate and shell (lines 23–55).
- **L7** — [`app/admin/page.tsx`](../../app/admin/page.tsx), Administration dashboard data and UI (lines 48–249).
- **L8** — [`app/(boutique)/checkout/page.tsx`](../../app/(boutique)/checkout/page.tsx), authenticated checkout, Panier/profile loading, and delivery quote (lines 21–87).
- **L9** — [`GLOSSARY.md`](../../GLOSSARY.md), project domain summary and Administration/checkout concepts (lines 1–4 and 222–262).
- **L10** — [`app/(boutique)/produits/page.tsx`](../../app/(boutique)/produits/page.tsx), catalogue route, metadata, and search/filter entry point (lines 10–51).
- **L11** — [`app/(boutique)/recherche/page.tsx`](../../app/(boutique)/recherche/page.tsx), search route and query/filter state (lines 12–62).
- **L12** — [`app/(boutique)/panier/page.tsx`](../../app/(boutique)/panier/page.tsx), Panier route, delivery-city picker, payment summary, and checkout link (lines 18–108).

### Citation key definitions

[R1]: https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/3c12a91c38386485164e2605c4cbac3adf2911d9/README.md
[R2]: https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/3c12a91c38386485164e2605c4cbac3adf2911d9/package.json
[R3]: https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/3c12a91c38386485164e2605c4cbac3adf2911d9/server.json
[R4]: https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/3c12a91c38386485164e2605c4cbac3adf2911d9/docs/tool-reference.md
[R5]: https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/chrome-devtools-mcp-v1.10.1/docs/tool-reference.md
[R6]: https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/3c12a91c38386485164e2605c4cbac3adf2911d9/docs/configuration.md
[R7]: https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/3c12a91c38386485164e2605c4cbac3adf2911d9/docs/advanced-usage.md
[R8]: https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/3c12a91c38386485164e2605c4cbac3adf2911d9/docs/client-configurations.md
[R9]: https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/3c12a91c38386485164e2605c4cbac3adf2911d9/docs/cli.md
[R10]: https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/3c12a91c38386485164e2605c4cbac3adf2911d9/SECURITY.md
[R11]: https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/3c12a91c38386485164e2605c4cbac3adf2911d9/docs/troubleshooting.md
[R12]: https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/3c12a91c38386485164e2605c4cbac3adf2911d9/docs/design-principles.md
[R13]: https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/3c12a91c38386485164e2605c4cbac3adf2911d9/docs/third-party-developer-tools.md
[R14]: https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/3c12a91c38386485164e2605c4cbac3adf2911d9/CHANGELOG.md
[R15]: https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/3c12a91c38386485164e2605c4cbac3adf2911d9/src/bin/chrome-devtools-mcp-main.ts#L15-L89
[R16]: https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/3c12a91c38386485164e2605c4cbac3adf2911d9/src/index.ts#L47-L268
[R17]: https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/3c12a91c38386485164e2605c4cbac3adf2911d9/src/BrowserManager.ts#L110-L414
[R18]: https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/3c12a91c38386485164e2605c4cbac3adf2911d9/src/McpContext.ts#L87-L975
[R19]: https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/3c12a91c38386485164e2605c4cbac3adf2911d9/src/McpPage.ts#L120-L1035
[R20]: https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/3c12a91c38386485164e2605c4cbac3adf2911d9/src/ToolHandler.ts#L146-L291
[R21]: https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/3c12a91c38386485164e2605c4cbac3adf2911d9/src/collectors/PageCollector.ts#L48-L194
[R22]: https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/3c12a91c38386485164e2605c4cbac3adf2911d9/src/TextSnapshot.ts#L47-L149
[R23]: https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/3c12a91c38386485164e2605c4cbac3adf2911d9/src/third_party/index.ts#L21-L113
[R24]: https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/3c12a91c38386485164e2605c4cbac3adf2911d9/src/config/mcp-options.ts#L18-L538
[R25]: https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/3c12a91c38386485164e2605c4cbac3adf2911d9/src/config/browser-options.ts#L9-L138
[R26]: https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/3c12a91c38386485164e2605c4cbac3adf2911d9/src/config/category-options.ts#L24-L105
[R27]: https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/3c12a91c38386485164e2605c4cbac3adf2911d9/src/telemetry/ClearcutLogger.ts#L137-L313
[R28]: https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/3c12a91c38386485164e2605c4cbac3adf2911d9/src/telemetry/transformation.ts#L30-L296
[R29]: https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/3c12a91c38386485164e2605c4cbac3adf2911d9/src/formatters/NetworkFormatter.ts#L15-L217
[R30]: https://api.github.com/repos/ChromeDevTools/chrome-devtools-mcp
[R31]: https://api.github.com/repos/ChromeDevTools/chrome-devtools-mcp/commits?per_page=20
[R32]: https://api.github.com/repos/ChromeDevTools/chrome-devtools-mcp/releases/latest
[R33]: https://registry.npmjs.org/chrome-devtools-mcp
[R34]: https://registry.npmjs.org/chrome-devtools-mcp/latest
[R35]: https://modelcontextprotocol.io/docs/concepts/architecture
[R36]: https://modelcontextprotocol.io/specification/2025-06-18/client/roots
[R37]: https://developer.chrome.com/blog/remote-debugging-port/
[R38]: https://developer.chrome.com/docs/crux/
[R39]: https://developer.chrome.com/blog/chrome-for-testing/
[R40]: https://developer.chrome.com/docs/devtools/agents/
[R41]: https://developer.chrome.com/docs/devtools/agents/get-started
[R42]: https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/3c12a91c38386485164e2605c4cbac3adf2911d9/docs/slim-tool-reference.md
[R43]: https://modelcontextprotocol.io/specification/2025-06-18/basic/transports
[R44]: https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/3c12a91c38386485164e2605c4cbac3adf2911d9/src/tools/screenshot.ts#L126-L287
[R45]: https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/3c12a91c38386485164e2605c4cbac3adf2911d9/src/telemetry/watchdog/ClearcutSender.ts#L25-L235
[R46]: https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/3c12a91c38386485164e2605c4cbac3adf2911d9/docs/debugging-android.md
[R47]: https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/3c12a91c38386485164e2605c4cbac3adf2911d9/src/bin/chrome-devtools-mcp.ts#L9-L34
[R48]: https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/3c12a91c38386485164e2605c4cbac3adf2911d9/src/McpResponse.ts#L87-L1400
[L1]: ../../package.json
[L2]: ../../README.md
[L3]: ../../docker-compose.yml
[L4]: ../../.env.example
[L5]: ../../vitest.config.ts
[L6]: ../../app/admin/layout.tsx
[L7]: ../../app/admin/page.tsx
[L8]: <../../app/(boutique)/checkout/page.tsx>
[L9]: ../../GLOSSARY.md
[L10]: <../../app/(boutique)/produits/page.tsx>
[L11]: <../../app/(boutique)/recherche/page.tsx>
[L12]: <../../app/(boutique)/panier/page.tsx>
