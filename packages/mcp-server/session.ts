import { randomBytes } from "crypto";

export interface McpSession {
    readonly id:         string;
    readonly token:      string;
    readonly transport:  "stdio" | "http";
    readonly createdAt:  number;
    lastActivityAt:      number;
}

export class McpSessionManager {
    private static sessions: Map<string, McpSession> = new Map();
    private static globalToken: string | null = null;

    static generateSession(transport: "stdio" | "http"): McpSession {
        const id = randomBytes(16).toString("hex");
        const token = this.getGlobalToken();
        const session: McpSession = {
            id,
            token,
            transport,
            createdAt: Date.now(),
            lastActivityAt: Date.now()
        };
        this.sessions.set(id, session);
        return session;
    }

    static getGlobalToken(): string {
        if (!this.globalToken) {
            this.globalToken = randomBytes(32).toString("hex");
        }
        return this.globalToken;
    }

    static setGlobalToken(token: string): void {
        this.globalToken = token;
    }

    static validateToken(token: string): boolean {
        return token === this.getGlobalToken();
    }

    static updateActivity(sessionId: string): void {
        const session = this.sessions.get(sessionId);
        if (session) {
            session.lastActivityAt = Date.now();
        }
    }

    static listSessions(): McpSession[] {
        return Array.from(this.sessions.values());
    }

    static removeSession(sessionId: string): void {
        this.sessions.delete(sessionId);
    }

    static clear(): void {
        this.sessions.clear();
        this.globalToken = null;
    }
}
