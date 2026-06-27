import { AgentProvider } from "./provider.js";
import { RuntimeTask, RuntimeResponse } from "./types.js";

export interface RuntimeHooks {
    onProviderRegistered?(provider: AgentProvider): void;
    onProviderRemoved?(providerId: string): void;
    onTaskQueued?(task: RuntimeTask): void;
    onTaskStarted?(task: RuntimeTask): void;
    onTaskFinished?(task: RuntimeTask, response: RuntimeResponse): void;
    onTaskFailed?(task: RuntimeTask, error: string): void;
    onRuntimeShutdown?(): void;
}
