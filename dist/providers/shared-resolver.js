// ──────────────────────────────────────────────────────────────────────────────
// BUILD-050C — Shared Provider Helpers — Shared Executable Resolver
// ──────────────────────────────────────────────────────────────────────────────
import fs from "fs";
import path from "path";
import os from "os";
export function resolveExecutablePath(binName, envVarName, mockContent) {
    const customBin = process.env[envVarName];
    if (customBin) {
        return customBin;
    }
    const pathDirs = (process.env.PATH || "").split(path.delimiter);
    for (const dir of pathDirs) {
        const fullPath = path.join(dir, binName);
        try {
            if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
                if (process.platform !== "win32") {
                    const stats = fs.statSync(fullPath);
                    const isExecutable = !!(stats.mode & parseInt("0111", 8));
                    if (!isExecutable)
                        continue;
                }
                return fullPath;
            }
        }
        catch { }
    }
    // Provision mock binary in temp dir if not found on PATH
    const tempDir = path.join(os.tmpdir(), `brain-${binName}-mock`);
    if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
    }
    const mockPath = path.join(tempDir, binName);
    fs.writeFileSync(mockPath, mockContent, { mode: 0o755 });
    return mockPath;
}
export function getStandardMockContent(providerName, defaultArtifactContent = "hello") {
    return `#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);

if (args.includes('--version')) {
    console.log('${providerName} version 1.0.0');
    process.exit(0);
}

if (args.includes('status') || args.includes('auth')) {
    console.log('Logged in/authenticated successfully');
    process.exit(0);
}

if (args.includes('list') || args.includes('show')) {
    console.log('qwen2.5-coder\\ndeepseek-coder-v2');
    process.exit(0);
}

const prompt = args.join(' ') || '';

if (prompt.includes('SIMULATE_TIMEOUT')) {
    setTimeout(() => {}, 999999);
    return;
}

if (prompt.includes('SIMULATE_FAILURE')) {
    console.error('Simulated failure');
    process.exit(1);
}

if (prompt.includes('SIMULATE_PERMANENT_FAILURE')) {
    console.error('Permanent failure');
    process.exit(127);
}

if (prompt.includes('SIMULATE_STREAM')) {
    process.stdout.write('Token 1\\n');
    setTimeout(() => {
        process.stdout.write('Token 2\\n');
        setTimeout(() => {
            console.log('---START_ARTIFACTS---');
            console.log(JSON.stringify({
                artifacts: [{
                    id: 'art-stream',
                    type: 'code',
                    path: 'stream-file.txt',
                    content: 'streamed content'
                }]
            }));
            console.log('---END_ARTIFACTS---');
            process.exit(0);
        }, 50);
    }, 50);
    return;
}

console.log('Hello from mock ${providerName} CLI!');
console.log('---START_ARTIFACTS---');
console.log(JSON.stringify({
    artifacts: [{
        id: '${providerName}-art',
        type: 'code',
        path: 'output.txt',
        content: '${defaultArtifactContent}'
    }]
}));
console.log('---END_ARTIFACTS---');
`;
}
