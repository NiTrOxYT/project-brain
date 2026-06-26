import path from "path";

import { FileSystemService } from "../filesystem";
import { Manifest } from "./types";
import { ManifestError } from "./errors";

export class ManifestService {

    private readonly fs = new FileSystemService();

    constructor(
        private readonly workspace: string
    ) {}

    private get manifestPath(): string {
        return path.join(
            this.workspace,
            "manifest.json"
        );
    }

    async exists(): Promise<boolean> {
        return this.fs.exists(
            this.manifestPath
        );
    }

    async load(): Promise<Manifest> {

        if (!(await this.exists())) {

            throw new ManifestError(
                "Manifest not found."
            );

        }

        return this.fs.readJson<Manifest>(
            this.manifestPath
        );

    }

}
