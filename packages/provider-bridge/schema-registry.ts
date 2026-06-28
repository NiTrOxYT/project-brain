import type { ProviderManifest } from "./provider-manifest.js";
import { validateManifest } from "./provider-manifest.js";

export interface ProviderSchema {
    readonly providerId: string;
    readonly manifest: ProviderManifest;
    validate(content: string, isGlobal: boolean): string | null;
    buildMcpConfiguration(opts: { transport: "stdio" | "http"; port?: number }): string | Record<string, any>;
    migrateConfiguration(oldConfiguration: string, installedVersion: string): { success: boolean; newConfiguration: string; error?: string };
}

export class ProviderSchemaRegistry {
    private static schemas: Map<string, ProviderSchema> = new Map();

    static register(schema: ProviderSchema): void {
        if (!schema || !schema.manifest) {
            throw new Error("Cannot register schema: schema must declare a manifest.");
        }
        
        // 1. Validate manifest contents
        const manifestErr = validateManifest(schema.manifest);
        if (manifestErr) {
            throw new Error(`Manifest validation failed for provider "${schema.providerId}": ${manifestErr}`);
        }

        // 2. Duplicate registration protection
        if (this.schemas.has(schema.providerId)) {
            throw new Error(`Duplicate schema registration: A schema for provider "${schema.providerId}" is already registered.`);
        }

        this.schemas.set(schema.providerId, schema);
    }

    static get(providerId: string): ProviderSchema | undefined {
        return this.schemas.get(providerId);
    }

    static list(): ProviderSchema[] {
        return Array.from(this.schemas.values());
    }

    static clear(): void {
        this.schemas.clear();
    }
}
