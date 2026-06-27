import { RuntimeTask, RuntimeContext, RuntimeResponse, AgentCapability, RuntimeEvent } from "./types.js";

export interface AgentProvider {
    id: string;
    name: string;
    capabilities: AgentCapability[];
    priority?: number;
    version?: string;
    supportedRuntimeVersion?: string;
    health?: "Healthy" | "Degraded" | "Offline";
    metadata?: Record<string, any>;
    initialize(): Promise<void>;
    shutdown(): Promise<void>;
    supportsCapability(capability: AgentCapability): boolean;
    execute(task: RuntimeTask, context: RuntimeContext, onEvent: (event: RuntimeEvent) => void): Promise<RuntimeResponse>;
    pause(taskId: string): Promise<void>;
    resume(taskId: string): Promise<void>;
    cancel(taskId: string): Promise<void>;
}
