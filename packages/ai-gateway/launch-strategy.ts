import { spawn } from "child_process";
import type { ProviderAdapter, LaunchOptions, ProviderProcess, ExitResult } from "./types.js";
import { ProviderLaunchError } from "./errors.js";

export interface LaunchResult extends ProviderProcess {}

export interface LaunchStrategy {
    supports(adapter: ProviderAdapter): boolean;
    launch(
        provider: ProviderAdapter,
        options: LaunchOptions
    ): Promise<LaunchResult>;
}

export class InheritStrategy implements LaunchStrategy {
    supports(adapter: ProviderAdapter): boolean {
        return adapter.supportsInteractiveTTY();
    }

    async launch(
        provider: ProviderAdapter,
        options: LaunchOptions
    ): Promise<LaunchResult> {
        const binaryPath = options.resolvedBinary || await provider.resolvedBinaryPath();
        const args = (provider as any).buildArgs(options);

        const child = spawn(binaryPath, args, {
            stdio: "inherit",
            env: { ...process.env, ...(options.env ?? {}) },
        });

        const spawnPromise = new Promise<void>((resolve, reject) => {
            child.once("error", (err: any) => {
                reject(new ProviderLaunchError(
                    provider.id,
                    `Resolved Binary\n    ${binaryPath}\nSpawn\n    FAILED\nReason\n    ${err.message}`
                ));
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
            wait: (): Promise<ExitResult> =>
                new Promise(resolve => {
                    child.once("close", (code, signal) => {
                        resolve({ code, signal });
                    });
                }),
        };
    }
}

export class NativeSpawnStrategy implements LaunchStrategy {
    supports(adapter: ProviderAdapter): boolean {
        return true;
    }

    async launch(
        provider: ProviderAdapter,
        options: LaunchOptions
    ): Promise<LaunchResult> {
        const binaryPath = options.resolvedBinary || await provider.resolvedBinaryPath();
        const args = (provider as any).buildArgs(options);

        const child = spawn(binaryPath, args, {
            stdio: ["inherit", "pipe", "pipe"],
            env: { ...process.env, ...(options.env ?? {}) },
        });

        const spawnPromise = new Promise<void>((resolve, reject) => {
            child.once("error", (err: any) => {
                reject(new ProviderLaunchError(
                    provider.id,
                    `Resolved Binary\n    ${binaryPath}\nSpawn\n    FAILED\nReason\n    ${err.message}`
                ));
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

        const streamChunks = async function* (stream: NodeJS.ReadableStream) {
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
            wait: (): Promise<ExitResult> =>
                new Promise(resolve => {
                    child.once("close", (code, signal) => {
                        resolve({ code, signal });
                    });
                }),
        };
    }
}

export class LaunchStrategyRegistry {
    private static strategies: LaunchStrategy[] = [
        new InheritStrategy(),
        new NativeSpawnStrategy()
    ];

    static select(adapter: ProviderAdapter, options: LaunchOptions): LaunchStrategy {
        for (const strat of this.strategies) {
            if (strat.supports(adapter)) {
                return strat;
            }
        }
        return new NativeSpawnStrategy();
    }
}
