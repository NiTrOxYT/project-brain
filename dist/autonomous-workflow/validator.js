import { ValidationService } from "../autonomous-runtime/validator.js";
import { ValidationError } from "./errors.js";
export class WorkflowValidator {
    validationService;
    constructor() {
        this.validationService = new ValidationService();
    }
    async validate(workspaceRoot, validators, workspaceEngine, affectedFiles) {
        try {
            // Adapt the validators configuration format
            const AdaptedValidators = validators.map(v => ({
                type: v.type,
                command: v.command,
                timeoutMs: v.timeoutMs
            }));
            // Call the existing ValidationService
            const results = await this.validationService.validate(workspaceRoot, AdaptedValidators, workspaceEngine, affectedFiles);
            // Compute overall success
            const success = results.every(r => r.success);
            return {
                success,
                results: results.map(r => ({
                    success: r.success,
                    type: r.type,
                    message: r.message,
                    errors: r.errors,
                    durationMs: r.durationMs
                }))
            };
        }
        catch (err) {
            throw new ValidationError(`Validation failed: ${err.message}`, err);
        }
    }
}
