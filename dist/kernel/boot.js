import path from "path";
import { CACHE_DIRECTORY, GRAPH_DIRECTORY, MEMORY_DIRECTORY, PROJECT_BRAIN_DIRECTORY_NAME, TASK_DIRECTORY } from "./constants";
export class BrainKernel {
    static boot(cwd) {
        const brain = path.join(cwd, PROJECT_BRAIN_DIRECTORY_NAME);
        return {
            cwd,
            initialized: false,
            paths: {
                root: cwd,
                brain,
                memory: path.join(brain, MEMORY_DIRECTORY),
                graph: path.join(brain, GRAPH_DIRECTORY),
                cache: path.join(brain, CACHE_DIRECTORY),
                tasks: path.join(brain, TASK_DIRECTORY)
            }
        };
    }
}
