import { getTemplateForTaskType, renderTemplate } from "./templates";
export class PromptAssembler {
    assemble(context, profile) {
        const { task, runtimeContext } = context;
        const sections = [];
        // 1. System Rules
        sections.push({
            id: "system",
            name: "System Rules",
            content: "You are an expert autonomous AI software engineering agent working on behalf of the user.",
            priority: 100
        });
        // 2. Provider Rules
        const rulesContent = [
            "CRITICAL EXECUTION RULES:",
            "1. You MUST NEVER modify any files on the filesystem directly. Do NOT write, delete, or create files on disk.",
            "2. You only propose changes by returning them in a structured machine-readable format.",
            "3. You MUST format your proposed changes and artifacts in a single JSON block wrapped inside ---START_ARTIFACTS--- and ---END_ARTIFACTS---.",
            "4. Any conversational output or explanation must come BEFORE or AFTER the artifacts block.",
            "5. The JSON format must adhere strictly to the following schema:",
            "{",
            '  "artifacts": [',
            "    {",
            '      "id": "unique-id",',
            '      "type": "code" | "patch" | "test" | "documentation" | "log" | "diagnostic",',
            '      "path": "relative/file/path",',
            '      "content": "raw content or patch/diff content"',
            "    }",
            "  ]",
            "}"
        ];
        sections.push({
            id: "provider-rules",
            name: "Provider Rules",
            content: rulesContent.join("\n"),
            priority: 99
        });
        // 3. Architecture
        const archEntries = context.architectureMemory?.entries || [];
        if (archEntries.length > 0) {
            const archLines = archEntries.map((e) => `- [${e.category}] ${e.title}: ${e.description}`).join("\n");
            sections.push({
                id: "architecture",
                name: "Architecture Memory",
                content: archLines,
                priority: 98
            });
        }
        // 4. Task Instructions
        const isRepair = !!runtimeContext.isRepairAttempt;
        const template = getTemplateForTaskType(task.type, isRepair);
        const taskContent = renderTemplate(template.templateText, {
            taskTitle: task.title,
            taskFile: task.file || "none",
            taskSymbol: task.symbol || "none",
            originalTaskId: runtimeContext.originalTaskId || "none",
            originalTaskTitle: runtimeContext.originalTaskTitle || "none",
            failureCategory: runtimeContext.failureCategory || "none",
            failureMessage: runtimeContext.failureMessage || "none",
            failureDetails: typeof runtimeContext.failureDetails === "object" ? JSON.stringify(runtimeContext.failureDetails) : (runtimeContext.failureDetails || "none")
        });
        sections.push({
            id: "task",
            name: "Task Instructions",
            content: taskContent,
            priority: 95
        });
        // 5. Context - Files
        const fused = context.knowledgeFusion || [];
        if (fused.length > 0) {
            const fileLines = fused.map((c) => `File Path: ${c.path} (Relevance Score: ${c.score})`).join("\n");
            sections.push({
                id: "files",
                name: "Relevant Files",
                content: fileLines,
                priority: 90
            });
        }
        // 5. Context - Symbols
        if (task.symbol) {
            sections.push({
                id: "symbols",
                name: "Target Symbols",
                content: `Target Symbol declared: ${task.symbol} in file ${task.file || "unknown"}.`,
                priority: 85
            });
        }
        // 5. Context - Relationships
        const rels = context.relationshipGraph || {};
        const relKeys = Object.keys(rels);
        if (relKeys.length > 0) {
            const relLines = relKeys.map(k => `Dependency: ${k} -> ${JSON.stringify(rels[k])}`).join("\n");
            sections.push({
                id: "relationships",
                name: "Relationships Graph",
                content: relLines,
                priority: 70
            });
        }
        // 6. Execution Plan
        const planNodes = context.executionGraph?.nodes || [];
        if (planNodes.length > 0) {
            const planLines = planNodes.map((n) => `- Task ${n.id} [${n.type}]: ${n.title} (Status: ${n.status})`).join("\n");
            sections.push({
                id: "execution-graph",
                name: "Execution Plan Graph",
                content: planLines,
                priority: 60
            });
        }
        // 7. Constraints
        const constraints = runtimeContext.constraints || {};
        const constrKeys = Object.keys(constraints);
        if (constrKeys.length > 0) {
            const constrLines = constrKeys.map(k => `- ${k}: ${constraints[k]}`).join("\n");
            sections.push({
                id: "constraints",
                name: "Constraints",
                content: constrLines,
                priority: 80
            });
        }
        // 8. Learning / History
        const optimizations = context.learningEngine?.optimizations || [];
        if (optimizations.length > 0) {
            const optLines = optimizations.map((o) => `- Rule [${o.ruleType}]: ${o.id} (Confidence: ${o.confidence})`).join("\n");
            sections.push({
                id: "learning",
                name: "Learning Optimizations",
                content: optLines,
                priority: 50
            });
        }
        // 9. Validation Requirements
        const rules = runtimeContext.rules || {};
        const rulesKeys = Object.keys(rules);
        if (rulesKeys.length > 0) {
            const rulesLines = rulesKeys.map(k => `- ${k}: ${rules[k]}`).join("\n");
            sections.push({
                id: "validation",
                name: "Validation Rules",
                content: rulesLines,
                priority: 40
            });
        }
        return sections;
    }
}
