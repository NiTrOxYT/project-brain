export class TerminalStateManager {
    private originalSignalListeners: Map<string, any[]> = new Map();
    private originalRawMode = false;

    capture(): void {
        this.originalRawMode = process.stdin.isTTY ? !!process.stdin.isRaw : false;

        // Suspend signals so that child owns them
        const signals = ["SIGINT", "SIGTERM", "SIGWINCH", "SIGQUIT", "SIGHUP"];
        for (const sig of signals) {
            const listeners = process.listeners(sig as any);
            this.originalSignalListeners.set(sig, [...listeners]);
            for (const l of listeners) {
                process.removeListener(sig, l);
            }
        }
    }

    restore(): void {
        // Restore process signal listeners
        for (const [sig, listeners] of this.originalSignalListeners.entries()) {
            for (const l of listeners) {
                if (!process.listeners(sig as any).includes(l)) {
                    process.addListener(sig as any, l);
                }
            }
        }

        // Restore raw mode only if process is TTY
        if (process.stdin.isTTY && typeof process.stdin.setRawMode === "function") {
            try {
                if (process.stdin.isRaw !== this.originalRawMode) {
                    process.stdin.setRawMode(this.originalRawMode);
                }
            } catch {}
        }
    }
}
