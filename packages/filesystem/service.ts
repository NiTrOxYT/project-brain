import fs from "fs/promises";

export class FileSystemService {

    async exists(path: string): Promise<boolean> {
        try {
            await fs.access(path);
            return true;
        } catch {
            return false;
        }
    }

    async mkdir(path: string): Promise<void> {
        await fs.mkdir(path, {
            recursive: true
        });
    }

    async writeJson(path: string, data: unknown): Promise<void> {
        await fs.writeFile(
            path,
            JSON.stringify(data, null, 2),
            "utf8"
        );
    }

    async readJson<T>(path: string): Promise<T> {
        const raw = await fs.readFile(path, "utf8");
        return JSON.parse(raw) as T;
    }

    async readText(path: string): Promise<string> {
        return await fs.readFile(path, "utf8");
    }

    async writeText(path: string, content: string): Promise<void> {
        await fs.writeFile(path, content, "utf8");
    }
}
