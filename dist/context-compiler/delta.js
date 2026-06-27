// ──────────────────────────────────────────────────────────────────────────────
// BUILD-054 — Context Compiler — Delta
// Computes a SnapshotDelta between two SemanticSnapshots.
// ──────────────────────────────────────────────────────────────────────────────
export class SnapshotDeltaEngine {
    compute(from, to) {
        const changedFiles = this.computeFileDelta(from, to);
        const changedSymbols = this.computeSymbolDelta(from, to);
        const changedSectionIds = this.computeSectionDelta(from, to);
        const tokenDelta = to.metadata.estimatedTokens - from.metadata.estimatedTokens;
        // Determine whether a full recompile was required
        // (i.e., the fingerprint of the filesystem index changed)
        const fullRecompileRequired = from.metadata.fingerprint.filesystemHash !==
            to.metadata.fingerprint.filesystemHash;
        return {
            fromSnapshotId: from.snapshotId,
            toSnapshotId: to.snapshotId,
            computedAt: new Date().toISOString(),
            changedFiles,
            changedSymbols,
            changedSectionIds,
            tokenDelta,
            fullRecompileRequired
        };
    }
    // ─── File Delta ──────────────────────────────────────────────────────────
    computeFileDelta(from, to) {
        const fromMap = new Map(from.files.map(f => [f.path, f]));
        const toMap = new Map(to.files.map(f => [f.path, f]));
        const result = [];
        for (const [p, toFile] of toMap) {
            const fromFile = fromMap.get(p);
            if (!fromFile) {
                result.push({ path: p, changeKind: "added" });
            }
            else if (fromFile.contentHash !== toFile.contentHash) {
                result.push({ path: p, changeKind: "modified" });
            }
        }
        for (const p of fromMap.keys()) {
            if (!toMap.has(p)) {
                result.push({ path: p, changeKind: "removed" });
            }
        }
        return result.sort((a, b) => {
            // Sort: added first, then modified, then removed; within each group, path order
            const order = { added: 0, modified: 1, removed: 2 };
            const orderComp = order[a.changeKind] - order[b.changeKind];
            if (orderComp !== 0)
                return orderComp;
            return a.path.localeCompare(b.path);
        });
    }
    // ─── Symbol Delta ────────────────────────────────────────────────────────
    computeSymbolDelta(from, to) {
        const key = (s) => `${s.filePath}::${s.name}`;
        const fromMap = new Map(from.symbols.map(s => [key(s), s]));
        const toMap = new Map(to.symbols.map(s => [key(s), s]));
        const result = [];
        for (const [k, toSym] of toMap) {
            const fromSym = fromMap.get(k);
            if (!fromSym) {
                result.push({
                    name: toSym.name,
                    filePath: toSym.filePath,
                    changeKind: "added"
                });
            }
            else if (fromSym.contentHash !== toSym.contentHash) {
                result.push({
                    name: toSym.name,
                    filePath: toSym.filePath,
                    changeKind: "modified"
                });
            }
        }
        for (const [k, fromSym] of fromMap) {
            if (!toMap.has(k)) {
                result.push({
                    name: fromSym.name,
                    filePath: fromSym.filePath,
                    changeKind: "removed"
                });
            }
        }
        return result.sort((a, b) => {
            const fileComp = a.filePath.localeCompare(b.filePath);
            if (fileComp !== 0)
                return fileComp;
            return a.name.localeCompare(b.name);
        });
    }
    // ─── Section Delta ───────────────────────────────────────────────────────
    computeSectionDelta(from, to) {
        const fromMap = new Map(from.sections.map(s => [s.id, s]));
        const toMap = new Map(to.sections.map(s => [s.id, s]));
        const changed = new Set();
        for (const [id, toSec] of toMap) {
            const fromSec = fromMap.get(id);
            if (!fromSec || fromSec.contentHash !== toSec.contentHash) {
                changed.add(id);
            }
        }
        for (const id of fromMap.keys()) {
            if (!toMap.has(id)) {
                changed.add(id);
            }
        }
        return [...changed].sort();
    }
}
