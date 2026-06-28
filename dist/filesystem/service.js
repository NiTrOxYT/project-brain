import fs from "fs/promises";
export class FileSystemService {
    async exists(path) {
        try {
            await fs.access(path);
            return true;
        }
        catch {
            return false;
        }
    }
    async mkdir(path) {
        await fs.mkdir(path, {
            recursive: true
        });
    }
    async writeJson(path, data) {
        await fs.writeFile(path, JSON.stringify(data, null, 2), "utf8");
    }
    async readJson(path) {
        const raw = await fs.readFile(path, "utf8");
        return JSON.parse(raw);
    }
    async readText(path) {
        return await fs.readFile(path, "utf8");
    }
    async writeText(path, content) {
        await fs.writeFile(path, content, "utf8");
    }
}
