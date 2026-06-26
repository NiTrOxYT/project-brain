import { parseSharedResponse } from "../shared-parser";
export function parseResponse(stdout, taskId, providerId) {
    return parseSharedResponse(stdout, taskId, providerId);
}
