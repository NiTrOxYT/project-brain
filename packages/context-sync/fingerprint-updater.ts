import crypto from "crypto";
import { SnapshotFingerprint, SnapshotSection } from "../context-compiler/types.js";

export class FingerprintUpdater {
    update(
        prev: SnapshotFingerprint,
        patchedSections: SnapshotSection[]
    ): SnapshotFingerprint {
        // Re-read component hashes directly from the updated sections array
        const fsIndex = patchedSections.find(s => s.id === "filesystem-index");
        const graphIndex = patchedSections.find(s => s.id === "execution-graph");

        const filesystemHash = fsIndex ? fsIndex.contentHash : prev.filesystemHash;
        const graphHash = graphIndex ? graphIndex.contentHash : prev.graphHash;

        // Combine component hashes
        const combined = [
            filesystemHash,
            graphHash,
            prev.architectureHash || "",
            prev.evolutionHash || "",
            prev.learningHash || ""
        ].join("|");

        const hash = crypto.createHash("sha256").update(combined).digest("hex");
        const version = this.deriveVersion(hash);

        return {
            hash,
            filesystemHash,
            graphHash,
            architectureHash: prev.architectureHash,
            evolutionHash: prev.evolutionHash,
            learningHash: prev.learningHash,
            version
        };
    }

    private deriveVersion(hash: string): string {
        const seg1 = parseInt(hash.slice(0, 4), 16) % 1000;
        const seg2 = parseInt(hash.slice(4, 8), 16) % 1000;
        const seg3 = parseInt(hash.slice(8, 12), 16) % 1000;
        return `${seg1}.${seg2}.${seg3}`;
    }
}
