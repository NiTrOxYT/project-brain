import assert from "assert";
import { execSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
const CLI = path.resolve("dist/cli/cli.js");
function run(args, cwd = process.cwd()) {
    return execSync(`node --import tsx ${CLI} ${args}`, { cwd, encoding: "utf-8" });
}
function runJson(args, cwd = process.cwd()) {
    const out = run(`${args} --json`, cwd);
    return JSON.parse(out.trim());
}
async function test(name, fn) {
    try {
        await fn();
        console.log(`✓ ${name}`);
    }
    catch (err) {
        console.error(`✗ ${name}`);
        console.error(err.stack || err);
        process.exit(1);
    }
}
async function runTests() {
    console.log("Starting SKILL.md Workspace Instruction Generation Tests (v2)...\n");
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "brain-test-skill-"));
    const skillPath = path.join(tmpDir, ".brain", "SKILL.md");
    try {
        // Run init first
        runJson(`init --workspace ${tmpDir}`);
        // Test 1: brain init creates .brain/SKILL.md
        await test("1. brain init generates SKILL.md", () => {
            assert.ok(fs.existsSync(skillPath), "SKILL.md should be created by brain init");
            const content = fs.readFileSync(skillPath, "utf8");
            assert.ok(content.includes("name: project-brain"));
            assert.ok(content.includes("hash:"));
            assert.ok(content.includes("Project Brain Rules"));
            assert.ok(content.includes("AI Operating Procedure (Highest Priority)"));
            assert.ok(content.includes("Step 1 — Determine Whether Brain Is Needed"));
            assert.ok(content.includes("Step 2 — Never Explore the Repository First"));
            assert.ok(content.includes("Step 3 — Select Exactly One Brain MCP Tool"));
            assert.ok(content.includes("Step 4 — Trust Brain"));
            assert.ok(content.includes("Step 5 — Read Code Only When Necessary"));
            assert.ok(content.includes("Step 6 — Editing Workflow"));
            assert.ok(content.includes("Brain Tool Priority"));
            assert.ok(content.includes("Forbidden Actions"));
        });
        // Test 2: running compile twice preserves SKILL.md and doesn't corrupt it
        await test("2. brain compile preserves SKILL.md and does not duplicate/corrupt it", () => {
            // Create a dummy file to compile
            fs.writeFileSync(path.join(tmpDir, "dummy.ts"), "export const a = 1;");
            const initialContent = fs.readFileSync(skillPath, "utf8");
            runJson(`compile --workspace ${tmpDir}`);
            const firstCompileContent = fs.readFileSync(skillPath, "utf8");
            assert.strictEqual(firstCompileContent, initialContent);
            runJson(`compile --workspace ${tmpDir}`);
            const secondCompileContent = fs.readFileSync(skillPath, "utf8");
            assert.strictEqual(secondCompileContent, initialContent);
        });
        // Test 3: rm .brain/SKILL.md && brain compile recreates it
        await test("3. removing SKILL.md and running compile recreates it", () => {
            fs.unlinkSync(skillPath);
            assert.ok(!fs.existsSync(skillPath));
            runJson(`compile --workspace ${tmpDir}`);
            assert.ok(fs.existsSync(skillPath));
            const content = fs.readFileSync(skillPath, "utf8");
            assert.ok(content.includes("name: project-brain"));
        });
        // Test 4: manual user modifications are preserved
        await test("4. manual user modifications are preserved", () => {
            const userEdit = `---
name: project-brain
description: "Authoritative semantic knowledge index and code analysis rules for Project Brain."
generatedBy: "project-brain"
hash: "invalid-hash-to-trigger-user-modified-detection"
---
My custom rules.`;
            fs.writeFileSync(skillPath, userEdit, "utf8");
            // Compile should see that hash doesn't match body "My custom rules." hash, so it must not overwrite
            runJson(`compile --workspace ${tmpDir}`);
            const content = fs.readFileSync(skillPath, "utf8");
            assert.strictEqual(content, userEdit, "User edit should be completely preserved");
        });
        // Test 5: every registered tool and decision tree maps correctly
        await test("5. every registered tool and decision tree mapping appears in SKILL.md", async () => {
            const { FileSystemService } = await import("./filesystem/index.js");
            const { WorkspaceSkillGenerator } = await import("./workspace/skill-generator.js");
            const { McpToolRegistry } = await import("./mcp-server/index.js");
            const fsSvc = new FileSystemService();
            const generator = new WorkspaceSkillGenerator(fsSvc, path.join(tmpDir, ".brain"));
            const body = await generator.getTemplateBody();
            // 1. Every tool in McpToolRegistry should appear in documentation
            const tools = McpToolRegistry.list();
            for (const tool of tools) {
                assert.ok(body.includes(`### \`${tool.name}\``), `Tool ${tool.name} should appear in tool reference`);
            }
            // 2. Decision tree table matches registry
            for (const tool of tools) {
                const baseName = tool.name.split(".").pop();
                if (["get_context", "explain_file", "find_symbol", "find_dependencies", "get_architecture", "search_memory"].includes(baseName)) {
                    assert.ok(body.includes(`\`${tool.name}\``), `Decision table should include link for ${tool.name}`);
                }
            }
        });
        // Test 6: adding a new MCP tool dynamically updates SKILL.md
        await test("6. adding a new MCP tool dynamically updates SKILL.md", async () => {
            const { FileSystemService } = await import("./filesystem/index.js");
            const { WorkspaceSkillGenerator } = await import("./workspace/skill-generator.js");
            const { McpToolRegistry } = await import("./mcp-server/index.js");
            // Register a mock tool
            const mockTool = {
                name: "brain.mock_tool",
                description: "Temporary mock tool for testing dynamic generation.",
                inputSchema: { type: "object", properties: {} },
                async execute() { return {}; }
            };
            McpToolRegistry.register(mockTool);
            try {
                const fsSvc = new FileSystemService();
                const generator = new WorkspaceSkillGenerator(fsSvc, path.join(tmpDir, ".brain"));
                // Clear previous file to ensure we generate fresh
                const localSkillPath = path.join(tmpDir, ".brain", "SKILL.md");
                if (fs.existsSync(localSkillPath)) {
                    fs.unlinkSync(localSkillPath);
                }
                await generator.ensureSkillFile();
                const content = fs.readFileSync(localSkillPath, "utf8");
                assert.ok(content.includes("### `brain.mock_tool`"), "Mock tool should dynamically appear in SKILL.md");
                assert.ok(content.includes("Temporary mock tool for testing dynamic generation."), "Mock tool description should be present");
            }
            finally {
                // Cleanup mock tool
                McpToolRegistry.unregister("brain.mock_tool");
            }
        });
    }
    finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    }
    console.log("\nAll SKILL.md generation tests passed successfully!");
}
runTests();
