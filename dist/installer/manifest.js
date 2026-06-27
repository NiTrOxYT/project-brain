// ──────────────────────────────────────────────────────────────────────────────
// BUILD-061D — Installer — Wrapper Manifest
// Tracks all generated wrappers in ~/.project-brain/wrappers/manifest.json.
// The installer verifies wrapper integrity against this manifest rather than
// inspecting wrapper files directly.
// ──────────────────────────────────────────────────────────────────────────────
import fs from "fs";
import path from "path";
import crypto from "crypto";
// ─── Checksum ────────────────────────────────────────────────────────────────
export function checksumContent(content) {
    return crypto.createHash("sha256").update(content, "utf8").digest("hex").slice(0, 16);
}
// ─── Manifest Manager ────────────────────────────────────────────────────────
export class ManifestManager {
    manifestPath;
    constructor(wrappersDir) {
        this.manifestPath = path.join(wrappersDir, "manifest.json");
    }
    // ── Read / Write ─────────────────────────────────────────────────────
    load() {
        if (!fs.existsSync(this.manifestPath)) {
            return { version: "1", wrappers: {}, updatedAt: new Date().toISOString() };
        }
        try {
            return JSON.parse(fs.readFileSync(this.manifestPath, "utf8"));
        }
        catch {
            return { version: "1", wrappers: {}, updatedAt: new Date().toISOString() };
        }
    }
    save(manifest) {
        manifest.updatedAt = new Date().toISOString();
        fs.mkdirSync(path.dirname(this.manifestPath), { recursive: true });
        fs.writeFileSync(this.manifestPath, JSON.stringify(manifest, null, 2), "utf8");
    }
    // ── Record Management ────────────────────────────────────────────────
    get(providerId) {
        return this.load().wrappers[providerId];
    }
    set(providerId, record) {
        const manifest = this.load();
        manifest.wrappers[providerId] = record;
        this.save(manifest);
    }
    remove(providerId) {
        const manifest = this.load();
        delete manifest.wrappers[providerId];
        this.save(manifest);
    }
    listProviders() {
        return Object.keys(this.load().wrappers);
    }
    // ── Integrity Checks ─────────────────────────────────────────────────
    /**
     * Check whether the wrapper file on disk matches the manifest checksum.
     * Returns "ok" | "missing" | "corrupted" | "outdated" | "untracked".
     */
    verifyWrapper(providerId, currentInstallerVersion) {
        const record = this.get(providerId);
        if (!record)
            return "untracked";
        if (!fs.existsSync(record.wrapperPath))
            return "missing";
        const content = fs.readFileSync(record.wrapperPath, "utf8");
        const checksum = checksumContent(content);
        if (checksum !== record.checksum)
            return "corrupted";
        if (record.installerVersion !== currentInstallerVersion)
            return "outdated";
        return "ok";
    }
}
