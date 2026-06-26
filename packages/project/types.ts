export interface ProjectInfo {

    name: string;

    root: string;

    packageManager: "npm" | "pnpm" | "yarn" | "bun" | "unknown";

    framework: string;

    language: string;

}
