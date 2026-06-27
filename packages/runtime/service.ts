import { WorkspaceService } from "../workspace/index.js";
import { ManifestService } from "../manifest/index.js";
import { ProjectService } from "../project/index.js";
import { IndexerService } from "../indexer/index.js";
import { SymbolsService } from "../symbols/index.js";
import { ImportsService } from "../imports/index.js";
import { GraphBuilderService } from "../graph-builder/index.js";
import { KnowledgeService } from "../knowledge/index.js";
import { GraphService } from "../graph/index.js";
import { CacheService } from "../cache/index.js";

import { RuntimeContext } from "./types.js";

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

        const { ImportResolverService } =
            await import("../import-resolver/index.js");

        await new ImportResolverService(
            workspaceRoot
        ).resolve();

        const { RelationshipAnalyzerService } =
            await import("../relationship-analyzer/index.js");

        await new RelationshipAnalyzerService(
            this.context.root,
            workspaceRoot
        ).analyze();

        const { ExecutionGraphService } =
            await import("../execution-graph/index.js");

        await new ExecutionGraphService(
            workspaceRoot
        ).build();
        
        await new GraphBuilderService(
            workspaceRoot
        ).build();
        
        const { SemanticService } =
            await import("../semantic/index.js");
        
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
