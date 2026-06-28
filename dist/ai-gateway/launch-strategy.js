import { spawn } from "child_process";
import { ProviderLaunchError } from "./errors.js";
export class InheritStrategy {
    supports(adapter) {
        return adapter.supportsInteractiveTTY();
    }
    async launch(provider, options) {
        const binaryPath = options.resolvedBinary || await provider.resolvedBinaryPath();
        const args = provider.buildArgs(options);
        const child = spawn(binaryPath, args, {
            stdio: "inherit",
            env: { ...process.env, ...(options.env ?? {}) },
        });
        const spawnPromise = new Promise((resolve, reject) => {
            child.once("error", (err) => {
                reject(new ProviderLaunchError(provider.id, `Resolved Binary\n    ${binaryPath}\nSpawn\n    FAILED\nReason\n    ${err.message}`));
            });
            const t = setTimeout(() => resolve(), 50);
            child.once("spawn", () => {
                clearTimeout(t);
                resolve();
            });
        });
        await spawnPromise;
        const emptyIterable = async function* () {
            // Inherited stdio provides no output streams
        };
        return {
            pid: child.pid ?? 0,
            stdout: emptyIterable(),
            stderr: emptyIterable(),
            cancel: async () => {
                child.kill("SIGTERM");
            },
            wait: () => new Promise(resolve => {
                child.once("exit", (code, signal) => {
                    resolve({ code, signal });
                });
            }),
        };
    }
}
export class NativeSpawnStrategy {
    supports(adapter) {
        return true;
    }
    async launch(provider, options) {
        const binaryPath = options.resolvedBinary || await provider.resolvedBinaryPath();
        const args = provider.buildArgs(options);
        const child = spawn(binaryPath, args, {
            stdio: ["inherit", "pipe", "pipe"],
            env: { ...process.env, ...(options.env ?? {}) },
        });
        const spawnPromise = new Promise((resolve, reject) => {
            child.once("error", (err) => {
                reject(new ProviderLaunchError(provider.id, `Resolved Binary\n    ${binaryPath}\nSpawn\n    FAILED\nReason\n    ${err.message}`));
            });
            const t = setTimeout(() => resolve(), 50);
            child.once("spawn", () => {
                clearTimeout(t);
                resolve();
            });
        });
        await spawnPromise;
        if (!child.stdout || !child.stderr) {
            throw new ProviderLaunchError(provider.id, "Failed to obtain process streams after spawn");
        }
        const streamChunks = async function* (stream) {
            for await (const chunk of stream) {
                yield chunk.toString("utf8");
            }
        };
        return {
            pid: child.pid ?? 0,
            stdout: streamChunks(child.stdout),
            stderr: streamChunks(child.stderr),
            cancel: async () => {
                child.kill("SIGTERM");
            },
            wait: () => new Promise(resolve => {
                child.once("exit", (code, signal) => {
                    resolve({ code, signal });
                });
            }),
        };
    }
}
export class LaunchStrategyRegistry {
    static strategies = [
        new InheritStrategy(),
        new NativeSpawnStrategy()
    ];
    static select(adapter, options) {
        for (const strat of this.strategies) {
            if (strat.supports(adapter)) {
                return strat;
            }
        }
        return new NativeSpawnStrategy();
    }
}
