import crypto from "crypto";
export class PromptFingerprinter {
    generate(params) {
        const promptHash = crypto.createHash("sha256").update(params.promptContent).digest("hex");
        const dataToHash = JSON.stringify({
            promptHash,
            templateVersion: params.templateVersion,
            learningVersion: params.learningVersion,
            knowledgeVersion: params.knowledgeVersion,
            architectureVersion: params.architectureVersion,
            providerId: params.providerId,
            taskId: params.taskId,
            timestamp: params.timestamp
        });
        const hash = crypto.createHash("sha256").update(dataToHash).digest("hex");
        return {
            hash,
            templateVersion: params.templateVersion,
            learningVersion: params.learningVersion,
            knowledgeVersion: params.knowledgeVersion,
            architectureVersion: params.architectureVersion,
            providerId: params.providerId,
            taskId: params.taskId,
            timestamp: params.timestamp
        };
    }
}
