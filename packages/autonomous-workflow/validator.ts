import { ValidationService } from "../autonomous-runtime/validator";
import { WorkspaceEngine } from "../workspace/workspace-engine";
import { WorkflowValidationResult } from "./types";
import { ValidationError } from "./errors";

export class WorkflowValidator {
    private readonly validationService: ValidationService;

    constructor() {
        this.validationService = new ValidationService();
    }

    async validate(
        workspaceRoot: string,
        validators: Array<{
            type: "compile" | "test" | "custom";
            command: string;
            timeoutMs?: number;
        }>,
        workspaceEngine: WorkspaceEngine,
        affectedFiles: string[]
    ): Promise<WorkflowValidationResult> {
        try {
            // Adapt the validators configuration format
            const AdaptedValidators = validators.map(v => ({
                type: v.type,
                command: v.command,
                timeoutMs: v.timeoutMs
            }));

            // Call the existing ValidationService
            const results = await this.validationService.validate(
                workspaceRoot,
                AdaptedValidators,
                workspaceEngine,
                affectedFiles
            );

            // Compute overall success
            const success = results.every(r => r.success);

            return {
                success,
                results: results.map(r => ({
                    success: r.success,
                    type: r.type as any,
                    message: r.message,
                    errors: r.errors,
                    durationMs: r.durationMs
                }))
            };
        } catch (err: any) {
            throw new ValidationError(`Validation failed: ${err.message}`, err);
        }
    }
}
