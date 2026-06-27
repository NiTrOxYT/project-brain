import path from "path";
import { FileSystemService } from "../filesystem/index.js";
import { normalize } from "../semantic/index.js";
import { ArchitectureMemoryError } from "./errors.js";
export class FileSystemMemoryStorage {
    memoryDir;
    filesystem = new FileSystemService();
    constructor(memoryDir) {
        this.memoryDir = memoryDir;
    }
    getMemoryPath(collectionName) {
        return path.join(this.memoryDir, `${collectionName}.json`);
    }
    getMetadataPath() {
        return path.join(this.memoryDir, "metadata.json");
    }
    async loadMemory(collectionName) {
        return this.filesystem.readJson(this.getMemoryPath(collectionName));
    }
    async saveMemory(collectionName, memory) {
        await this.filesystem.writeJson(this.getMemoryPath(collectionName), memory);
    }
    async loadMetadata() {
        const metadataPath = this.getMetadataPath();
        if (!(await this.filesystem.exists(metadataPath))) {
            return null;
        }
        return this.filesystem.readJson(metadataPath);
    }
    async saveMetadata(metadata) {
        await this.filesystem.writeJson(this.getMetadataPath(), metadata);
    }
    async existsMemory(collectionName) {
        return this.filesystem.exists(this.getMemoryPath(collectionName));
    }
    async existsMetadata() {
        return this.filesystem.exists(this.getMetadataPath());
    }
    async ensureDirectory() {
        if (!(await this.filesystem.exists(this.memoryDir))) {
            await this.filesystem.mkdir(this.memoryDir);
        }
    }
}
export class ArchitectureMemoryService {
    workspaceRoot;
    storage;
    constructor(workspaceRoot, storage) {
        this.workspaceRoot = workspaceRoot;
        const memoryDir = path.join(this.workspaceRoot, "memory");
        this.storage = storage ?? new FileSystemMemoryStorage(memoryDir);
    }
    async create(entry) {
        try {
            const { memory, metadata } = await this.ensureInitialized();
            const now = new Date().toISOString();
            const nextIdNum = metadata.nextArchitectureId;
            const id = `ARCH-${String(nextIdNum).padStart(6, "0")}`;
            const newEntry = {
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
        }
        catch (error) {
            throw new ArchitectureMemoryError(`Failed to create memory entry: ${error.message}`);
        }
    }
    async update(id, updates) {
        try {
            const { memory, metadata } = await this.ensureInitialized();
            const index = memory.entries.findIndex(e => e.id === id);
            if (index === -1) {
                throw new ArchitectureMemoryError(`Memory entry not found: ${id}`);
            }
            const existing = memory.entries[index];
            const now = new Date().toISOString();
            const updatedEntry = {
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
        }
        catch (error) {
            if (error instanceof ArchitectureMemoryError) {
                throw error;
            }
            throw new ArchitectureMemoryError(`Failed to update memory entry: ${error.message}`);
        }
    }
    async delete(id) {
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
        }
        catch (error) {
            if (error instanceof ArchitectureMemoryError) {
                throw error;
            }
            throw new ArchitectureMemoryError(`Failed to delete memory entry: ${error.message}`);
        }
    }
    async list() {
        const { memory } = await this.ensureInitialized();
        return memory.entries;
    }
    async get(id) {
        const { memory } = await this.ensureInitialized();
        return memory.entries.find(e => e.id === id) ?? null;
    }
    async search(query) {
        const { memory } = await this.ensureInitialized();
        const queryTerms = normalize(query);
        if (queryTerms.length === 0) {
            return [];
        }
        const scored = [];
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
    async ensureInitialized() {
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
                    entry.source = "user";
                }
                if (entry.confidence === undefined) {
                    entry.confidence = 1.0;
                }
            }
            const metadata = {
                version: memory.version || 1,
                nextArchitectureId: nextIdNum
            };
            await this.storage.saveMemory("architecture", memory);
            await this.storage.saveMetadata(metadata);
            return { memory, metadata };
        }
        // Clean slate case: neither exists
        if (!existsMetadata && !existsMemory) {
            const metadata = {
                version: 1,
                nextArchitectureId: 1
            };
            const memory = {
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
        let memory;
        if (existsMemory) {
            memory = await this.storage.loadMemory("architecture");
        }
        else {
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
