import path from "path";
import { GraphBuilderService } from "../graph-builder";

import { FileSystemService } from "../filesystem";
import { ProjectSnapshot } from "./types";

export class ScannerService {

    private readonly fs =
        new FileSystemService();

    constructor(
        private readonly workspaceRoot: string
    ) {}

    async snapshot(): Promise<ProjectSnapshot> {

        const graph =
            await new GraphBuilderService(
                this.workspaceRoot
            ).build();
    
        const [
    
            project,
    
            files,
    
            symbols,
    
            imports
    
        ] = await Promise.all([
    
            this.fs.readJson(
                path.join(
                    this.workspaceRoot,
                    "knowledge",
                    "project.json"
                )
            ),
    
            this.fs.readJson<{ files: any[] }>(
                path.join(
                    this.workspaceRoot,
                    "index",
                    "index.json"
                )
            ),
    
            this.fs.readJson<{ symbols: any[] }>(
                path.join(
                    this.workspaceRoot,
                    "index",
                    "symbols.json"
                )
            ),
    
            this.fs.readJson<{ imports: any[] }>(
                path.join(
                    this.workspaceRoot,
                    "index",
                    "imports.json"
                )
            )
    
        ]);
    
        return {
    
            project,
    
            files: files.files,
    
            symbols: symbols.symbols,
    
            imports: imports.imports,
    
            graph
    
        };
    
    }

}
