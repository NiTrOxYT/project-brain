import os from "os";
import fs from "fs";
import { execSync } from "child_process";
import type { GatewaySession } from "../domain/index.js";
import type { ProviderIntegration, RuntimeEnvironment, IntegrationDescriptor, IntegrationTransport } from "./integration.js";
import { IntegrationRegistry } from "./registry.js";

export interface NegotiationResult {
    descriptorId:       string;
    selectedTransport:  IntegrationTransport;
    runtimeFingerprint: string;
    expiresAt:          number;
}

export interface IntegrationManager {
    connect(
        providerId: string,
        session: GatewaySession
    ): Promise<ProviderIntegration>;
    disconnect(
        providerId: string
    ): Promise<void>;
}

export class DefaultIntegrationManager implements IntegrationManager {
    private static cache: Map<string, NegotiationResult> = new Map();
    private activeIntegrations: Map<string, ProviderIntegration> = new Map();

    async connect(
        providerId: string,
        session: GatewaySession
    ): Promise<ProviderIntegration> {
        const env = await this.buildEnvironment(providerId);
        const fingerprint = this.computeFingerprint(env);

        const cacheKey = `${providerId}:${fingerprint}`;
        const cached = DefaultIntegrationManager.cache.get(cacheKey);

        let descriptor: IntegrationDescriptor | undefined;

        if (cached && cached.expiresAt > Date.now()) {
            descriptor = IntegrationRegistry.list().find(d => d.id === cached.descriptorId);
        }

        if (!descriptor) {
            // Run full negotiation via Negotiator
            const { IntegrationNegotiator } = await import("./negotiator.js");
            descriptor = await IntegrationNegotiator.negotiate(providerId, env);

            if (descriptor) {
                // Update cache
                DefaultIntegrationManager.cache.set(cacheKey, {
                    descriptorId:       descriptor.id,
                    selectedTransport:  descriptor.transport,
                    runtimeFingerprint: fingerprint,
                    expiresAt:          Date.now() + 60000 // Cache for 1 min
                });
            }
        }

        if (!descriptor) {
            throw new Error(`No supported integration found for provider: ${providerId}`);
        }

        const integration = await descriptor.create();
        await integration.connect(session);
        this.activeIntegrations.set(providerId, integration);

        return integration;
    }

    async disconnect(providerId: string): Promise<void> {
        const integration = this.activeIntegrations.get(providerId);
        if (integration) {
            await integration.disconnect();
            this.activeIntegrations.delete(providerId);
        }
    }

    private async buildEnvironment(providerId: string): Promise<RuntimeEnvironment> {
        const operatingSystem = process.platform === "darwin" ? "macos" :
                                process.platform === "win32" ? "windows" : "linux";

        const features = new Set<string>();

        if (process.stdout.isTTY) {
            features.add("tty");
            features.add("terminal");
        }

        // Detect git
        try {
            execSync("git --version", { stdio: "ignore" });
            features.add("git");
        } catch {}

        // Detect docker
        try {
            execSync("docker --version", { stdio: "ignore" });
            features.add("docker");
        } catch {}

        return {
            operatingSystem,
            features,
            providerVersion: "1.0.0" // Default version mock
        };
    }

    private computeFingerprint(env: RuntimeEnvironment): string {
        const sortedFeatures = Array.from(env.features).sort().join(",");
        return `${env.operatingSystem}:${sortedFeatures}:${env.providerVersion || "unknown"}`;
    }

    static invalidateCache(): void {
        this.cache.clear();
    }
}
