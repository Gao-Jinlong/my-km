// apps/web/src/platform/storage/errors.ts

export class StorageError extends Error {
    constructor(
        message: string,
        public readonly cause?: unknown,
    ) {
        super(message);
        this.name = 'StorageError';
    }
}

export class StorageNotSupportedError extends StorageError {
    constructor(storageType: string) {
        super(`存储类型 "${storageType}" 不支持`);
        this.name = 'StorageNotSupportedError';
    }
}

export class StorageQuotaExceededError extends StorageError {
    constructor(message = '存储空间已满') {
        super(message);
        this.name = 'StorageQuotaExceededError';
    }
}

export class StorageNotInitializedError extends StorageError {
    constructor() {
        super('存储未初始化');
        this.name = 'StorageNotInitializedError';
    }
}

export class StorageSerializationError extends StorageError {
    constructor(
        message: string,
        public readonly value?: unknown,
    ) {
        super(message);
        this.name = 'StorageSerializationError';
    }
}

export class StorageEncryptionError extends StorageError {
    constructor(message: string) {
        super(message);
        this.name = 'StorageEncryptionError';
    }
}
