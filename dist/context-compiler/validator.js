// ──────────────────────────────────────────────────────────────────────────────
// BUILD-054 — Context Compiler — Validator
// Validates snapshot integrity: priorities, fingerprints, graph connectivity,
// and token estimate consistency.
// ──────────────────────────────────────────────────────────────────────────────
import { SnapshotFingerprintEngine } from "./fingerprint.js";
export class SnapshotValidator {
    fpEngine = new SnapshotFingerprintEngine();
    validate(snapshot) {
        const errors = [];
        const warnings = [];
        // 1. Fingerprint integrity
        let fingerprintValid = true;
        if (!snapshot.snapshotId) {
            errors.push("Missing snapshotId.");
            fingerprintValid = false;
        }
        if (!snapshot.metadata.fingerprint.hash) {
            errors.push("Missing fingerprint hash.");
            fingerprintValid = false;
        }
        if (snapshot.snapshotId !== snapshot.metadata.fingerprint.hash) {
            errors.push("snapshotId does not match fingerprint.hash.");
            fingerprintValid = false;
        }
        // Validate each section's content hash
        for (const section of snapshot.sections) {
            const computed = this.fpEngine.hashContent(section.content);
            if (computed !== section.contentHash) {
                errors.push(`Section '${section.id}' has stale contentHash.`);
                fingerprintValid = false;
            }
        }
        // 2. Sections validation
        let sectionsValid = true;
        const sectionIds = new Set();
        for (const section of snapshot.sections) {
            if (!section.id) {
                errors.push("A section is missing an id.");
                sectionsValid = false;
                continue;
            }
            if (sectionIds.has(section.id)) {
                errors.push(`Duplicate section id: '${section.id}'.`);
                sectionsValid = false;
            }
            sectionIds.add(section.id);
            if (section.priority < 0 || section.priority > 100) {
                warnings.push(`Section '${section.id}' has unusual priority: ${section.priority}.`);
            }
            // Token estimate consistency
            const expectedTokens = Math.ceil(section.content.length / 4);
            if (section.estimatedTokens !== expectedTokens) {
                warnings.push(`Section '${section.id}' token estimate mismatch: stored=${section.estimatedTokens}, computed=${expectedTokens}.`);
            }
        }
        // 3. Graph connectivity validation
        let graphValid = true;
        const nodeIds = new Set(snapshot.graph.nodes.map(n => n.id));
        for (const edge of snapshot.graph.edges) {
            if (!nodeIds.has(edge.fromId)) {
                warnings.push(`Graph edge references missing fromId: '${edge.fromId}'.`);
            }
            if (!nodeIds.has(edge.toId)) {
                warnings.push(`Graph edge references missing toId: '${edge.toId}'.`);
            }
        }
        // Topological order completeness
        const topoSet = new Set(snapshot.graph.topologicalOrder);
        for (const nodeId of nodeIds) {
            if (!topoSet.has(nodeId)) {
                warnings.push(`Graph node '${nodeId}' is absent from topologicalOrder.`);
            }
        }
        // 4. Token estimate validity
        let tokenEstimateValid = true;
        const computedTotal = snapshot.sections.reduce((acc, s) => acc + Math.ceil(s.content.length / 4), 0);
        if (snapshot.metadata.estimatedTokens !== computedTotal) {
            warnings.push(`Snapshot total token estimate mismatch: stored=${snapshot.metadata.estimatedTokens}, computed=${computedTotal}.`);
            tokenEstimateValid = false;
        }
        const valid = errors.length === 0;
        return {
            valid,
            errors,
            warnings,
            fingerprintValid,
            sectionsValid,
            graphValid,
            tokenEstimateValid
        };
    }
}
