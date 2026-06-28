import readline from "readline";
import { McpSessionManager } from "../session.js";
export class StdioTransport {
    rl = null;
    sessionId = null;
    async start(handler) {
        const session = McpSessionManager.generateSession("stdio");
        this.sessionId = session.id;
        this.rl = readline.createInterface({
            input: process.stdin,
            // output must NOT be set to process.stdout — stdout is reserved for JSON-RPC only.
            // With terminal:false, readline emits no prompts, but omitting output entirely
            // is the only safe guarantee against any echo contaminating the MCP stream.
            terminal: false
        });
        this.rl.on("line", async (line) => {
            if (!line.trim())
                return;
            McpSessionManager.updateActivity(session.id);
            try {
                const req = JSON.parse(line);
                const res = await handler(req);
                if (res !== null) {
                    process.stdout.write(JSON.stringify(res) + "\n");
                }
            }
            catch (err) {
                process.stdout.write(JSON.stringify({
                    jsonrpc: "2.0",
                    error: { code: -32700, message: "Parse error" },
                    id: null
                }) + "\n");
            }
        });
    }
    async stop() {
        if (this.rl) {
            this.rl.close();
            this.rl = null;
        }
        if (this.sessionId) {
            McpSessionManager.removeSession(this.sessionId);
            this.sessionId = null;
        }
    }
}
