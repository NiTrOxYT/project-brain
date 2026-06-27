import { PromptIntelligenceService } from "../prompt-intelligence/service";
import { LearningEngineService } from "../learning-engine/service";
import { RepairError } from "./errors";

export class WorkflowRepair {
    constructor(
        private readonly projectRoot: string,
        private readonly workspaceRoot: string
    ) {}

    async coordinateRepair(
        taskId: string,
        failureMessage: string,
        taskType: string,
        issue: string
    ): Promise<{ recommendedProvider: string; recommendedRepairStrategy: string; compiledPrompt: string }> {
        try {
            // 1. Query Learning Engine for repair recommendations
            const learningEngine = new LearningEngineService(this.workspaceRoot);
            const rec = await learningEngine.recommend({
                taskTitle: issue,
                taskType: taskType as any
            });

            // 2. Compile repair prompt using Prompt Intelligence Service
            const promptIntel = new PromptIntelligenceService(this.workspaceRoot);
            const promptPkg = await promptIntel.compile({
                task: {
                    id: `repair-${taskId}-${Date.now()}`,
                    type: "modify",
                    title: `Repair Task ${taskId}`,
                    status: "Running",
                    prerequisites: []
                },
                context: {
                    workspaceRoot: this.workspaceRoot,
                    originalTaskId: taskId,
                    failureMessage,
                    isRepairAttempt: true
                },
                providerId: rec.recommendedProvider || "mock-provider"
            });

            return {
                recommendedProvider: rec.recommendedProvider || "mock-provider",
                recommendedRepairStrategy: rec.recommendedRepairStrategy || "refactor",
                compiledPrompt: promptPkg.renderedPrompt
            };
        } catch (err: any) {
            throw new RepairError(`Repair coordination failed: ${err.message}`, err);
        }
    }
}
