// ──────────────────────────────────────────────────────────────────────────────
// BUILD-061B — Kernel — KernelContext & Registry Injection
// Owner of configuration, lifecycle, registry, telemetry, and event bus.
// Services receive this context in constructors via dependency injection.
// ──────────────────────────────────────────────────────────────────────────────

import { EventBus }             from "./event-bus.js";
import { PluginManager }         from "./plugin-manager.js";
import { ConfigurationService }  from "./config.js";
import { TelemetryService }      from "./telemetry.js";
import { LifecycleManager }      from "./lifecycle.js";
import {
    ServiceRegistry,
    globalProviderRegistry,
    globalEstimatorRegistry,
    globalSearchRegistry,
} from "./registry.js";
import { StoragePaths, GlobalPaths } from "./paths.js";

export interface RegistriesContainer {
    readonly providers:  ServiceRegistry<any>;
    readonly estimators: ServiceRegistry<any>;
    readonly search:     ServiceRegistry<any>;
}

export interface KernelContext {
    readonly workspaceRoot: string;
    readonly projectRoot:   string;
    readonly eventBus:      EventBus;
    readonly plugins:       PluginManager;
    readonly config:        ConfigurationService;
    readonly telemetry:     TelemetryService;
    readonly lifecycle:     LifecycleManager;
    readonly paths:         StoragePaths;
    readonly globalPaths:   GlobalPaths;
    readonly registries:    RegistriesContainer;
}

/**
 * Factory to construct a new KernelContext instance for dependency injection.
 */
export function createKernelContext(
    projectRoot:   string,
    workspaceRoot: string
): KernelContext {
    return {
        projectRoot,
        workspaceRoot,
        eventBus:      new EventBus(),
        plugins:       new PluginManager(),
        config:        new ConfigurationService(),
        telemetry:     new TelemetryService(),
        lifecycle:     new LifecycleManager(),
        paths:         new StoragePaths(workspaceRoot),
        globalPaths:   new GlobalPaths(), // Uses default user home path fallback
        registries: {
            providers:  globalProviderRegistry,
            estimators: globalEstimatorRegistry,
            search:     globalSearchRegistry,
        },
    };
}
