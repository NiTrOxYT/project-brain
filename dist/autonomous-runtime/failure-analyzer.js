// ──────────────────────────────────────────────────────────────────────────────
// BUILD-051 — Autonomous Execution Loop — Failure Analysis
// ──────────────────────────────────────────────────────────────────────────────
export class FailureAnalyzer {
    analyze(phase, error, taskId) {
        const timestamp = new Date().toISOString();
        const message = error.message || String(error);
        const details = error.stack || (error.errors ? error.errors.join("\n") : "") || "";
        let category = "Permanent";
        // Check based on standard properties
        if (message.includes("timeout") || message.includes("Timeout")) {
            category = "Timeout";
        }
        else if (message.includes("cancel") ||
            message.includes("cancelled") ||
            message.includes("SIG") ||
            message.includes("killed")) {
            category = "Cancellation";
        }
        else if (message.includes("tsc") ||
            message.includes("compile") ||
            message.includes("Compilation") ||
            message.includes("TypeScript") ||
            /TS\d+/.test(message)) {
            category = "Compilation";
        }
        else if (message.includes("test") ||
            message.includes("Test") ||
            message.includes("assertion") ||
            message.includes("expect") ||
            message.includes("assert")) {
            category = "Test";
        }
        else if (message.includes("Workspace") ||
            message.includes("transaction") ||
            message.includes("consistency") ||
            message.includes("file not found")) {
            category = "Workspace";
        }
        else if (message.includes("provider") ||
            message.includes("Provider") ||
            message.includes("rate limit") ||
            message.includes("API key")) {
            category = "Provider";
        }
        else if (message.includes("Cannot find module") ||
            message.includes("module not found") ||
            message.includes("dependency")) {
            category = "Dependency";
        }
        else if (error.retryable === true || error.code === "PROVIDER_TRANSIENT_ERROR") {
            category = "Transient";
        }
        else {
            // Text scanning fallback
            const combined = `${message} ${details}`.toLowerCase();
            if (combined.includes("tsc") ||
                combined.includes("typescript") ||
                combined.includes("compilation") ||
                /ts\d+/.test(combined)) {
                category = "Compilation";
            }
            else if (combined.includes("test") ||
                combined.includes("expect") ||
                combined.includes("assert") ||
                combined.includes("assertion")) {
                category = "Test";
            }
            else if (combined.includes("timeout") || combined.includes("timed out")) {
                category = "Timeout";
            }
            else if (combined.includes("cancel") ||
                combined.includes("sigterm") ||
                combined.includes("sigkill")) {
                category = "Cancellation";
            }
            else if (combined.includes("provider") ||
                combined.includes("api key") ||
                combined.includes("unauthenticated")) {
                category = "Provider";
            }
            else if (combined.includes("enoent") || combined.includes("filesystem") || combined.includes("transaction")) {
                category = "Workspace";
            }
            else if (combined.includes("module not found") || combined.includes("cannot find module")) {
                category = "Dependency";
            }
            else if (combined.includes("runtime error") || combined.includes("typeerror") || combined.includes("nullpointer")) {
                category = "Runtime";
            }
            else if (error.exitCode === 1 || error.exitCode === 2) {
                category = "Transient";
            }
        }
        return {
            taskId,
            phase,
            category,
            message,
            details: details || undefined,
            timestamp
        };
    }
}
