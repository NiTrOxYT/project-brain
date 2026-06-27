import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import { SemanticSnapshot } from "../context-compiler/types";
import { ContextChange, ChangedFile, ChangedSymbol } from "./types";

export class ChangeDetector {
    async detect(
        prev: SemanticSnapshot,
        changedPaths?: string[]
    ): Promise<ContextChange> {
        const files: ChangedFile[] = [];
        const prevFilesMap = new Map(prev.files.map(f => [f.path, f]));
        const pathsToCheck = changedPaths
            ? [...new Set(changedPaths)]
            : [...prevFilesMap.keys()];

        // 1. Detect File Changes
        for (const p of pathsToCheck) {
            const absolutePath = path.isAbsolute(p) ? p : path.join(prev.metadata.projectRoot, p);
            const prevFile = prevFilesMap.get(absolutePath) || prevFilesMap.get(p);

            let exists = false;
            let size = 0;
            let mtime = "";
            let hash = "";

            try {
                const stat = await fs.stat(absolutePath);
                exists = true;
                size = stat.size;
                mtime = stat.mtime.toISOString();
                const content = await fs.readFile(absolutePath);
                hash = crypto.createHash("sha256").update(content).digest("hex");
            } catch {
                exists = false;
            }

            if (!prevFile && exists) {
                files.push({
                    path: absolutePath,
                    changeKind: "added",
                    sizeBytes: size,
                    lastModified: mtime
                });
            } else if (prevFile && !exists) {
                files.push({
                    path: prevFile.path,
                    changeKind: "deleted"
                });
            } else if (prevFile && exists) {
                if (prevFile.contentHash !== hash) {
                    files.push({
                        path: absolutePath,
                        changeKind: "modified",
                        sizeBytes: size,
                        lastModified: mtime
                    });
                }
            }
        }

        // 2. Changed Symbols (simplified: any modified or deleted file has all its symbols marked)
        const symbols: ChangedSymbol[] = [];
        const modifiedOrDeletedPaths = new Set(
            files.filter(f => f.changeKind === "modified" || f.changeKind === "deleted").map(f => f.path)
        );

        for (const sym of prev.symbols) {
            if (modifiedOrDeletedPaths.has(sym.filePath)) {
                symbols.push({
                    name: sym.name,
                    filePath: sym.filePath,
                    changeKind: "deleted",
                    kind: sym.kind
                });
            }
        }

        return {
            files,
            symbols,
            relationships: [],
            nodes: [],
            architecture: [],
            timestamp: new Date().toISOString()
        };
    }
}
