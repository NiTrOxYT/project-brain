import { WorkspaceEngine } from "../workspace/workspace-engine";
export class WorkspaceListener {
    active = false;
    queue = [];
    processing = false;
    callback;
    constructor(callback) {
        this.callback = callback;
    }
    start() {
        if (this.active)
            return;
        this.active = true;
        WorkspaceEngine.emitter.on("WorkspaceChangedEvent", this.handleEvent);
    }
    stop() {
        if (!this.active)
            return;
        this.active = false;
        WorkspaceEngine.emitter.off("WorkspaceChangedEvent", this.handleEvent);
    }
    handleEvent = (event) => {
        new Promise((resolve, reject) => {
            this.queue.push({ event, resolve, reject });
            this.processQueue();
        }).catch(() => { });
    };
    async processQueue() {
        if (this.processing)
            return;
        this.processing = true;
        while (this.queue.length > 0) {
            const item = this.queue.shift();
            if (!item)
                continue;
            try {
                const { event, resolve } = item;
                const changedPaths = event.affectedFiles.map(f => f.path);
                const req = {
                    projectRoot: event.workspaceRoot,
                    workspaceRoot: event.workspaceRoot,
                    transactionId: event.transactionId,
                    changedPaths
                };
                const result = await this.callback(req);
                resolve(result);
            }
            catch (err) {
                item.reject(err);
            }
        }
        this.processing = false;
    }
}
