// ──────────────────────────────────────────────────────────────────────────────
// BUILD-069 — Pluggable Strategy-Driven Transactional Provider Configurator
// ──────────────────────────────────────────────────────────────────────────────
import fs from "fs";
import path from "path";
import { ProviderSchemaRegistry } from "./schema-registry.js";
import { ProviderDiscoveryEngine } from "./discovery.js";
import { ProviderStrategyRegistry } from "./provider-strategy-registry.js";
import { ProviderProfileRegistry } from "./provider-profile.js";
import { getActiveConfigPathFromManifest } from "./provider-manifest.js";
import { ProviderLockRegistry } from "./provider-lock.js";
import { ProviderStateRegistry } from "./provider-state.js";
import { ProviderEventLogger } from "./provider-events.js";
import { ProviderCompatibilityRegistry } from "./provider-compatibility.js";
import "./provider-integration.js";
export class ProviderConfigurator {
    // Keep track of active backups for multi-provider transactional sessions
    static activeBackups = new Map();
    static getConfigPath(providerId) {
        try {
            return this.getActiveConfigPath(providerId).path;
        }
        catch {
            return "";
        }
    }
    static getActiveConfigPath(providerId, workspaceRoot) {
        const schema = ProviderSchemaRegistry.get(providerId);
        if (!schema) {
            throw new Error(`Provider "${providerId}" has no registered schema.`);
        }
        return getActiveConfigPathFromManifest(schema.manifest, workspaceRoot);
    }
    static isConfigured(providerId, workspaceRoot) {
        const schema = ProviderSchemaRegistry.get(providerId);
        if (!schema)
            return false;
        try {
            const { path: activePath } = this.getActiveConfigPath(providerId, workspaceRoot);
            if (!fs.existsSync(activePath))
                return false;
            const content = fs.readFileSync(activePath, "utf-8");
            const schemaType = schema.manifest.configurationSchema;
            if (schemaType === "aider") {
                if (content.includes(".brain/instructions.txt"))
                    return true;
            }
            else if (schemaType === "codex") {
                if (content.includes("[mcp_servers.brain]"))
                    return true;
            }
            else if (schemaType === "continue") {
                if (content.includes("name: brain") || content.includes('"name": "brain"'))
                    return true;
            }
            else {
                const parsed = JSON.parse(content);
                const rootKey = schemaType === "opencode" ? "mcp" : "mcpServers";
                const rootObj = parsed[rootKey];
                if (rootObj && typeof rootObj === "object" && rootObj.brain) {
                    return true;
                }
            }
        }
        catch {
            // Ignore parsing errors
        }
        return false;
    }
    static async configure(providerId, opts, workspaceRoot) {
        const schema = ProviderSchemaRegistry.get(providerId);
        if (!schema) {
            return { success: false, error: `Provider "${providerId}" has no registered schema.` };
        }
        const config = ProviderDiscoveryEngine.discover(providerId, workspaceRoot);
        const manifest = schema.manifest;
        // 1. Compatibility Check - Block configuration if below minimum version
        const compatRes = ProviderCompatibilityRegistry.validateCompatibility(manifest.compatibility, config.version);
        if (!compatRes.supported) {
            const recommendation = ProviderCompatibilityRegistry.getRecommendation(manifest.compatibility, config.version);
            return {
                success: false,
                error: `Installation blocked: ${compatRes.error} Recommended Action: ${recommendation}`
            };
        }
        const { path: configPath } = this.getActiveConfigPath(providerId, workspaceRoot);
        try {
            // Ensure parent directory exists
            const dir = path.dirname(configPath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            let originalContent = "";
            let fileExists = fs.existsSync(configPath);
            if (fileExists) {
                originalContent = fs.readFileSync(configPath, "utf-8");
            }
            // Create transactional backup copy
            const timestamp = Date.now();
            const backupPath = configPath + `.backup-${timestamp}`;
            if (fileExists) {
                fs.copyFileSync(configPath, backupPath);
                const list = this.activeBackups.get(providerId) || [];
                list.push({ targetPath: configPath, backupPath });
                this.activeBackups.set(providerId, list);
                console.log(`DEBUG BACKUP ADD: providerId=${providerId}, listSize=${list.length}, backupPath=${backupPath}`);
            }
            // 2. Perform Migration
            const migration = schema.migrateConfiguration(originalContent, config.version);
            if (!migration.success) {
                ProviderEventLogger.logEvent(providerId, "audit failed", { reason: `Migration failed: ${migration.error}` }, workspaceRoot);
                this.rollback(providerId, workspaceRoot);
                return { success: false, error: `Migration failed: ${migration.error}` };
            }
            if (migration.newConfiguration !== originalContent) {
                ProviderEventLogger.logEvent(providerId, "migrated", { from: config.version }, workspaceRoot);
                originalContent = migration.newConfiguration;
                // Temporarily write migrated content for strategy to load/use
                fs.writeFileSync(configPath, originalContent, "utf-8");
            }
            // 3. Resolve Decoupled Strategy and Execute Install
            const selectedMode = config.selectedIntegrationMode;
            if (selectedMode === "none") {
                return { success: false, error: `No supported integration strategy resolved for provider ${providerId}.` };
            }
            const strategy = ProviderStrategyRegistry.resolve(selectedMode);
            const profile = ProviderProfileRegistry.generateProfile(providerId, workspaceRoot);
            const context = {
                manifest,
                profile,
                configuration: config,
                activeConfigPath: configPath,
                workspaceRoot,
                options: opts
            };
            const strategyRes = await strategy.install(context);
            if (!strategyRes.success) {
                this.rollback(providerId, workspaceRoot);
                return { success: false, error: strategyRes.error };
            }
            // 4. Validate output schema
            const finalContent = fs.readFileSync(configPath, "utf-8");
            const schemaErr = schema.validate(finalContent, configPath.includes("global"));
            if (schemaErr) {
                this.rollback(providerId, workspaceRoot);
                return { success: false, error: `Schema validation failed after install: ${schemaErr}` };
            }
            // Write lock entry
            const checksum = ProviderLockRegistry.calculateChecksum(configPath);
            ProviderLockRegistry.save({
                providerId,
                executablePath: config.executable,
                detectedVersion: config.version,
                selectedTransport: opts.transport,
                configurationFile: configPath,
                schemaVersion: manifest.compatibility.supportedSchemaVersions[0] || "1.0.0",
                configurationChecksum: checksum,
                selectedIntegrationMode: selectedMode
            }, workspaceRoot);
            ProviderEventLogger.logEvent(providerId, "configured", { transport: opts.transport, mode: selectedMode }, workspaceRoot);
            // Record initial verification state
            ProviderStateRegistry.save({
                providerId,
                installationVerified: true,
                configurationVerified: true,
                connectivityVerified: false,
                toolVerificationPassed: false,
                behaviorVerificationPassed: false,
                verificationTimestamp: new Date().toISOString()
            }, workspaceRoot);
            return { success: true };
        }
        catch (err) {
            console.error("DEBUG STACK:", err.stack);
            this.rollback(providerId, workspaceRoot);
            return { success: false, error: err.message ?? "Failed to write configuration file." };
        }
    }
    static async unconfigure(providerId, workspaceRoot) {
        const schema = ProviderSchemaRegistry.get(providerId);
        if (!schema)
            return { success: true };
        const config = ProviderDiscoveryEngine.discover(providerId, workspaceRoot);
        const { path: configPath } = this.getActiveConfigPath(providerId, workspaceRoot);
        if (!configPath || !fs.existsSync(configPath))
            return { success: true };
        try {
            const selectedMode = config.selectedIntegrationMode;
            if (selectedMode !== "none") {
                const strategy = ProviderStrategyRegistry.resolve(selectedMode);
                const profile = ProviderProfileRegistry.generateProfile(providerId, workspaceRoot);
                const context = {
                    manifest: schema.manifest,
                    profile,
                    configuration: config,
                    activeConfigPath: configPath,
                    workspaceRoot
                };
                await strategy.uninstall(context);
            }
            ProviderLockRegistry.remove(providerId, workspaceRoot);
            ProviderStateRegistry.invalidate(providerId, workspaceRoot);
            ProviderEventLogger.logEvent(providerId, "configuration restored", {}, workspaceRoot);
            return { success: true };
        }
        catch (err) {
            return { success: false, error: err.message };
        }
    }
    static rollback(providerId, workspaceRoot) {
        const list = this.activeBackups.get(providerId);
        console.log(`DEBUG BACKUP ROLLBACK: providerId=${providerId}, hasList=${!!list}, size=${list?.length}`);
        if (!list)
            return;
        for (const record of list) {
            try {
                if (fs.existsSync(record.backupPath)) {
                    fs.copyFileSync(record.backupPath, record.targetPath);
                    fs.unlinkSync(record.backupPath);
                }
            }
            catch { }
        }
        this.activeBackups.delete(providerId);
        ProviderEventLogger.logEvent(providerId, "configuration restored", { rollback: true }, workspaceRoot);
    }
    static commit(providerId) {
        const list = this.activeBackups.get(providerId);
        if (!list)
            return;
        for (const record of list) {
            try {
                if (fs.existsSync(record.backupPath)) {
                    fs.unlinkSync(record.backupPath);
                }
            }
            catch { }
        }
        this.activeBackups.delete(providerId);
    }
}
