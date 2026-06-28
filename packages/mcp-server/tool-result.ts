// ──────────────────────────────────────────────────────────────────────────────
// BUILD-071 — MCP Server — Tool Result Builder
// Compatibility layer for standards-compliant CallToolResult responses
// ──────────────────────────────────────────────────────────────────────────────

export interface CallToolContent {
    type: "text" | "image" | "resource";
    text: string;
}

export interface CallToolResult {
    content: CallToolContent[];
    isError?: boolean;
}

/**
 * Return simple plain text result
 */
export function textResult(text: string): CallToolResult {
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
export function jsonResult(data: unknown): CallToolResult {
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
export function errorResult(message: string): CallToolResult {
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
export function mixedResult(summary: string, data: unknown): CallToolResult {
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
