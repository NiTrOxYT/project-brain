// ──────────────────────────────────────────────────────────────────────────────
// BUILD-068 — Comments-Preserving YAML & TOML Merger Utilities
// ──────────────────────────────────────────────────────────────────────────────

export function mergeToml(content: string, key: string, values: Record<string, any>): string {
    const lines = content.split(/\r?\n/);
    const targetHeader = `[mcp_servers.${key}]`;
    let startIdx = -1;
    let endIdx = -1;

    for (let i = 0; i < lines.length; i++) {
        const trimmed = lines[i].trim();
        if (trimmed === targetHeader) {
            startIdx = i;
            for (let j = i + 1; j < lines.length; j++) {
                if (lines[j].trim().startsWith("[")) {
                    endIdx = j;
                    break;
                }
            }
            if (endIdx === -1) {
                endIdx = lines.length;
            }
            break;
        }
    }

    const newLines: string[] = [targetHeader];
    for (const [k, v] of Object.entries(values)) {
        if (Array.isArray(v)) {
            newLines.push(`${k} = [${v.map(item => typeof item === "string" ? `"${item}"` : String(item)).join(", ")}]`);
        } else if (typeof v === "string") {
            newLines.push(`${k} = "${v}"`);
        } else {
            newLines.push(`${k} = ${v}`);
        }
    }
    newLines.push("");

    if (startIdx !== -1) {
        lines.splice(startIdx, endIdx - startIdx, ...newLines);
    } else {
        if (lines.length > 0 && lines[lines.length - 1].trim() !== "") {
            lines.push("");
        }
        lines.push(...newLines);
    }
    return lines.join("\n");
}

export function unconfigureToml(content: string, key: string): string {
    const lines = content.split(/\r?\n/);
    const targetHeader = `[mcp_servers.${key}]`;
    let startIdx = -1;
    let endIdx = -1;

    for (let i = 0; i < lines.length; i++) {
        const trimmed = lines[i].trim();
        if (trimmed === targetHeader) {
            startIdx = i;
            for (let j = i + 1; j < lines.length; j++) {
                if (lines[j].trim().startsWith("[")) {
                    endIdx = j;
                    break;
                }
            }
            if (endIdx === -1) {
                endIdx = lines.length;
            }
            break;
        }
    }

    if (startIdx !== -1) {
        lines.splice(startIdx, endIdx - startIdx);
        // Clean up trailing blank lines if needed
        while (lines.length > 0 && lines[lines.length - 1].trim() === "") {
            lines.pop();
        }
    }
    return lines.join("\n");
}

export function mergeYamlMcpServers(content: string, entry: any): string {
    const lines = content.split(/\r?\n/);
    let mcpServersIdx = -1;
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].trim().startsWith("mcpServers:")) {
            mcpServersIdx = i;
            break;
        }
    }

    const entryLines: string[] = [];
    entryLines.push(`  - name: ${entry.name}`);
    if (entry.type) entryLines.push(`    type: ${entry.type}`);
    if (entry.command) entryLines.push(`    command: ${entry.command}`);
    if (entry.args) {
        entryLines.push("    args:");
        for (const arg of entry.args) {
            entryLines.push(`      - ${arg}`);
        }
    }
    if (entry.url) entryLines.push(`    url: ${entry.url}`);

    if (mcpServersIdx === -1) {
        if (lines.length > 0 && lines[lines.length - 1].trim() !== "") {
            lines.push("");
        }
        lines.push("mcpServers:");
        lines.push(...entryLines);
        return lines.join("\n");
    }

    let itemStartIdx = -1;
    let itemEndIdx = -1;

    for (let i = mcpServersIdx + 1; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();
        if (trimmed === "") continue;
        const indent = line.length - line.trimStart().length;
        if (indent === 0 && !trimmed.startsWith("-") && i > mcpServersIdx + 1) {
            break;
        }
        if (trimmed.startsWith("- name:") && trimmed.includes(entry.name)) {
            itemStartIdx = i;
            for (let j = i + 1; j < lines.length; j++) {
                const subLine = lines[j];
                const subTrimmed = subLine.trim();
                if (subTrimmed === "") continue;
                const subIndent = subLine.length - subLine.trimStart().length;
                if (subTrimmed.startsWith("-") || (subIndent === 0 && !subTrimmed.startsWith("-"))) {
                    itemEndIdx = j;
                    break;
                }
            }
            if (itemEndIdx === -1) {
                itemEndIdx = lines.length;
            }
            break;
        }
    }

    if (itemStartIdx !== -1) {
        lines.splice(itemStartIdx, itemEndIdx - itemStartIdx, ...entryLines);
    } else {
        lines.splice(mcpServersIdx + 1, 0, ...entryLines);
    }
    return lines.join("\n");
}

export function unconfigureYamlMcpServers(content: string, name: string): string {
    const lines = content.split(/\r?\n/);
    let mcpServersIdx = -1;
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].trim().startsWith("mcpServers:")) {
            mcpServersIdx = i;
            break;
        }
    }
    if (mcpServersIdx === -1) return content;

    let itemStartIdx = -1;
    let itemEndIdx = -1;

    for (let i = mcpServersIdx + 1; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();
        if (trimmed === "") continue;
        const indent = line.length - line.trimStart().length;
        if (indent === 0 && !trimmed.startsWith("-") && i > mcpServersIdx + 1) {
            break;
        }
        if (trimmed.startsWith("- name:") && trimmed.includes(name)) {
            itemStartIdx = i;
            for (let j = i + 1; j < lines.length; j++) {
                const subLine = lines[j];
                const subTrimmed = subLine.trim();
                if (subTrimmed === "") continue;
                const subIndent = subLine.length - subLine.trimStart().length;
                if (subTrimmed.startsWith("-") || (subIndent === 0 && !subTrimmed.startsWith("-"))) {
                    itemEndIdx = j;
                    break;
                }
            }
            if (itemEndIdx === -1) {
                itemEndIdx = lines.length;
            }
            break;
        }
    }

    if (itemStartIdx !== -1) {
        lines.splice(itemStartIdx, itemEndIdx - itemStartIdx);
        let isEmpty = true;
        for (let i = mcpServersIdx + 1; i < lines.length; i++) {
            const trimmed = lines[i].trim();
            if (trimmed === "") continue;
            const indent = lines[i].length - lines[i].trimStart().length;
            if (indent === 0) break;
            if (trimmed.startsWith("-")) {
                isEmpty = false;
                break;
            }
        }
        if (isEmpty) {
            let deleteEnd = mcpServersIdx + 1;
            while (deleteEnd < lines.length && lines[deleteEnd].trim() === "") {
                deleteEnd++;
            }
            lines.splice(mcpServersIdx, deleteEnd - mcpServersIdx);
        }
    }
    return lines.join("\n");
}

export function mergeYamlAiderRead(content: string, filePath: string): string {
    const lines = content.split(/\r?\n/);
    let readIdx = -1;
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].trim().startsWith("read:")) {
            readIdx = i;
            break;
        }
    }

    if (readIdx === -1) {
        if (lines.length > 0 && lines[lines.length - 1].trim() !== "") {
            lines.push("");
        }
        lines.push("read:");
        lines.push(`  - ${filePath}`);
        return lines.join("\n");
    }

    const readLine = lines[readIdx];
    if (readLine.includes("[") && readLine.includes("]")) {
        if (readLine.includes(filePath)) return content;
        const startBracket = readLine.indexOf("[");
        const endBracket = readLine.indexOf("]");
        const elementsStr = readLine.slice(startBracket + 1, endBracket).trim();
        const elements = elementsStr ? elementsStr.split(",").map(e => e.trim()) : [];
        elements.push(`"${filePath}"`);
        lines[readIdx] = `${readLine.slice(0, startBracket)}[${elements.join(", ")}]`;
        return lines.join("\n");
    }

    let exists = false;
    let insertPos = readIdx + 1;
    for (let i = readIdx + 1; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();
        if (trimmed === "") continue;
        const indent = line.length - line.trimStart().length;
        if (indent === 0 && !trimmed.startsWith("-") && i > readIdx + 1) {
            break;
        }
        if (trimmed.startsWith("-") && trimmed.includes(filePath)) {
            exists = true;
            break;
        }
        insertPos = i + 1;
    }

    if (!exists) {
        lines.splice(insertPos, 0, `  - ${filePath}`);
    }
    return lines.join("\n");
}

export function unconfigureYamlAiderRead(content: string, filePath: string): string {
    const lines = content.split(/\r?\n/);
    let readIdx = -1;
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].trim().startsWith("read:")) {
            readIdx = i;
            break;
        }
    }
    if (readIdx === -1) return content;

    const readLine = lines[readIdx];
    if (readLine.includes("[") && readLine.includes("]")) {
        const startBracket = readLine.indexOf("[");
        const endBracket = readLine.indexOf("]");
        const elementsStr = readLine.slice(startBracket + 1, endBracket).trim();
        let elements = elementsStr ? elementsStr.split(",").map(e => e.trim()) : [];
        elements = elements.filter(e => !e.includes(filePath));
        if (elements.length === 0) {
            lines.splice(readIdx, 1);
        } else {
            lines[readIdx] = `${readLine.slice(0, startBracket)}[${elements.join(", ")}]`;
        }
        return lines.join("\n");
    }

    let itemIdx = -1;
    for (let i = readIdx + 1; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();
        if (trimmed === "") continue;
        const indent = line.length - line.trimStart().length;
        if (indent === 0 && !trimmed.startsWith("-") && i > readIdx + 1) {
            break;
        }
        if (trimmed.startsWith("-") && trimmed.includes(filePath)) {
            itemIdx = i;
            break;
        }
    }

    if (itemIdx !== -1) {
        lines.splice(itemIdx, 1);
        let isEmpty = true;
        for (let i = readIdx + 1; i < lines.length; i++) {
            const trimmed = lines[i].trim();
            if (trimmed === "") continue;
            const indent = lines[i].length - lines[i].trimStart().length;
            if (indent === 0) break;
            if (trimmed.startsWith("-")) {
                isEmpty = false;
                break;
            }
        }
        if (isEmpty) {
            let deleteEnd = readIdx + 1;
            while (deleteEnd < lines.length && lines[deleteEnd].trim() === "") {
                deleteEnd++;
            }
            lines.splice(readIdx, deleteEnd - readIdx);
        }
    }
    return lines.join("\n");
}
