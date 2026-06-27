import { PromptProviderProfile } from "./types.js";

export const PROVIDER_PROFILES: Record<string, PromptProviderProfile> = {
    "claude-code": {
        providerId: "claude-code",
        contextWindow: 200000,
        streamingSupport: true,
        reasoningSupport: true,
        preferredFormat: "string",
        jsonCapability: true,
        patchCapability: true,
        toolSupport: true,
        codeGenerationQuality: 10,
        documentationQuality: 9,
        planningQuality: 10,
        temperatureRestrictions: { min: 0.0, max: 1.0, default: 0.0 }
    },
    "codex": {
        providerId: "codex",
        contextWindow: 128000,
        streamingSupport: true,
        reasoningSupport: false,
        preferredFormat: "json",
        jsonCapability: true,
        patchCapability: true,
        toolSupport: true,
        codeGenerationQuality: 9,
        documentationQuality: 8,
        planningQuality: 8,
        temperatureRestrictions: { min: 0.0, max: 2.0, default: 0.2 }
    },
    "gemini-cli": {
        providerId: "gemini-cli",
        contextWindow: 1000000,
        streamingSupport: true,
        reasoningSupport: true,
        preferredFormat: "string",
        jsonCapability: true,
        patchCapability: true,
        toolSupport: true,
        codeGenerationQuality: 9,
        documentationQuality: 10,
        planningQuality: 9,
        temperatureRestrictions: { min: 0.0, max: 1.0, default: 0.0 }
    },
    "ollama": {
        providerId: "ollama",
        contextWindow: 32000,
        streamingSupport: true,
        reasoningSupport: false,
        preferredFormat: "string",
        jsonCapability: true,
        patchCapability: false,
        toolSupport: false,
        codeGenerationQuality: 7,
        documentationQuality: 7,
        planningQuality: 6,
        temperatureRestrictions: { min: 0.0, max: 1.5, default: 0.7 }
    },
    "aider": {
        providerId: "aider",
        contextWindow: 100000,
        streamingSupport: false,
        reasoningSupport: false,
        preferredFormat: "string",
        jsonCapability: false,
        patchCapability: true,
        toolSupport: true,
        codeGenerationQuality: 8,
        documentationQuality: 8,
        planningQuality: 7,
        temperatureRestrictions: { min: 0.0, max: 1.0, default: 0.0 }
    },
    "opencode": {
        providerId: "opencode",
        contextWindow: 32000,
        streamingSupport: true,
        reasoningSupport: false,
        preferredFormat: "string",
        jsonCapability: true,
        patchCapability: true,
        toolSupport: false,
        codeGenerationQuality: 8,
        documentationQuality: 7,
        planningQuality: 7,
        temperatureRestrictions: { min: 0.0, max: 1.0, default: 0.2 }
    }
};

export function getProviderProfile(providerId: string): PromptProviderProfile {
    const profile = PROVIDER_PROFILES[providerId] || PROVIDER_PROFILES["claude-code"];
    return { ...profile, providerId }; // Ensure correct providerId is returned
}
