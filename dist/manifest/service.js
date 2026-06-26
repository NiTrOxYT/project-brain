import path from "path";
import { FileSystemService } from "../filesystem";
import { ManifestError } from "./errors";
export class ManifestService {
    workspace;
    fs = new FileSystemService();
    constructor(workspace) {
        this.workspace = workspace;
    }
    get manifestPath() {
        return path.join(this.workspace, "manifest.json");
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
