// ──────────────────────────────────────────────────────────────────────────────
// BUILD-051 — Autonomous Execution Loop — Validation
// ──────────────────────────────────────────────────────────────────────────────

import fs from "fs";
import path from "path";
import { ValidatorConfig, ValidationResult } from "./types.js";
import { ProviderExecutionService } from "../provider-execution/service.js";
import { WorkspaceEngine } from "../workspace/workspace-engine.js";
import { ExecutionRequest } from "../provider-execution/types.js";

export class ValidationService {
    private readonly execService: ProviderExecutionService;

    constructor(execService?: ProviderExecutionService) {
        this.execService = execService || new ProviderExecutionService();
    }

    async validate(
        workspaceRoot: string,
        configs: ValidatorConfig[],
        workspaceEngine?: WorkspaceEngine,
        affectedFiles?: string[]
    ): Promise<ValidationResult[]> {
        const results: ValidationResult[] = [];

        // 1. Workspace Engine & File Consistency check
        if (affectedFiles && affectedFiles.length > 0) {
            const start = Date.now();
            const missingFiles: string[] = [];
            for (const relPath of affectedFiles) {
                // Handle absolute/relative mapping safely
                const fullPath = path.isAbsolute(relPath) ? relPath : path.join(workspaceRoot, relPath);
                if (!fs.existsSync(fullPath)) {
                    missingFiles.push(relPath);
                }
            }
            results.push({
                success: missingFiles.length === 0,
                type: "workspace",
                message: missingFiles.length === 0
                    ? "Workspace consistency check passed"
                    : `Missing modified files: ${missingFiles.join(", ")}`,
                errors: missingFiles.length === 0 ? undefined : missingFiles.map(f => `File not found: ${f}`),
                durationMs: Date.now() - start
            });
        }

        // 2. Shell validator commands (tsc, npm run test, etc.)
        for (const config of configs) {
            const start = Date.now();
            const isWin = process.platform === "win32";
            const executable = isWin ? "cmd.exe" : "/bin/sh";
            const args = isWin ? ["/d", "/s", "/c", config.command] : ["-c", config.command];

            const req: ExecutionRequest = {
                id: `val-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
                executable,
                args,
                cwd: workspaceRoot,
                env: {},
                includeParentEnv: true,
                timeout: config.timeoutMs ? { executionTimeoutMs: config.timeoutMs } : undefined
            };

            try {
                const res = await this.execService.execute(req);
                const success = res.exitCode === 0;
                const errorsList: string[] = [];
                if (!success) {
                    const stderrClean = res.output.stderr.trim();
                    const stdoutClean = res.output.stdout.trim();
                    if (stderrClean) {
                        errorsList.push(...stderrClean.split("\n").filter(Boolean));
                    } else if (stdoutClean) {
                        errorsList.push(...stdoutClean.split("\n").filter(Boolean));
                    } else {
                        errorsList.push(`Process exited with non-zero exit code: ${res.exitCode}`);
                    }
                }
                results.push({
                    success,
                    type: config.type,
                    message: success
                        ? `Validation command passed: ${config.command}`
                        : `Validation command failed: ${config.command}`,
                    errors: errorsList.length > 0 ? errorsList : undefined,
                    durationMs: Date.now() - start
                });
            } catch (err: any) {
                results.push({
                    success: false,
                    type: config.type,
                    message: `Validation execution error: ${err.message}`,
                    errors: [err.message],
                    durationMs: Date.now() - start
                });
            }
        }

        return results;
    }
}
