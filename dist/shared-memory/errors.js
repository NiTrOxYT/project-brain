export class SharedMemoryError extends Error {
    constructor(message) {
        super(message);
        this.name = "SharedMemoryError";
    }
}
export class AgentRegistrationError extends SharedMemoryError {
    constructor(message) {
        super(message);
        this.name = "AgentRegistrationError";
    }
}
export class AssignmentError extends SharedMemoryError {
    constructor(message) {
        super(message);
        this.name = "AssignmentError";
    }
}
export class ConflictError extends SharedMemoryError {
    constructor(message) {
        super(message);
        this.name = "ConflictError";
    }
}
export class ConsensusError extends SharedMemoryError {
    constructor(message) {
        super(message);
        this.name = "ConsensusError";
    }
}
export class MemoryPersistenceError extends SharedMemoryError {
    constructor(message) {
        super(message);
        this.name = "MemoryPersistenceError";
    }
}
export class TimelineError extends SharedMemoryError {
    constructor(message) {
        super(message);
        this.name = "TimelineError";
    }
}
