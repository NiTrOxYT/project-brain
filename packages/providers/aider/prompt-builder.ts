import { RuntimeRequest } from "../../agent-runtime/types.js";
import { buildSharedPrompt } from "../shared-prompt.js";

export function buildPrompt(request: RuntimeRequest): string {
    return buildSharedPrompt(request, "Aider");
}
