// ──────────────────────────────────────────────────────────────────────────────
// BUILD-054 — Context Compiler — Dependency Analyzer
// Extracts import/export dependencies from the workspace index and raw file data.
// Produces a normalized SnapshotDependency[] for the snapshot.
// ──────────────────────────────────────────────────────────────────────────────
import path from "path";
import { SnapshotNormalizer } from "./normalizer.js";
export class DependencyAnalyzer {
    normalizer = new SnapshotNormalizer();
    analyze(context) {
        const deps = [];
        if (context.importsData) {
            const extracted = this.extractFromImports(context.importsData, context.workspaceRoot);
            deps.push(...extracted);
        }
        // Primary: extract from relationships.json if it exists
        if (context.relationshipsData) {
            const extracted = this.extractFromRelationships(context.relationshipsData, context.workspaceRoot);
            deps.push(...extracted);
        }
        // Secondary: extract from index data (file entries may have imports arrays)
        if (context.indexData) {
            const extracted = this.extractFromIndex(context.indexData, context.workspaceRoot);
            deps.push(...extracted);
        }
        return this.normalizer.normalizeDependencies(deps);
    }
    extractFromImports(data, workspaceRoot) {
        const deps = [];
        if (!data || !Array.isArray(data.imports))
            return deps;
        for (const imp of data.imports) {
            if (!imp || typeof imp !== "object")
                continue;
            const fromPath = imp.source || "";
            const toPath = imp.target || "";
            if (!fromPath || !toPath)
                continue;
            deps.push({
                fromPath: this.normalizePath(fromPath, workspaceRoot),
                toPath: this.normalizePath(toPath, workspaceRoot),
                kind: "import",
                importNames: []
            });
        }
        return deps;
    }
    // ─── Extractors ──────────────────────────────────────────────────────────
    extractFromRelationships(data, workspaceRoot) {
        const deps = [];
        if (!data || typeof data !== "object")
            return deps;
        // Format 1: Object where keys are file paths and values are arrays of dependent paths
        if (!Array.isArray(data)) {
            for (const [fromPath, targets] of Object.entries(data)) {
                if (!Array.isArray(targets))
                    continue;
                for (const target of targets) {
                    const toPath = typeof target === "string"
                        ? target
                        : (target.path || target.to || "");
                    if (!toPath)
                        continue;
                    deps.push({
                        fromPath: this.normalizePath(fromPath, workspaceRoot),
                        toPath: this.normalizePath(toPath, workspaceRoot),
                        kind: "import",
                        importNames: []
                    });
                }
            }
            return deps;
        }
        // Format 2: Array of relationship objects
        for (const rel of data) {
            if (!rel || typeof rel !== "object")
                continue;
            const fromPath = rel.from || rel.source || rel.fromPath || "";
            const toPath = rel.to || rel.target || rel.toPath || "";
            const kind = this.resolveKind(rel.kind || rel.type || "import");
            const importNames = rel.names || rel.importNames || [];
            if (!fromPath || !toPath)
                continue;
            deps.push({
                fromPath: this.normalizePath(fromPath, workspaceRoot),
                toPath: this.normalizePath(toPath, workspaceRoot),
                kind,
                importNames: Array.isArray(importNames) ? importNames : []
            });
        }
        return deps;
    }
    extractFromIndex(data, workspaceRoot) {
        const deps = [];
        if (!data)
            return deps;
        // Handle array format
        const items = Array.isArray(data)
            ? data
            : Array.isArray(data.files)
                ? data.files
                : [];
        for (const item of items) {
            if (!item || typeof item !== "object")
                continue;
            const fromPath = item.path || item.filePath || "";
            if (!fromPath)
                continue;
            const imports = item.imports || item.dependencies || [];
            for (const imp of imports) {
                const toPath = typeof imp === "string"
                    ? imp
                    : (imp.path || imp.to || imp.source || "");
                if (!toPath)
                    continue;
                deps.push({
                    fromPath: this.normalizePath(fromPath, workspaceRoot),
                    toPath: this.normalizePath(toPath, workspaceRoot),
                    kind: "import",
                    importNames: imp.names || []
                });
            }
        }
        return deps;
    }
    // ─── Helpers ─────────────────────────────────────────────────────────────
    normalizePath(p, base) {
        if (path.isAbsolute(p)) {
            return path.relative(base, p).split(path.sep).join("/");
        }
        return p.split(path.sep).join("/");
    }
    resolveKind(raw) {
        const lower = (raw || "").toLowerCase();
        if (lower.includes("export"))
            return "export";
        if (lower.includes("dynamic"))
            return "dynamic";
        if (lower.includes("re-export") || lower.includes("reexport"))
            return "re-export";
        return "import";
    }
}
