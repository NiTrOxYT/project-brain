import { buildSharedPrompt } from "../shared-prompt.js";
export function buildPrompt(request) {
    return buildSharedPrompt(request, "Ollama");
}
