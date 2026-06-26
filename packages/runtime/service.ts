import { WorkspaceService } from "../workspace";
import { ManifestService } from "../manifest";
import { ProjectService } from "../project";
import { IndexerService } from "../indexer";
import { SymbolsService } from "../symbols";
import { ImportsService } from "../imports";
import { GraphBuilderService } from "../graph-builder";
import { KnowledgeService } from "../knowledge";
import { GraphService } from "../graph";
import { CacheService } from "../cache";

import { RuntimeContext } from "./types";

export class RuntimeService {

    constructor(
        private readonly context: RuntimeContext
    ) {}

    async initialize(): Promise<void> {

        const workspace = new WorkspaceService({
            root: this.context.root
        });

        const result = await workspace.initialize();

        const workspaceRoot = result.root;

        await new ManifestService(
            workspaceRoot
        ).load();

        await new ProjectService(
            this.context.root,
            workspaceRoot
        ).detect();

        await new IndexerService(
            this.context.root,
            workspaceRoot
        ).index();

        await new SymbolsService(
            this.context.root,
            workspaceRoot
        ).index();

        await new ImportsService(
            this.context.root,
            workspaceRoot
        ).index();
        
        await new GraphBuilderService(
            workspaceRoot
        ).build();
        
        const { SemanticService } =
            await import("../semantic");
        
        await new SemanticService(
            workspaceRoot
        ).build();

        await new KnowledgeService(
            workspaceRoot
        ).initialize();

        await new GraphService(
            workspaceRoot
        ).initialize();

        await new CacheService(
            workspaceRoot
        ).initialize();

    }

}
