import fs from "fs";
import path from "path";
import os from "os";
export class ProviderPolicyInstaller {
    static getInstructionsPath(providerId) {
        const home = os.homedir();
        if (providerId === "opencode") {
            return path.join(home, ".config", "opencode", "instructions.txt");
        }
        if (providerId === "claude") {
            return path.join(home, ".config", "Claude", "instructions.txt");
        }
        return "";
    }
    static getPolicyText() {
        return [
            "Project Brain is the authoritative source of project knowledge.",
            "Before performing any repository-wide search, recursive grep, symbol indexing, or dependency traversal:",
            "1. Call brain.get_context.",
            "2. Use brain.find_symbol before recursive symbol searches.",
            "3. Use brain.find_dependencies before traversing imports.",
            "4. Use brain.search_memory before semantic repository searches.",
            "5. Perform repository-wide scanning only when:",
            "   - Brain reports LOW confidence,",
            "   - requested symbols/files are unavailable,",
            "   - the snapshot is stale,",
            "   - or the user explicitly requests a full repository search.",
            "Prefer Brain context over repository scanning whenever possible."
        ].join("\n");
    }
    static isPolicyInstalled(providerId) {
        const filepath = this.getInstructionsPath(providerId);
        if (!filepath || !fs.existsSync(filepath)) {
            return false;
        }
        try {
            const content = fs.readFileSync(filepath, "utf-8");
            return content.includes("Project Brain is the authoritative source");
        }
        catch {
            return false;
        }
    }
    static installPolicy(providerId) {
        const filepath = this.getInstructionsPath(providerId);
        if (!filepath) {
            return { success: false, error: `Provider ${providerId} does not support policy installation.` };
        }
        try {
            const dir = path.dirname(filepath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            fs.writeFileSync(filepath, this.getPolicyText(), "utf-8");
            return { success: true };
        }
        catch (err) {
            return { success: false, error: err.message || "Failed to install policy instructions file." };
        }
    }
    static removePolicy(providerId) {
        const filepath = this.getInstructionsPath(providerId);
        if (!filepath || !fs.existsSync(filepath)) {
            return { success: true };
        }
        try {
            fs.unlinkSync(filepath);
            return { success: true };
        }
        catch {
            return { success: false };
        }
    }
}
