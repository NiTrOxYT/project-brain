import { RuntimeArtifact } from "../../agent-runtime/artifacts.js";
import { parseSharedResponse } from "../shared-parser.js";

export function parseResponse(stdout: string, taskId: string, providerId: string): RuntimeArtifact[] {
    return parseSharedResponse(stdout, taskId, providerId);
}
