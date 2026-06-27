// ──────────────────────────────────────────────────────────────────────────────
// BUILD-054 — Context Compiler — Fingerprint
// Deterministic SHA256 hashing of snapshot content components.
// Byte-identical inputs → byte-identical outputs.
// ──────────────────────────────────────────────────────────────────────────────
import crypto from "crypto";
import { SnapshotFingerprintError } from "./errors";
export class SnapshotFingerprintEngine {
    /**
     * Compute a deterministic fingerprint for the given snapshot context.
     * Every field is sorted before hashing to guarantee byte-identical output
     * for semantically identical inputs.
     */
    compute(context) {
        try {
            const filesystemHash = this.hashData(context.filePaths
                ? [...context.filePaths].sort().join("\n")
                : "");
            const graphHash = this.hashData(context.graphData ? this.stableStringify(context.graphData) : "");
            const architectureHash = this.hashData(context.architectureData ? this.stableStringify(context.architectureData) : "");
            const evolutionHash = this.hashData(context.evolutionData ? this.stableStringify(context.evolutionData) : "");
            const learningHash = this.hashData(context.learningData ? this.stableStringify(context.learningData) : "");
            // Combine all component hashes into a single stable hash
            const combined = [
                filesystemHash,
                graphHash,
                architectureHash,
                evolutionHash,
                learningHash
            ].join("|");
            const hash = this.hashData(combined);
            // Derive a semver-style version from the first 12 chars of the hash
            const version = this.deriveVersion(hash);
            return {
                hash,
                filesystemHash,
                graphHash,
                architectureHash,
                evolutionHash,
                learningHash,
                version
            };
        }
        catch (err) {
            throw new SnapshotFingerprintError(`Failed to compute fingerprint: ${err.message}`);
        }
    }
    /**
     * Hash a serialized snapshot payload (for section-level content hashes).
     */
    hashContent(content) {
        return this.hashData(content);
    }
    /**
     * Verify that a stored fingerprint matches the current context.
     */
    verify(stored, context) {
        try {
            const current = this.compute(context);
            return current.hash === stored.hash;
        }
        catch {
            return false;
        }
    }
    // ─── Internal ────────────────────────────────────────────────────────────
    hashData(data) {
        return crypto.createHash("sha256").update(data).digest("hex");
    }
    /**
     * Deterministic JSON stringification — keys sorted recursively.
     * Arrays maintain insertion order (they are ordered by semantics).
     * Object keys are sorted alphabetically.
     */
    stableStringify(value) {
        if (value === null || value === undefined) {
            return String(value);
        }
        if (typeof value !== "object") {
            return JSON.stringify(value);
        }
        if (Array.isArray(value)) {
            return "[" + value.map(v => this.stableStringify(v)).join(",") + "]";
        }
        const keys = Object.keys(value).sort();
        const pairs = keys.map(k => JSON.stringify(k) + ":" + this.stableStringify(value[k]));
        return "{" + pairs.join(",") + "}";
    }
    deriveVersion(hash) {
        // Extract 3 numeric segments from hash characters for semver-like version
        const seg1 = parseInt(hash.slice(0, 4), 16) % 1000;
        const seg2 = parseInt(hash.slice(4, 8), 16) % 1000;
        const seg3 = parseInt(hash.slice(8, 12), 16) % 1000;
        return `${seg1}.${seg2}.${seg3}`;
    }
}
