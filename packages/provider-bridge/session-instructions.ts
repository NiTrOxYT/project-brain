export class ProviderSessionInitializer {
    static getContextPolicy(): string {
        return [
            "Project Brain Context Consumption Policy:",
            "1. Use brain.get_context before any repository-wide search whenever project understanding is required.",
            "2. Use brain.find_symbol before recursive grep or repository symbol searches.",
            "3. Use brain.find_dependencies before manually traversing imports.",
            "4. Use brain.search_memory before semantic repository searches.",
            "5. Perform repository-wide traversal only when Brain reports low confidence, required files/symbols cannot be resolved, snapshot stale/unavailable, or the user explicitly requests complete repository search."
        ].join("\n");
    }

    static initializeSession(providerId: string): { success: boolean; instructions?: string } {
        // Only return instructions if provider supports official startup system prompt/project config instructions
        if (providerId === "claude" || providerId === "opencode") {
            return {
                success: true,
                instructions: this.getContextPolicy()
            };
        }
        return { success: false };
    }
}
