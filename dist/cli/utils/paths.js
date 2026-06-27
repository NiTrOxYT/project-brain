// ──────────────────────────────────────────────────────────────────────────────
// BUILD-059 — CLI — Paths Utility
// ──────────────────────────────────────────────────────────────────────────────
import fs from "fs";
import path from "path";
export const BRAIN_DIR = ".brain";
export const BRAIN_CONFIG = "brain.json";
export function resolveWorkspace(workspacePath) {
    return path.resolve(workspacePath ?? process.cwd());
}
export function resolveProject(projectPath, workspace) {
    return path.resolve(projectPath ?? workspace ?? process.cwd());
}
export function brainDir(workspace) {
    return path.join(workspace, BRAIN_DIR);
}
export function configPath(workspace) {
    return path.join(brainDir(workspace), BRAIN_CONFIG);
}
export function isBrainInitialized(workspace) {
    return fs.existsSync(brainDir(workspace));
}
import { WorkspaceError } from "./errors.js";
export function requireBrainInitialized(workspace) {
    if (!isBrainInitialized(workspace)) {
        throw new WorkspaceError(`No .brain workspace found in ${workspace}.\n` +
            `Run: brain init`);
    }
}
export function loadConfig(workspace) {
    const p = configPath(workspace);
    if (!fs.existsSync(p))
        return {};
    try {
        return JSON.parse(fs.readFileSync(p, "utf-8"));
    }
    catch {
        return {};
    }
}
export function saveConfig(workspace, config) {
    const p = configPath(workspace);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, JSON.stringify(config, null, 2) + "\n");
}
