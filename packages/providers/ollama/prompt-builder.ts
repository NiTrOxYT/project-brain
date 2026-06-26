import { RuntimeRequest } from "../../agent-runtime/types";
import { buildSharedPrompt } from "../shared-prompt";

export function buildPrompt(request: RuntimeRequest): string {
    return buildSharedPrompt(request, "Ollama");
}
