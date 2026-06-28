import http from "http";
import type { McpTransport } from "../types.js";
import { McpSessionManager } from "../session.js";

export class HttpTransport implements McpTransport {
    private server: http.Server | null = null;
    private readonly port: number;
    private sessionId: string | null = null;

    constructor(port: number = 8765) {
        this.port = port;
    }

    async start(handler: (request: any) => Promise<any>): Promise<void> {
        const session = McpSessionManager.generateSession("http");
        this.sessionId = session.id;

        this.server = http.createServer((req, res) => {
            McpSessionManager.updateActivity(session.id);

            // Enable CORS for local client apps
            res.setHeader("Access-Control-Allow-Origin", "*");
            res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
            res.setHeader("Access-Control-Allow-Headers", "Content-Type");

            if (req.method === "OPTIONS") {
                res.writeHead(204);
                res.end();
                return;
            }

            if (req.method === "POST") {
                let body = "";
                req.on("data", chunk => {
                    body += chunk.toString();
                });
                req.on("end", async () => {
                    try {
                        const payload = JSON.parse(body);
                        const result = await handler(payload);
                        res.writeHead(200, { "Content-Type": "application/json" });
                        res.end(JSON.stringify(result));
                    } catch (err: any) {
                        res.writeHead(400, { "Content-Type": "application/json" });
                        res.end(JSON.stringify({
                            jsonrpc: "2.0",
                            error: { code: -32700, message: "Invalid JSON payload" },
                            id: null
                        }));
                    }
                });
            } else {
                res.writeHead(405);
                res.end("Method Not Allowed");
            }
        });

        return new Promise<void>((resolve, reject) => {
            this.server?.listen(this.port, "127.0.0.1", () => {
                resolve();
            });
            this.server?.on("error", (err) => {
                reject(err);
            });
        });
    }

    async stop(): Promise<void> {
        if (this.server) {
            await new Promise<void>((resolve) => {
                this.server?.close(() => resolve());
            });
            this.server = null;
        }
        if (this.sessionId) {
            McpSessionManager.removeSession(this.sessionId);
            this.sessionId = null;
        }
    }
}
