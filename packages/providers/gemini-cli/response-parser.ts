import { RuntimeArtifact } from "../../agent-runtime/artifacts";
import { parseSharedResponse } from "../shared-parser";

export function parseResponse(stdout: string, taskId: string, providerId: string): RuntimeArtifact[] {
    return parseSharedResponse(stdout, taskId, providerId);
}
