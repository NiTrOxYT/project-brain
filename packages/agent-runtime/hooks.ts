import { AgentProvider } from "./provider";
import { RuntimeTask, RuntimeResponse } from "./types";

export interface RuntimeHooks {
    onProviderRegistered?(provider: AgentProvider): void;
    onProviderRemoved?(providerId: string): void;
    onTaskQueued?(task: RuntimeTask): void;
    onTaskStarted?(task: RuntimeTask): void;
    onTaskFinished?(task: RuntimeTask, response: RuntimeResponse): void;
    onTaskFailed?(task: RuntimeTask, error: string): void;
    onRuntimeShutdown?(): void;
}
