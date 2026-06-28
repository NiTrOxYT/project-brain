// ──────────────────────────────────────────────────────────────────────────────
// BUILD-059 — CLI — Paths Utility
// ──────────────────────────────────────────────────────────────────────────────

import fs from "fs";
import path from "path";

export const BRAIN_DIR     = ".brain";
export const BRAIN_CONFIG  = "brain.json";

export function resolveWorkspace(workspacePath?: string): string {
    const resolved = path.resolve(workspacePath ?? process.cwd());
    try {
        return fs.realpathSync(resolved);
    } catch {
        return resolved;
    }
}

export function resolveProject(projectPath?: string, workspace?: string): string {
    const resolved = path.resolve(projectPath ?? workspace ?? process.cwd());
    try {
        return fs.realpathSync(resolved);
    } catch {
        return resolved;
    }
}

export function brainDir(workspace: string): string {
    return path.join(workspace, BRAIN_DIR);
}

export function configPath(workspace: string): string {
    return path.join(brainDir(workspace), BRAIN_CONFIG);
}

export function isBrainInitialized(workspace: string): boolean {
    return fs.existsSync(brainDir(workspace));
}

import { WorkspaceError } from "./errors.js";

export function requireBrainInitialized(workspace: string): void {
    if (!isBrainInitialized(workspace)) {
        throw new WorkspaceError(
            `No .brain workspace found in ${workspace}.\n` +
            `Run: brain init`
        );
    }
}

export function loadConfig(workspace: string): Record<string, unknown> {
    const p = configPath(workspace);
    if (!fs.existsSync(p)) return {};
    try {
        return JSON.parse(fs.readFileSync(p, "utf-8")) as Record<string, unknown>;
    } catch {
        return {};
    }
}

export function saveConfig(workspace: string, config: Record<string, unknown>): void {
    const p = configPath(workspace);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, JSON.stringify(config, null, 2) + "\n");
}
