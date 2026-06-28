import { validateManifest } from "./provider-manifest.js";
export class ProviderSchemaRegistry {
    static schemas = new Map();
    static register(schema) {
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
    static get(providerId) {
        return this.schemas.get(providerId);
    }
    static list() {
        return Array.from(this.schemas.values());
    }
    static clear() {
        this.schemas.clear();
    }
}
