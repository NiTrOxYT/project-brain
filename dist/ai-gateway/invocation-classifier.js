// ──────────────────────────────────────────────────────────────────────────────
// BUILD-061E — AI Gateway — Invocation Classifier
// Classifies provider invocations as gateway (intercepted) vs passthrough.
// ──────────────────────────────────────────────────────────────────────────────
export var InvocationMode;
(function (InvocationMode) {
    InvocationMode["Gateway"] = "Gateway";
    InvocationMode["Passthrough"] = "Passthrough";
    InvocationMode["Unknown"] = "Unknown";
})(InvocationMode || (InvocationMode = {}));
/**
 * Standard classification logic for checking commands.
 */
export function classifyProviderInvocation(argv, passthroughList, gatewayList) {
    // 1. If empty arguments, it represents an interactive prompt. Default to Gateway.
    if (argv.length === 0) {
        return {
            mode: InvocationMode.Gateway,
            reason: "Interactive session started with no arguments",
        };
    }
    // 2. Check if any argument is explicitly flagged as gateway.
    for (const arg of argv) {
        if (gatewayList.includes(arg)) {
            return {
                mode: InvocationMode.Gateway,
                reason: `Matches gateway command: ${arg}`,
            };
        }
    }
    // 3. Check if any argument is administrative/passthrough.
    for (const arg of argv) {
        if (passthroughList.includes(arg)) {
            return {
                mode: InvocationMode.Passthrough,
                reason: `Matches passthrough command: ${arg}`,
            };
        }
    }
    // 4. Check if the arguments contain strings with letters (e.g. prompt string).
    // If it looks like a prompt (has space or contains no dashes and is not in list), default to Gateway.
    // However, if it's completely unrecognized, we default to Unknown -> Passthrough to prevent breaking future commands.
    const firstArg = argv[0];
    if (firstArg && !firstArg.startsWith("-")) {
        // Looks like a prompt if it has a space or is a multi-word string
        if (firstArg.includes(" ") || argv.length > 1) {
            return {
                mode: InvocationMode.Gateway,
                reason: "Arguments contain multi-word prompt pattern",
            };
        }
        // Single word prompt? Could be "explain", "refactor". Check if it's not a common flag
        // To be safe, if it's not a common flag and is a custom action word, let's treat as Gateway.
        // Wait, the specification says:
        // "Default to Passthrough. Never accidentally intercept future provider commands."
        // So, if we can't be sure, we return Unknown.
        return {
            mode: InvocationMode.Unknown,
            reason: "Unrecognized command arguments",
        };
    }
    // Standard flags like --model, -p, etc. without administrative commands: default to Gateway if they are prompt flags,
    // but default to Unknown if completely unrecognized.
    return {
        mode: InvocationMode.Unknown,
        reason: "Default unrecognized flags/options",
    };
}
