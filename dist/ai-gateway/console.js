// ──────────────────────────────────────────────────────────────────────────────
// BUILD-061A — AI Gateway — Live Collaboration Console
// Subscribes to GatewayEventBus. Never called directly from services.
// Renders Brain panels before/after provider, passes provider output through
// unmodified. ANSI only — no external terminal deps.
// ──────────────────────────────────────────────────────────────────────────────
// ─── ANSI helpers ─────────────────────────────────────────────────────────────
const A = {
    reset: "\x1b[0m",
    bold: "\x1b[1m",
    dim: "\x1b[2m",
    cyan: "\x1b[36m",
    green: "\x1b[32m",
    yellow: "\x1b[33m",
    gray: "\x1b[90m",
    white: "\x1b[97m",
};
function c(code, text, noColor) {
    return noColor ? text : `${code}${text}${A.reset}`;
}
// ─── Console ──────────────────────────────────────────────────────────────────
export class LiveConsole {
    noColor;
    out; // Brain panels
    prov; // Provider stream
    // State
    providerActive = false;
    sessionStart = Date.now();
    panelLines = [];
    sessionId = "";
    providerId = "";
    constructor(bus, opts = {}) {
        this.noColor = opts.noColor ?? !process.stdout.isTTY;
        this.out = opts.output ?? process.stderr;
        this.prov = opts.provider ?? process.stdout;
        // Wire event subscriptions — console never called from services.
        bus.on("SessionStarted", this.onSessionStarted.bind(this));
        bus.on("PromptReceived", this.onPromptReceived.bind(this));
        bus.on("ContextRetrievalCompleted", this.onContextRetrieved.bind(this));
        bus.on("LearningMatchCompleted", this.onLearningMatched.bind(this));
        bus.on("PromptOptimizationCompleted", this.onOptimized.bind(this));
        bus.on("ProviderLaunching", this.onProviderLaunching.bind(this));
        bus.on("ProviderStarted", this.onProviderStarted.bind(this));
        bus.on("ProviderOutput", this.onProviderOutput.bind(this));
        bus.on("SessionCompleted", this.onSessionCompleted.bind(this));
        bus.on("SessionFailed", this.onSessionFailed.bind(this));
    }
    // ── Event handlers ────────────────────────────────────────────────────────
    onSessionStarted(ev) {
        this.sessionId = ev.sessionId;
        this.sessionStart = Date.now();
        this.panelLines = [];
        this.providerActive = false;
        const provider = ev.payload["providerId"];
        this.providerId = provider ?? "—";
        this.openPanel();
        this.writePanelLine(`Provider  ${c(A.cyan, this.providerId, this.noColor)}`);
        this.writePanelLine(`Session   ${c(A.gray, this.sessionId, this.noColor)}`);
    }
    onPromptReceived(ev) {
        void ev;
        this.writePanelLine("Analyzing prompt…");
    }
    onContextRetrieved(ev) {
        const files = ev.payload["sections"];
        const tokens = ev.payload["tokenEstimate"];
        const cached = ev.payload["cacheHit"];
        const detail = [
            files != null ? `${files} file${files !== 1 ? "s" : ""}` : null,
            tokens != null ? `${tokens.toLocaleString()} tokens` : null,
            cached ? "(cached)" : null,
        ].filter(Boolean).join(" · ");
        this.writePanelLine(`Retrieved architecture${detail ? `  ${c(A.gray, detail, this.noColor)}` : ""}`);
    }
    onLearningMatched(ev) {
        const rules = ev.payload["rulesApplied"];
        if (rules && rules > 0) {
            this.writePanelLine(`Found ${c(A.green, String(rules), this.noColor)} previous pattern${rules !== 1 ? "s" : ""}`);
        }
    }
    onOptimized(ev) {
        const pct = ev.payload["savedPct"];
        const files = ev.payload["retrievedFiles"];
        const tokens = ev.payload["tokensAfter"];
        const parts = [
            pct != null ? `${c(A.green, `↓ ${pct}%`, this.noColor)} reduction` : null,
            files != null ? `${files} files` : null,
            tokens != null ? `${tokens.toLocaleString()} tokens` : null,
        ].filter(Boolean).join("  ·  ");
        this.writePanelLine(`Injecting context${parts ? `  ${parts}` : ""}`);
    }
    onProviderLaunching(ev) {
        const id = ev.payload["providerId"];
        this.writePanelLine(`Launching ${c(A.cyan, id ?? this.providerId, this.noColor)}…`);
    }
    onProviderStarted(_ev) {
        // Close the Brain panel — provider output must stream uninterrupted.
        this.closePanel();
        this.providerActive = true;
    }
    onProviderOutput(ev) {
        // Brain is silent. Forward chunk directly to stdout as-is.
        const chunk = ev.payload["chunk"];
        if (chunk)
            this.prov.write(chunk);
    }
    onSessionCompleted(ev) {
        this.providerActive = false;
        this.renderSummary(ev, false);
    }
    onSessionFailed(ev) {
        this.providerActive = false;
        this.renderSummary(ev, true);
    }
    // ── Panel rendering ───────────────────────────────────────────────────────
    /** Write the top border of the Brain panel. */
    openPanel() {
        const width = 56;
        const title = " 🧠 Project Brain ";
        const border = this.box("─", title, width);
        this.out.write("\n" + c(A.cyan, border, this.noColor) + "\n");
    }
    /** Append one line inside the panel. */
    writePanelLine(text) {
        if (this.providerActive)
            return; // Never interrupt the provider stream.
        const line = `${c(A.cyan, "│", this.noColor)}  ${text}`;
        this.out.write(line + "\n");
    }
    /** Write the bottom border of the Brain panel. */
    closePanel() {
        const width = 56;
        const border = "╰" + "─".repeat(width - 2) + "╯";
        this.out.write(c(A.cyan, border, this.noColor) + "\n");
    }
    /** Render the post-session summary panel. */
    renderSummary(ev, failed) {
        const elapsedMs = Date.now() - this.sessionStart;
        const duration = formatDuration(elapsedMs);
        const tokens = ev.payload["tokensAfter"];
        const cost = ev.payload["estimatedCost"];
        const reduction = ev.payload["savedPct"];
        const costSaved = ev.payload["estimatedSavedUsd"];
        const learning = ev.payload["learningHits"];
        const sessionId = this.sessionId;
        const width = 56;
        const title = failed ? " 🧠 Session Failed " : " 🧠 Session Complete ";
        this.out.write("\n" + c(A.cyan, this.box("─", title, width), this.noColor) + "\n");
        const col = (label, val) => {
            const padded = label.padEnd(14);
            return `${c(A.cyan, "│", this.noColor)}  ${c(A.gray, padded, this.noColor)}${val}`;
        };
        if (!failed) {
            this.out.write(col("Duration", c(A.white, duration, this.noColor)) + "\n");
            if (tokens != null)
                this.out.write(col("Tokens", c(A.white, tokens.toLocaleString(), this.noColor)) + "\n");
            if (cost != null)
                this.out.write(col("Cost", c(A.white, `$${cost.toFixed(4)}`, this.noColor)) + "\n");
            if (reduction != null)
                this.out.write(col("Reduction", c(A.green, `${reduction}%`, this.noColor)) + "\n");
            if (costSaved != null)
                this.out.write(col("Saved", c(A.green, `$${costSaved.toFixed(4)}`, this.noColor)) + "\n");
            if (learning != null && learning > 0) {
                this.out.write(col("Learning", c(A.green, `${learning} new pattern${learning !== 1 ? "s" : ""} recorded`, this.noColor)) + "\n");
            }
        }
        else {
            const errMsg = ev.payload["error"];
            this.out.write(col("Duration", c(A.white, duration, this.noColor)) + "\n");
            if (errMsg) {
                this.out.write(col("Error", c(A.yellow, errMsg.slice(0, 36), this.noColor)) + "\n");
            }
        }
        // Hint line
        const hint = [
            `brain explain ${sessionId}`,
            "brain gateway history",
        ].join("  ·  ");
        this.out.write(`${c(A.cyan, "│", this.noColor)}  ${c(A.dim, hint, this.noColor)}\n`);
        this.out.write(c(A.cyan, "╰" + "─".repeat(width - 2) + "╯", this.noColor) + "\n\n");
    }
    // ── Box helper ────────────────────────────────────────────────────────────
    /** Build top box border with centred title. */
    box(fillChar, title, width) {
        const raw = title.replace(/\x1b\[[0-9;]*m/g, ""); // strip ANSI for length calc
        const inner = width - 2;
        const left = Math.floor((inner - raw.length) / 2);
        const right = inner - raw.length - left;
        return "╭" + fillChar.repeat(left) + title + fillChar.repeat(right) + "╯";
    }
}
// ─── Duration formatter ───────────────────────────────────────────────────────
function formatDuration(ms) {
    if (ms < 1000)
        return `${ms}ms`;
    const secs = Math.floor(ms / 1000);
    const mins = Math.floor(secs / 60);
    const rem = secs % 60;
    if (mins === 0)
        return `${secs}s`;
    return `${mins}m ${String(rem).padStart(2, "0")}s`;
}
