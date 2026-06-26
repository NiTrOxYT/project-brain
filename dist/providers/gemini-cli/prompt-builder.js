import { buildSharedPrompt } from "../shared-prompt";
export function buildPrompt(request) {
    return buildSharedPrompt(request, "Gemini CLI");
}
