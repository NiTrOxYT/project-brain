// ──────────────────────────────────────────────────────────────────────────────
// BUILD-050B — Claude Code Provider — Response Parser
// ──────────────────────────────────────────────────────────────────────────────
export function parseResponse(stdout, taskId, providerId) {
    const startMarker = "---START_ARTIFACTS---";
    const endMarker = "---END_ARTIFACTS---";
    const startIdx = stdout.indexOf(startMarker);
    if (startIdx === -1) {
        throw new Error("Invalid response: missing ---START_ARTIFACTS--- marker");
    }
    const endIdx = stdout.indexOf(endMarker, startIdx + startMarker.length);
    if (endIdx === -1) {
        throw new Error("Invalid response: missing ---END_ARTIFACTS--- marker");
    }
    const jsonStr = stdout.substring(startIdx + startMarker.length, endIdx).trim();
    if (!jsonStr) {
        throw new Error("Invalid response: artifacts JSON block is empty");
    }
    let payload;
    try {
        payload = JSON.parse(jsonStr);
    }
    catch (err) {
        throw new Error(`Malformed JSON in artifacts block: ${err.message}`);
    }
    if (!payload || typeof payload !== "object" || !Array.isArray(payload.artifacts)) {
        throw new Error("Invalid response: root object must contain 'artifacts' array");
    }
    const parsedArtifacts = [];
    const allowedTypes = ["code", "patch", "test", "documentation", "log", "diagnostic"];
    for (let i = 0; i < payload.artifacts.length; i++) {
        const art = payload.artifacts[i];
        if (!art || typeof art !== "object") {
            throw new Error(`Artifact at index ${i} is not an object`);
        }
        if (typeof art.id !== "string" || !art.id) {
            throw new Error(`Artifact at index ${i} is missing 'id'`);
        }
        if (typeof art.type !== "string" || !allowedTypes.includes(art.type)) {
            throw new Error(`Artifact at index ${i} has invalid or missing 'type': ${art.type}`);
        }
        if (typeof art.content !== "string") {
            throw new Error(`Artifact at index ${i} has invalid or missing 'content'`);
        }
        if (art.path !== undefined && typeof art.path !== "string") {
            throw new Error(`Artifact at index ${i} has invalid 'path'`);
        }
        parsedArtifacts.push({
            id: art.id,
            taskId,
            type: art.type,
            path: art.path,
            content: art.content,
            provider: providerId,
            createdAt: new Date().toISOString(),
            version: art.version || "1.0.0",
            checksum: art.checksum || "",
            hash: art.hash || ""
        });
    }
    return parsedArtifacts;
}
