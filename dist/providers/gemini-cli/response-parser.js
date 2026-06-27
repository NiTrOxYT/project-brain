import { parseSharedResponse } from "../shared-parser.js";
export function parseResponse(stdout, taskId, providerId) {
    return parseSharedResponse(stdout, taskId, providerId);
}
