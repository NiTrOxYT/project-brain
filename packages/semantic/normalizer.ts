const STOP_WORDS = new Set([
    "impl",
    "implementation"
]);

export function normalize(text: string): string[] {

    let normalized = text.trim();

    // Remove interface prefix only if followed by UpperCase.
    // IWorkspaceService -> WorkspaceService
    // ImportsService -> ImportsService (unchanged)
    normalized = normalized.replace(
        /^I(?=[A-Z][a-z])/,
        ""
    );

    // JWTAuthentication -> JWT Authentication
    normalized = normalized.replace(
        /([A-Z]+)([A-Z][a-z])/g,
        "$1 $2"
    );

    // GraphBuilder -> Graph Builder
    normalized = normalized.replace(
        /([a-z0-9])([A-Z])/g,
        "$1 $2"
    );

    // snake_case
    normalized = normalized.replace(
        /_/g,
        " "
    );

    // kebab-case
    normalized = normalized.replace(
        /-/g,
        " "
    );

    const terms = normalized
        .toLowerCase()
        .split(/\s+/)
        .filter(Boolean);

    return [...new Set(terms.filter(term => !STOP_WORDS.has(term)))];

}