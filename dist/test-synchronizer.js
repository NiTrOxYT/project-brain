import process from "process";
import path from "path";
import fs from "fs/promises";
import { RuntimeService } from "./runtime/index.js";
import { SynchronizerService } from "./synchronizer/index.js";
async function main() {
    const workspaceRoot = path.join(process.cwd(), ".brain");
    console.log("Setting up workspace database...");
    const runtime = new RuntimeService({
        root: process.cwd()
    });
    await runtime.initialize();
    const synchronizer = new SynchronizerService(process.cwd(), workspaceRoot);
    // 1. Run sync on unchanged repository
    console.log("\n1. Running synchronization on UNCHANGED repository...");
    const start1 = Date.now();
    const state1 = await synchronizer.synchronize();
    const duration1 = Date.now() - start1;
    console.log(`Time taken: ${duration1}ms`);
    console.log(`Files scanned: ${state1.scannedFiles}`);
    console.log(`Files changed: ${state1.changedFiles.length}`);
    console.log(`Files rebuilt: ${state1.updatedIndexes.length ? state1.changedFiles.length + state1.addedFiles.length : 0}`);
    if (state1.changedFiles.length !== 0 || state1.addedFiles.length !== 0 || state1.removedFiles.length !== 0) {
        console.error("FAIL: Expected 0 files changed on unchanged repository!");
        process.exit(1);
    }
    console.log("SUCCESS: Unchanged repository processed without rebuilding any indexes.");
    // 2. Modify one file
    const targetFile = "packages/test-symbols.ts";
    const targetPath = path.join(process.cwd(), targetFile);
    console.log(`\n2. Modifying ${targetFile}...`);
    const originalContent = await fs.readFile(targetPath, "utf8");
    const modifiedContent = originalContent + "\n// sync test dummy comment\n";
    await fs.writeFile(targetPath, modifiedContent, "utf8");
    // We must wait a brief moment to ensure filesystem timestamp increments
    await new Promise(resolve => setTimeout(resolve, 1000));
    console.log("Running synchronization on MODIFIED repository...");
    const start2 = Date.now();
    const state2 = await synchronizer.synchronize();
    const duration2 = Date.now() - start2;
    console.log(`Time taken: ${duration2}ms`);
    console.log(`Files scanned: ${state2.scannedFiles}`);
    console.log(`Files changed: [ ${state2.changedFiles.join(", ")} ]`);
    console.log(`Updated indexes: [ ${state2.updatedIndexes.join(", ")} ]`);
    if (!state2.changedFiles.includes(targetFile) || state2.changedFiles.length !== 1) {
        console.error(`FAIL: Expected only ${targetFile} to be modified, but got:`, state2.changedFiles);
        // Restore original content anyway
        await fs.writeFile(targetPath, originalContent, "utf8");
        process.exit(1);
    }
    console.log("SUCCESS: Only the modified file was reprocessed.");
    // 3. Restore the file
    console.log(`\n3. Restoring ${targetFile}...`);
    await fs.writeFile(targetPath, originalContent, "utf8");
    await new Promise(resolve => setTimeout(resolve, 1000));
    console.log("Running synchronization on RESTORED repository...");
    const start3 = Date.now();
    const state3 = await synchronizer.synchronize();
    const duration3 = Date.now() - start3;
    console.log(`Time taken: ${duration3}ms`);
    console.log(`Files scanned: ${state3.scannedFiles}`);
    console.log(`Files changed: [ ${state3.changedFiles.join(", ")} ]`);
    console.log(`Updated indexes: [ ${state3.updatedIndexes.join(", ")} ]`);
    if (!state3.changedFiles.includes(targetFile) || state3.changedFiles.length !== 1) {
        console.error("FAIL: Expected restored file to be processed as modified back to original!");
        process.exit(1);
    }
    console.log("SUCCESS: Restored file processed.");
    // 4. Run again (should return to completely clean state)
    console.log("\n4. Running synchronization to verify clean state...");
    const state4 = await synchronizer.synchronize();
    if (state4.changedFiles.length !== 0 || state4.addedFiles.length !== 0 || state4.removedFiles.length !== 0) {
        console.error("FAIL: Expected 0 files changed on clean state!");
        process.exit(1);
    }
    console.log("SUCCESS: Synchronizer returned to clean state.");
    console.log("\nAll synchronization tests passed successfully!");
}
main().catch(error => {
    console.error("Test failed:", error);
    process.exit(1);
});
