// ──────────────────────────────────────────────────────────────────────────────
// BUILD-061B — Kernel — KernelContext & Registry Injection
// Owner of configuration, lifecycle, registry, telemetry, and event bus.
// Services receive this context in constructors via dependency injection.
// ──────────────────────────────────────────────────────────────────────────────
import { EventBus } from "./event-bus.js";
import { PluginManager } from "./plugin-manager.js";
import { ConfigurationService } from "./config.js";
import { TelemetryService } from "./telemetry.js";
import { LifecycleManager } from "./lifecycle.js";
import { globalProviderRegistry, globalEstimatorRegistry, globalSearchRegistry, } from "./registry.js";
import { StoragePaths, GlobalPaths } from "./paths.js";
/**
 * Factory to construct a new KernelContext instance for dependency injection.
 */
export function createKernelContext(projectRoot, workspaceRoot) {
    return {
        projectRoot,
        workspaceRoot,
        eventBus: new EventBus(),
        plugins: new PluginManager(),
        config: new ConfigurationService(),
        telemetry: new TelemetryService(),
        lifecycle: new LifecycleManager(),
        paths: new StoragePaths(workspaceRoot),
        globalPaths: new GlobalPaths(), // Uses default user home path fallback
        registries: {
            providers: globalProviderRegistry,
            estimators: globalEstimatorRegistry,
            search: globalSearchRegistry,
        },
    };
}
