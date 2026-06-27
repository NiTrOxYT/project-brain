import { SnapshotValidator as CompilerValidator } from "../context-compiler/validator";
export class SnapshotValidator {
    compilerValidator = new CompilerValidator();
    validate(snapshot) {
        const errors = [];
        const warnings = [];
        // 1. Run standard compiler validations
        const base = this.compilerValidator.validate(snapshot);
        errors.push(...base.errors);
        warnings.push(...base.warnings);
        // 2. Extra incremental validations: Check duplicate ids, orphan nodes, valid symbols
        const sectionIds = new Set();
        for (const s of snapshot.sections) {
            if (sectionIds.has(s.id)) {
                errors.push(`Duplicate section ID detected: '${s.id}'`);
            }
            sectionIds.add(s.id);
        }
        // Graph dangling edges
        const nodeIds = new Set(snapshot.graph.nodes.map(n => n.id));
        for (const e of snapshot.graph.edges) {
            if (!nodeIds.has(e.fromId)) {
                errors.push(`Dangling edge source detected: '${e.fromId}'`);
            }
            if (!nodeIds.has(e.toId)) {
                errors.push(`Dangling edge target detected: '${e.toId}'`);
            }
        }
        // Validate symbol integrity
        for (const s of snapshot.symbols) {
            if (!s.name || !s.filePath) {
                errors.push(`Invalid symbol: missing name or filePath`);
            }
        }
        return {
            valid: errors.length === 0,
            errors,
            warnings,
            fingerprintValid: base.fingerprintValid && !errors.some(e => e.includes("fingerprint")),
            sectionsValid: base.sectionsValid && !errors.some(e => e.includes("section")),
            graphValid: base.graphValid && !errors.some(e => e.includes("edge") || e.includes("node")),
            tokenEstimateValid: base.tokenEstimateValid
        };
    }
}
