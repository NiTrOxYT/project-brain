import { randomBytes } from "crypto";
export class McpSessionManager {
    static sessions = new Map();
    static globalToken = null;
    static generateSession(transport) {
        const id = randomBytes(16).toString("hex");
        const token = this.getGlobalToken();
        const session = {
            id,
            token,
            transport,
            createdAt: Date.now(),
            lastActivityAt: Date.now()
        };
        this.sessions.set(id, session);
        return session;
    }
    static getGlobalToken() {
        if (!this.globalToken) {
            this.globalToken = randomBytes(32).toString("hex");
        }
        return this.globalToken;
    }
    static setGlobalToken(token) {
        this.globalToken = token;
    }
    static validateToken(token) {
        return token === this.getGlobalToken();
    }
    static updateActivity(sessionId) {
        const session = this.sessions.get(sessionId);
        if (session) {
            session.lastActivityAt = Date.now();
        }
    }
    static listSessions() {
        return Array.from(this.sessions.values());
    }
    static removeSession(sessionId) {
        this.sessions.delete(sessionId);
    }
    static clear() {
        this.sessions.clear();
        this.globalToken = null;
    }
}
