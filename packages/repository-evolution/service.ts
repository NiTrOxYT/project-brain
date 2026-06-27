import fs from "fs/promises";
import path from "path";

import { FileSystemService } from "../filesystem/index.js";
import { GitCommit, EvolutionHistory, FileAnalytics, CoChangeAnalytics, EvolutionAnalytics } from "./types.js";
import { RepositoryEvolutionError } from "./errors.js";

export class RepositoryEvolutionService {

    private readonly filesystem = new FileSystemService();

    constructor(
        private readonly workspaceRoot: string
    ) {}

    async initialize(): Promise<{ history: EvolutionHistory; analytics: EvolutionAnalytics }> {

        const dir = path.join(this.workspaceRoot, "index", "evolution");
        if (!(await this.filesystem.exists(dir))) {
            await this.filesystem.mkdir(dir);
        }

        const historyPath = path.join(dir, "history.json");
        const analyticsPath = path.join(dir, "analytics.json");

        const repositoryHash = await this.getCurrentHeadHash();

        const historyExists = await this.filesystem.exists(historyPath);
        const analyticsExists = await this.filesystem.exists(analyticsPath);

        if (historyExists && analyticsExists) {
            try {
                const history = await this.filesystem.readJson<EvolutionHistory>(historyPath);
                if (history.repositoryHash === repositoryHash) {
                    const analytics = await this.filesystem.readJson<EvolutionAnalytics>(analyticsPath);
                    return { history, analytics };
                }
            } catch {
                // Ignore load errors and rebuild
            }
        }

        // Hash mismatched or files missing: rebuild raw history
        const commits = await this.parseGitHistory();
        const history: EvolutionHistory = {
            version: 1,
            generatedAt: new Date().toISOString(),
            repositoryHash,
            commits
        };

        await this.filesystem.writeJson(historyPath, history);

        // Compute and save derived analytics
        const analytics = await this.computeAnalytics(commits, repositoryHash);

        return { history, analytics };

    }

    async rebuildAnalytics(): Promise<EvolutionAnalytics> {
        const dir = path.join(this.workspaceRoot, "index", "evolution");
        const historyPath = path.join(dir, "history.json");

        if (!(await this.filesystem.exists(historyPath))) {
            throw new RepositoryEvolutionError("Cannot rebuild analytics: history.json does not exist");
        }

        const history = await this.filesystem.readJson<EvolutionHistory>(historyPath);
        const analytics = await this.computeAnalytics(history.commits, history.repositoryHash);
        return analytics;
    }

    async getAnalytics(): Promise<EvolutionAnalytics> {
        const analyticsPath = path.join(this.workspaceRoot, "index", "evolution", "analytics.json");
        if (!(await this.filesystem.exists(analyticsPath))) {
            const { analytics } = await this.initialize();
            return analytics;
        }
        return this.filesystem.readJson<EvolutionAnalytics>(analyticsPath);
    }

    private async getCurrentHeadHash(): Promise<string> {
        try {
            const stdout = await this.runGitCommand(["rev-parse", "HEAD"]);
            return stdout.trim();
        } catch (error: any) {
            // Default fallback if git not initialised or has no commits
            return "empty-git-state";
        }
    }

    private async runGitCommand(args: string[]): Promise<string> {
        const { execFile } = await import("child_process");
        const { promisify } = await import("util");
        const execFileAsync = promisify(execFile);
        try {
            const { stdout } = await execFileAsync("git", args, { cwd: this.workspaceRoot });
            return stdout;
        } catch (error: any) {
            throw new RepositoryEvolutionError(`Git command execution failed: ${error.message}`);
        }
    }

    private async parseGitHistory(): Promise<GitCommit[]> {

        const formatStr = "COMMIT:%H|%P%nAUTHOR:%an <%ae>%nDATE:%cI%nSUBJECT:%s";
        const stdout = await this.runGitCommand([
            "log",
            "--name-status",
            `--pretty=format:${formatStr}`,
            "--no-merges"
        ]);

        const lines = stdout.split(/\r?\n/);
        const commits: GitCommit[] = [];
        let currentCommit: GitCommit | null = null;

        for (const line of lines) {

            const trimmed = line.trim();
            if (!trimmed) continue;

            if (trimmed.startsWith("COMMIT:")) {
                if (currentCommit) {
                    commits.push(currentCommit);
                }
                const parts = trimmed.replace("COMMIT:", "").split("|");
                currentCommit = {
                    hash: parts[0],
                    parentHashes: parts[1] ? parts[1].split(" ").filter(Boolean) : [],
                    authorName: "",
                    authorEmail: "",
                    date: "",
                    message: "",
                    files: []
                };
            } else if (currentCommit) {
                if (trimmed.startsWith("AUTHOR:")) {
                    const fullAuthor = trimmed.replace("AUTHOR:", "");
                    const emailStart = fullAuthor.indexOf("<");
                    if (emailStart !== -1) {
                        currentCommit.authorName = fullAuthor.substring(0, emailStart).trim();
                        currentCommit.authorEmail = fullAuthor.substring(emailStart + 1, fullAuthor.length - 1).trim();
                    } else {
                        currentCommit.authorName = fullAuthor.trim();
                    }
                } else if (trimmed.startsWith("DATE:")) {
                    currentCommit.date = trimmed.replace("DATE:", "").trim();
                } else if (trimmed.startsWith("SUBJECT:")) {
                    currentCommit.message = trimmed.replace("SUBJECT:", "").trim();
                } else {
                    // Parse file name status line
                    const parts = trimmed.split(/\s+/);
                    if (parts.length >= 2) {
                        const status = parts[0];
                        if (status.startsWith("R") && parts.length >= 3) {
                            const oldPath = parts[1];
                            const fPath = parts[2];
                            currentCommit.files.push({ path: fPath, status, oldPath });
                        } else {
                            const fPath = parts[1];
                            currentCommit.files.push({ path: fPath, status });
                        }
                    }
                }
            }

        }

        if (currentCommit) {
            commits.push(currentCommit);
        }

        return commits;

    }

    private async computeAnalytics(commits: GitCommit[], repositoryHash: string): Promise<EvolutionAnalytics> {

        // 1. Trace Renames (Oldest to Newest)
        const activePathMap = new Map<string, string>();
        const sortedCommits = [...commits].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

        for (const commit of sortedCommits) {
            for (const file of commit.files) {
                if (file.status.startsWith("R") && file.oldPath) {
                    const target = activePathMap.get(file.oldPath) ?? file.oldPath;
                    activePathMap.set(file.oldPath, file.path);
                    activePathMap.set(target, file.path);
                }
            }
        }

        // 2. Group modification events per file path
        interface FileEvent {
            date: string;
            authorName: string;
            authorEmail: string;
            hash: string;
        }

        const fileEvents = new Map<string, FileEvent[]>();
        const coChangeMap = new Map<string, number>();

        for (const commit of sortedCommits) {

            const commitFiles = new Set<string>();

            for (const file of commit.files) {
                if (file.status === "D") continue; // skip deleted files from active scoring
                const activePath = activePathMap.get(file.path) ?? file.path;
                commitFiles.add(activePath);

                let events = fileEvents.get(activePath);
                if (!events) {
                    events = [];
                    fileEvents.set(activePath, events);
                }
                events.push({
                    date: commit.date,
                    authorName: commit.authorName,
                    authorEmail: commit.authorEmail,
                    hash: commit.hash
                });
            }

            // Co-changes in this commit
            const fileList = Array.from(commitFiles);
            for (let i = 0; i < fileList.length; i++) {
                for (let j = i + 1; j < fileList.length; j++) {
                    const fA = fileList[i];
                    const fB = fileList[j];
                    const pairKey = fA < fB ? `${fA}||${fB}` : `${fB}||${fA}`;
                    coChangeMap.set(pairKey, (coChangeMap.get(pairKey) ?? 0) + 1);
                }
            }

        }

        // 3. Compute Metrics for each file
        const fileHistory: FileAnalytics[] = [];
        const latestRepoTime = Math.max(...sortedCommits.map(c => new Date(c.date).getTime()), Date.now());
        const DAY_MS = 24 * 60 * 60 * 1000;

        for (const [filePath, events] of fileEvents.entries()) {

            const sortedEvents = [...events].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
            const firstAppearance = sortedEvents[0].date;
            const lastModification = sortedEvents[sortedEvents.length - 1].date;
            const commitCount = sortedEvents.length;
            const churnScore = commitCount; // churn as modification frequency

            // Ownership calculation
            const authorCommits = new Map<string, number>();
            for (const ev of sortedEvents) {
                const authorKey = `${ev.authorName} <${ev.authorEmail}>`;
                authorCommits.set(authorKey, (authorCommits.get(authorKey) ?? 0) + 1);
            }

            const sortedAuthors = Array.from(authorCommits.entries()).sort((a, b) => b[1] - a[1]);
            const primaryOwner = sortedAuthors[0] ? sortedAuthors[0][0] : "Unknown";
            const ownershipConfidence = sortedAuthors[0] ? sortedAuthors[0][1] / commitCount : 1.0;
            const secondaryOwners = sortedAuthors.slice(1).map(s => s[0]);
            const activeContributors = authorCommits.size;

            // Interval computation
            let averageIntervalMs = 0;
            if (commitCount > 1) {
                const oldestMs = new Date(firstAppearance).getTime();
                const newestMs = new Date(lastModification).getTime();
                averageIntervalMs = (newestMs - oldestMs) / (commitCount - 1);
            }

            // Temporal signals relative to latest repo event
            const ageMs = latestRepoTime - new Date(lastModification).getTime();
            const recentlyChanged = ageMs < 7 * DAY_MS;
            const stableModule = commitCount >= 3 && ageMs > 30 * DAY_MS;
            const frequentlyChanging = commitCount >= 5;
            const abandonedModule = ageMs > 90 * DAY_MS && activeContributors > 1;

            fileHistory.push({
                path: filePath,
                firstAppearance,
                lastModification,
                commitCount,
                churnScore,
                activeContributors,
                averageIntervalMs,
                primaryOwner,
                secondaryOwners,
                ownershipConfidence,
                recentlyChanged,
                stableModule,
                frequentlyChanging,
                abandonedModule
            });

        }

        // 4. Compute Co-change Records
        const coChangeRelationships: CoChangeAnalytics[] = [];
        for (const [pairKey, count] of coChangeMap.entries()) {
            const [fileA, fileB] = pairKey.split("||");
            coChangeRelationships.push({ fileA, fileB, count });
        }
        coChangeRelationships.sort((a, b) => b.count - a.count);

        const analyticsPath = path.join(this.workspaceRoot, "index", "evolution", "analytics.json");
        const analytics: EvolutionAnalytics = {
            version: 1,
            generatedAt: new Date().toISOString(),
            repositoryHash,
            fileHistory,
            coChangeRelationships
        };

        await this.filesystem.writeJson(analyticsPath, analytics);

        return analytics;

    }

}
