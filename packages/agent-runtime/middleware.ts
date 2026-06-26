import { RuntimeRequest, RuntimeResponse } from "./types";
import { RuntimeArtifact } from "./artifacts";

export interface RuntimeMiddleware {
    name?: string;
    beforeExecute?(request: RuntimeRequest): Promise<void>;
    afterExecute?(request: RuntimeRequest, response: RuntimeResponse): Promise<void>;
    beforeRetry?(request: RuntimeRequest, attempt: number): Promise<void>;
    afterRetry?(request: RuntimeRequest, response: RuntimeResponse, attempt: number): Promise<void>;
    beforeArtifact?(request: RuntimeRequest, artifact: RuntimeArtifact): Promise<void>;
    afterArtifact?(request: RuntimeRequest, artifact: RuntimeArtifact): Promise<void>;
    beforeComplete?(request: RuntimeRequest, response: RuntimeResponse): Promise<void>;
}
