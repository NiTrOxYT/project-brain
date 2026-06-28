// ──────────────────────────────────────────────────────────────────────────────
// BUILD-071 — MCP Server — Tool Result Builder
// Compatibility layer for standards-compliant CallToolResult responses
// ──────────────────────────────────────────────────────────────────────────────
/**
 * Return simple plain text result
 */
export function textResult(text) {
    return {
        content: [
            {
                type: "text",
                text
            }
        ]
    };
}
/**
 * Return standard JSON result wrapped in text block
 */
export function jsonResult(data) {
    return {
        content: [
            {
                type: "text",
                text: JSON.stringify(data, null, 2)
            }
        ]
    };
}
/**
 * Return error result matching standard specification
 */
export function errorResult(message) {
    return {
        isError: true,
        content: [
            {
                type: "text",
                text: message
            }
        ]
    };
}
/**
 * Return mixed result (natural language summary + detailed structured JSON data)
 */
export function mixedResult(summary, data) {
    return {
        content: [
            {
                type: "text",
                text: summary
            },
            {
                type: "text",
                text: JSON.stringify(data, null, 2)
            }
        ]
    };
}
