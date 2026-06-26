import path from "path";
import { RuntimeService } from "../core";

import { FileSystemService } from "../filesystem";
import { Manifest } from "./types";
import { ManifestError } from "./errors";

export class ManifestService extends RuntimeService {

    private readonly fs = new FileSystemService();

    constructor(
        private readonly workspace: string
    ) {
        super();
    }

    private get manifestPath(): string {
        return path.join(
            this.workspace,
            "manifest.json"
        );
    }

    async initialize(): Promise<unknown> {
        return;
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
