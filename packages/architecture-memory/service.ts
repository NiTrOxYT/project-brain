import fs from "fs/promises";
import path from "path";

import { FileSystemService } from "../filesystem";
import { normalize } from "../semantic";
import { ArchitectureMemory, ArchitectureEntry, MemoryMetadata, ArchitectureSource } from "./types";
import { ArchitectureMemoryError } from "./errors";

export interface MemoryStorage {
    loadMemory(collectionName: string): Promise<ArchitectureMemory>;
    saveMemory(collectionName: string, memory: ArchitectureMemory): Promise<void>;
    loadMetadata(): Promise<MemoryMetadata | null>;
    saveMetadata(metadata: MemoryMetadata): Promise<void>;
    existsMemory(collectionName: string): Promise<boolean>;
    existsMetadata(): Promise<boolean>;
    ensureDirectory(): Promise<void>;
}

export class FileSystemMemoryStorage implements MemoryStorage {
    private readonly filesystem = new FileSystemService();

    constructor(private readonly memoryDir: string) {}

    private getMemoryPath(collectionName: string): string {
        return path.join(this.memoryDir, `${collectionName}.json`);
    }

    private getMetadataPath(): string {
        return path.join(this.memoryDir, "metadata.json");
    }

    async loadMemory(collectionName: string): Promise<ArchitectureMemory> {
        return this.filesystem.readJson<ArchitectureMemory>(this.getMemoryPath(collectionName));
    }

    async saveMemory(collectionName: string, memory: ArchitectureMemory): Promise<void> {
        await this.filesystem.writeJson(this.getMemoryPath(collectionName), memory);
    }

    async loadMetadata(): Promise<MemoryMetadata | null> {
        const metadataPath = this.getMetadataPath();
        if (!(await this.filesystem.exists(metadataPath))) {
            return null;
        }
        return this.filesystem.readJson<MemoryMetadata>(metadataPath);
    }

    async saveMetadata(metadata: MemoryMetadata): Promise<void> {
        await this.filesystem.writeJson(this.getMetadataPath(), metadata);
    }

    async existsMemory(collectionName: string): Promise<boolean> {
        return this.filesystem.exists(this.getMemoryPath(collectionName));
    }

    async existsMetadata(): Promise<boolean> {
        return this.filesystem.exists(this.getMetadataPath());
    }

    async ensureDirectory(): Promise<void> {
        if (!(await this.filesystem.exists(this.memoryDir))) {
            await this.filesystem.mkdir(this.memoryDir);
        }
    }
}

export class ArchitectureMemoryService {

    private readonly storage: MemoryStorage;

    constructor(
        private readonly workspaceRoot: string,
        storage?: MemoryStorage
    ) {
        const memoryDir = path.join(this.workspaceRoot, "memory");
        this.storage = storage ?? new FileSystemMemoryStorage(memoryDir);
    }

    async create(
        entry: Omit<ArchitectureEntry, "id" | "createdAt" | "updatedAt" | "source" | "confidence"> & {
            source?: ArchitectureSource;
            confidence?: number;
        }
    ): Promise<ArchitectureEntry> {

        try {

            const { memory, metadata } = await this.ensureInitialized();
            const now = new Date().toISOString();

            const nextIdNum = metadata.nextArchitectureId;
            const id = `ARCH-${String(nextIdNum).padStart(6, "0")}`;

            const newEntry: ArchitectureEntry = {
                ...entry,
                id,
                source: entry.source ?? "user",
                confidence: entry.confidence ?? 1.0,
                createdAt: now,
                updatedAt: now
            };

            memory.entries.push(newEntry);
            memory.version++;
            memory.generatedAt = now;

            metadata.nextArchitectureId++;
            metadata.version++;

            await this.storage.saveMemory("architecture", memory);
            await this.storage.saveMetadata(metadata);

            return newEntry;

        } catch (error: any) {
            throw new ArchitectureMemoryError(`Failed to create memory entry: ${error.message}`);
        }

    }

    async update(
        id: string,
        updates: Partial<Omit<ArchitectureEntry, "id" | "createdAt" | "updatedAt">>
    ): Promise<ArchitectureEntry> {

        try {

            const { memory, metadata } = await this.ensureInitialized();
            const index = memory.entries.findIndex(e => e.id === id);

            if (index === -1) {
                throw new ArchitectureMemoryError(`Memory entry not found: ${id}`);
            }

            const existing = memory.entries[index];
            const now = new Date().toISOString();

            const updatedEntry: ArchitectureEntry = {
                ...existing,
                ...updates,
                updatedAt: now
            };

            memory.entries[index] = updatedEntry;
            memory.version++;
            memory.generatedAt = now;

            metadata.version++;

            await this.storage.saveMemory("architecture", memory);
            await this.storage.saveMetadata(metadata);

            return updatedEntry;

        } catch (error: any) {
            if (error instanceof ArchitectureMemoryError) {
                throw error;
            }
            throw new ArchitectureMemoryError(`Failed to update memory entry: ${error.message}`);
        }

    }

    async delete(id: string): Promise<void> {

        try {

            const { memory, metadata } = await this.ensureInitialized();
            const index = memory.entries.findIndex(e => e.id === id);

            if (index === -1) {
                throw new ArchitectureMemoryError(`Memory entry not found: ${id}`);
            }

            memory.entries.splice(index, 1);
            memory.version++;
            memory.generatedAt = new Date().toISOString();

            metadata.version++;

            await this.storage.saveMemory("architecture", memory);
            await this.storage.saveMetadata(metadata);

        } catch (error: any) {
            if (error instanceof ArchitectureMemoryError) {
                throw error;
            }
            throw new ArchitectureMemoryError(`Failed to delete memory entry: ${error.message}`);
        }

    }

    async list(): Promise<ArchitectureEntry[]> {
        const { memory } = await this.ensureInitialized();
        return memory.entries;
    }

    async get(id: string): Promise<ArchitectureEntry | null> {
        const { memory } = await this.ensureInitialized();
        return memory.entries.find(e => e.id === id) ?? null;
    }

    async search(query: string): Promise<ArchitectureEntry[]> {

        const { memory } = await this.ensureInitialized();
        const queryTerms = normalize(query);

        if (queryTerms.length === 0) {
            return [];
        }

        interface ScoredEntry {
            entry: ArchitectureEntry;
            score: number;
        }

        const scored: ScoredEntry[] = [];

        for (const entry of memory.entries) {

            let score = 0;

            const titleTerms = normalize(entry.title);
            const descTerms = normalize(entry.description);
            const tagTerms = entry.tags.flatMap(t => normalize(t));

            for (const qTerm of queryTerms) {
                if (titleTerms.includes(qTerm)) {
                    score += 100;
                }
                if (descTerms.includes(qTerm)) {
                    score += 50;
                }
                if (tagTerms.includes(qTerm)) {
                    score += 20;
                }
            }

            if (score > 0) {
                scored.push({ entry, score });
            }

        }

        return scored
            .sort((a, b) => b.score - a.score)
            .map(s => s.entry);

    }

    private async ensureInitialized(): Promise<{ memory: ArchitectureMemory; metadata: MemoryMetadata }> {

        await this.storage.ensureDirectory();

        const existsMetadata = await this.storage.existsMetadata();
        const existsMemory = await this.storage.existsMemory("architecture");

        // Migration case: architecture.json exists but metadata.json does not
        if (!existsMetadata && existsMemory) {
            const memory = await this.storage.loadMemory("architecture");
            let nextIdNum = 1;

            for (const entry of memory.entries) {
                if (entry.id && entry.id.startsWith("ARCH-")) {
                    const idNum = parseInt(entry.id.replace("ARCH-", ""), 10);
                    if (!isNaN(idNum) && idNum >= nextIdNum) {
                        nextIdNum = idNum + 1;
                    }
                }
            }

            for (const entry of memory.entries) {
                if (!entry.id || !entry.id.startsWith("ARCH-")) {
                    entry.id = `ARCH-${String(nextIdNum++).padStart(6, "0")}`;
                }
                if (!entry.source) {
                    (entry as any).source = "user";
                }
                if (entry.confidence === undefined) {
                    (entry as any).confidence = 1.0;
                }
            }

            const metadata: MemoryMetadata = {
                version: memory.version || 1,
                nextArchitectureId: nextIdNum
            };

            await this.storage.saveMemory("architecture", memory);
            await this.storage.saveMetadata(metadata);

            return { memory, metadata };
        }

        // Clean slate case: neither exists
        if (!existsMetadata && !existsMemory) {
            const metadata: MemoryMetadata = {
                version: 1,
                nextArchitectureId: 1
            };
            const memory: ArchitectureMemory = {
                generatedAt: new Date().toISOString(),
                version: 1,
                entries: []
            };

            await this.storage.saveMetadata(metadata);
            await this.storage.saveMemory("architecture", memory);

            return { memory, metadata };
        }

        // Normal initialized state case
        const metadata = (await this.storage.loadMetadata()) || { version: 1, nextArchitectureId: 1 };
        let memory: ArchitectureMemory;
        if (existsMemory) {
            memory = await this.storage.loadMemory("architecture");
        } else {
            memory = {
                generatedAt: new Date().toISOString(),
                version: 1,
                entries: []
            };
            await this.storage.saveMemory("architecture", memory);
        }

        return { memory, metadata };

    }

}
