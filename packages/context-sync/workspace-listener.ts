import { WorkspaceEngine, WorkspaceChangedEvent } from "../workspace/workspace-engine.js";
import { ContextSyncRequest, ContextSyncResult } from "./types.js";
import { ContextSynchronizationError } from "./errors.js";

export class WorkspaceListener {
    private active = false;
    private queue: { event: WorkspaceChangedEvent; resolve: (val: any) => void; reject: (err: any) => void }[] = [];
    private processing = false;
    private readonly callback: (req: ContextSyncRequest) => Promise<ContextSyncResult>;

    constructor(
        callback: (req: ContextSyncRequest) => Promise<ContextSyncResult>
    ) {
        this.callback = callback;
    }

    start(): void {
        if (this.active) return;
        this.active = true;
        WorkspaceEngine.emitter.on("WorkspaceChangedEvent", this.handleEvent);
    }

    stop(): void {
        if (!this.active) return;
        this.active = false;
        WorkspaceEngine.emitter.off("WorkspaceChangedEvent", this.handleEvent);
    }

    private handleEvent = (event: WorkspaceChangedEvent): void => {
        new Promise((resolve, reject) => {
            this.queue.push({ event, resolve, reject });
            this.processQueue();
        }).catch(() => { /* best-effort */ });
    };

    private async processQueue(): Promise<void> {
        if (this.processing) return;
        this.processing = true;

        while (this.queue.length > 0) {
            const item = this.queue.shift();
            if (!item) continue;
            try {
                const { event, resolve } = item;
                const changedPaths = event.affectedFiles.map(f => f.path);
                const req: ContextSyncRequest = {
                    projectRoot: event.workspaceRoot,
                    workspaceRoot: event.workspaceRoot,
                    transactionId: event.transactionId,
                    changedPaths
                };
                const result = await this.callback(req);
                resolve(result);
            } catch (err) {
                console.error("WorkspaceListener sync failed:", err);
                item.reject(err);
            }
        }

        this.processing = false;
    }
}
