// ──────────────────────────────────────────────────────────────────────────────
// BUILD-061A — AI Gateway — Adapter Barrel
// Importing this file triggers all adapter self-registrations.
// Gateway imports this once at startup. Adding a future provider = new file +
// one import here. No gateway modifications needed.
// ──────────────────────────────────────────────────────────────────────────────

import "./claude.js";
import "./codex.js";
import "./opencode.js";
import "./aider.js";
import "./gemini.js";
import "./ollama.js";
import "./claude-code.js";
import "./continue.js";

// Re-export adapter classes for use in tests.
export { ClaudeAdapter }    from "./claude.js";
export { CodexAdapter }     from "./codex.js";
export { OpenCodeAdapter }  from "./opencode.js";
export { AiderAdapter }     from "./aider.js";
export { GeminiAdapter }    from "./gemini.js";
export { OllamaAdapter }    from "./ollama.js";
export { ClaudeCodeAdapter } from "./claude-code.js";
export { ContinueAdapter }   from "./continue.js";
export { BaseProviderAdapter } from "./base.js";
