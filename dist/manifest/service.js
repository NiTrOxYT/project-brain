import path from "path";
import { RuntimeService } from "../core/index.js";
import { FileSystemService } from "../filesystem/index.js";
import { ManifestError } from "./errors.js";
export class ManifestService extends RuntimeService {
    workspace;
    fs = new FileSystemService();
    constructor(workspace) {
        super();
        this.workspace = workspace;
    }
    get manifestPath() {
        return path.join(this.workspace, "manifest.json");
    }
    async initialize() {
        return;
    }
    async exists() {
        return this.fs.exists(this.manifestPath);
    }
    async load() {
        if (!(await this.exists())) {
            throw new ManifestError("Manifest not found.");
        }
        return this.fs.readJson(this.manifestPath);
    }
}
