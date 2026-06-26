// ──────────────────────────────────────────────────────────────────────────────
// BUILD-050A — Provider Execution Layer — Stream Processor
// Stateful line-reconstructing stream processor for stdout/stderr.
// Provider-agnostic: does not parse any provider-specific output.
// ──────────────────────────────────────────────────────────────────────────────

import { StreamChunk, StreamChannel } from "./types";
import { StreamError } from "./errors";

export type ChunkHandler = (chunk: StreamChunk) => void;
export type LineHandler = (line: string, channel: StreamChannel) => void;
export type CompletionHandler = (channel: StreamChannel) => void;

/**
 * Processes a single channel (stdout or stderr).
 * Reconstructs complete lines from incoming data buffers.
 * Emits StreamChunk events for every buffer received.
 */
export class ChannelProcessor {
    private buffer = "";
    private byteOffset = 0;
    private sequence = 0;
    private completed = false;

    private readonly chunkHandlers: ChunkHandler[] = [];
    private readonly lineHandlers: LineHandler[] = [];
    private readonly completionHandlers: CompletionHandler[] = [];

    constructor(
        private readonly channel: StreamChannel,
        private readonly requestId: string
    ) { }

    onChunk(handler: ChunkHandler): void { this.chunkHandlers.push(handler); }
    onLine(handler: LineHandler): void { this.lineHandlers.push(handler); }
    onComplete(handler: CompletionHandler): void { this.completionHandlers.push(handler); }

    /**
     * Push raw data from the process stream.
     * Emits chunk events immediately; emits line events for each complete line.
     */
    push(data: Buffer | string): void {
        if (this.completed) {
            throw new StreamError(this.channel, "Cannot push to completed channel", this.requestId);
        }

        const text = typeof data === "string" ? data : data.toString("utf-8");
        const chunk: StreamChunk = {
            channel: this.channel,
            data: text,
            offset: this.byteOffset,
            sequence: this.sequence++,
            timestamp: new Date().toISOString()
        };

        this.byteOffset += Buffer.byteLength(text, "utf-8");
        this.buffer += text;

        // Emit chunk
        for (const h of this.chunkHandlers) {
            try { h(chunk); } catch { }
        }

        // Extract complete lines
        let nl: number;
        while ((nl = this.buffer.indexOf("\n")) !== -1) {
            const line = this.buffer.slice(0, nl).replace(/\r$/, ""); // strip \r for CRLF
            this.buffer = this.buffer.slice(nl + 1);
            for (const h of this.lineHandlers) {
                try { h(line, this.channel); } catch { }
            }
        }
    }

    /** Signal end-of-stream. Flushes remaining partial line if any. */
    complete(): void {
        if (this.completed) return;
        this.completed = true;

        // Flush remaining partial line
        if (this.buffer.length > 0) {
            const line = this.buffer.replace(/\r$/, "");
            for (const h of this.lineHandlers) {
                try { h(line, this.channel); } catch { }
            }
            this.buffer = "";
        }

        for (const h of this.completionHandlers) {
            try { h(this.channel); } catch { }
        }
    }

    get totalBytes(): number { return this.byteOffset; }
    get isCompleted(): boolean { return this.completed; }
}

/**
 * Aggregates stdout and stderr processors.
 * Provides a unified interface for the process runner.
 */
export class StreamProcessor {
    readonly stdout: ChannelProcessor;
    readonly stderr: ChannelProcessor;

    private readonly allChunks: StreamChunk[] = [];
    private stdoutLines: string[] = [];
    private stderrLines: string[] = [];

    constructor(requestId: string) {
        this.stdout = new ChannelProcessor("stdout", requestId);
        this.stderr = new ChannelProcessor("stderr", requestId);

        // Collect all chunks in sequence order
        this.stdout.onChunk(c => this.allChunks.push(c));
        this.stderr.onChunk(c => this.allChunks.push(c));

        this.stdout.onLine(line => this.stdoutLines.push(line));
        this.stderr.onLine(line => this.stderrLines.push(line));
    }

    getStdout(): string { return this.stdoutLines.join("\n") + (this.stdoutLines.length > 0 ? "\n" : ""); }
    getStderr(): string { return this.stderrLines.join("\n") + (this.stderrLines.length > 0 ? "\n" : ""); }

    /** Returns chunks in emission sequence (stdout and stderr interleaved). */
    getChunks(): StreamChunk[] { return [...this.allChunks]; }
}
