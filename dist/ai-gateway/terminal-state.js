export class TerminalStateManager {
    originalSignalListeners = new Map();
    originalRawMode = false;
    capture() {
        this.originalRawMode = process.stdin.isTTY ? !!process.stdin.isRaw : false;
        // Suspend signals so that child owns them
        const signals = ["SIGINT", "SIGTERM", "SIGWINCH", "SIGQUIT", "SIGHUP"];
        for (const sig of signals) {
            const listeners = process.listeners(sig);
            this.originalSignalListeners.set(sig, [...listeners]);
            for (const l of listeners) {
                process.removeListener(sig, l);
            }
        }
    }
    restore() {
        // Restore process signal listeners
        for (const [sig, listeners] of this.originalSignalListeners.entries()) {
            for (const l of listeners) {
                if (!process.listeners(sig).includes(l)) {
                    process.addListener(sig, l);
                }
            }
        }
        // Restore raw mode only if process is TTY
        if (process.stdin.isTTY && typeof process.stdin.setRawMode === "function") {
            try {
                if (process.stdin.isRaw !== this.originalRawMode) {
                    process.stdin.setRawMode(this.originalRawMode);
                }
            }
            catch { }
        }
    }
}
