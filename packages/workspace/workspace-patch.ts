// ──────────────────────────────────────────────────────────────────────────────
// BUILD-048 — Workspace Execution Engine — Patch Engine
// Pure string-based unified diff generation and application.
// No external diff libraries. Deterministic output.
// ──────────────────────────────────────────────────────────────────────────────

import { WorkspacePatch, PatchHunk } from "./workspace-types";
import { WorkspacePatchError } from "./workspace-errors";

export class WorkspacePatchEngine {
    /**
     * Generate a WorkspacePatch representing the change from oldContent to newContent.
     * Uses a line-by-line Myers-style diff algorithm (simplified).
     */
    generatePatch(
        filePath: string,
        oldContent: string,
        newContent: string,
        provider?: string
    ): WorkspacePatch {
        const oldLines = oldContent.split("\n");
        const newLines = newContent.split("\n");
        const hunks = this.diff(oldLines, newLines);

        return {
            path: filePath,
            originalContent: oldContent,
            newContent,
            hunks,
            createdAt: new Date().toISOString(),
            provider
        };
    }

    /**
     * Apply a patch to produce new content from original content.
     * Verifies the patch is applicable before modifying.
     */
    applyPatch(patch: WorkspacePatch): string {
        // Fast path: if newContent is captured, just return it
        if (patch.newContent !== undefined) {
            return patch.newContent;
        }

        // Reconstruct from hunks
        const lines = patch.originalContent.split("\n");
        const result: string[] = [];
        let pos = 0;

        for (const hunk of patch.hunks) {
            if (hunk.startLine < pos) {
                throw new WorkspacePatchError(
                    patch.path,
                    `Overlapping hunk at line ${hunk.startLine} (current position: ${pos})`
                );
            }

            // Copy unchanged lines up to hunk start
            while (pos < hunk.startLine) {
                result.push(lines[pos]);
                pos++;
            }

            // Skip removed lines
            pos += hunk.removedLines.length;

            // Insert added lines
            result.push(...hunk.addedLines);
        }

        // Copy remaining lines
        while (pos < lines.length) {
            result.push(lines[pos]);
            pos++;
        }

        return result.join("\n");
    }

    /**
     * Check whether two content strings are identical (no patch needed).
     */
    isIdentical(a: string, b: string): boolean {
        return a === b;
    }

    /**
     * Simple O(N*M) LCS-based line diff.
     * Returns hunks describing changes from oldLines to newLines.
     */
    private diff(oldLines: string[], newLines: string[]): PatchHunk[] {
        const m = oldLines.length;
        const n = newLines.length;

        // Build LCS table
        const dp: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
        for (let i = 1; i <= m; i++) {
            for (let j = 1; j <= n; j++) {
                if (oldLines[i - 1] === newLines[j - 1]) {
                    dp[i][j] = dp[i - 1][j - 1] + 1;
                } else {
                    dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
                }
            }
        }

        // Backtrack to build edit script
        type EditOp = { op: "keep" | "remove" | "add"; oldIdx: number; newIdx: number; line: string };
        const edits: EditOp[] = [];
        let i = m, j = n;

        while (i > 0 || j > 0) {
            if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
                edits.push({ op: "keep", oldIdx: i - 1, newIdx: j - 1, line: oldLines[i - 1] });
                i--;
                j--;
            } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
                edits.push({ op: "add", oldIdx: i, newIdx: j - 1, line: newLines[j - 1] });
                j--;
            } else {
                edits.push({ op: "remove", oldIdx: i - 1, newIdx: j, line: oldLines[i - 1] });
                i--;
            }
        }

        edits.reverse();

        // Convert edit script to hunks (group consecutive removals/additions)
        const hunks: PatchHunk[] = [];
        let k = 0;
        while (k < edits.length) {
            const edit = edits[k];
            if (edit.op === "keep") {
                k++;
                continue;
            }

            // Start a hunk
            const hunkStart = edit.oldIdx;
            const removed: string[] = [];
            const added: string[] = [];

            while (k < edits.length && edits[k].op !== "keep") {
                if (edits[k].op === "remove") {
                    removed.push(edits[k].line);
                } else {
                    added.push(edits[k].line);
                }
                k++;
            }

            hunks.push({
                startLine: hunkStart,
                removedLines: removed,
                addedLines: added
            });
        }

        return hunks;
    }
}
