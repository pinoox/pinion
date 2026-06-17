import type { AxiosInstance, AxiosProgressEvent, AxiosRequestConfig, AxiosResponse } from 'axios';

export declare const PROTOCOL: 'pinion';
export declare const PROTOCOL_VERSION: 2;
export declare const DEFAULT_BASE_URL: string;
export declare const DEFAULT_STORAGE_KEY: string;
export declare const DEFAULT_PARALLEL: number;
export declare const DEFAULT_CHUNK_THRESHOLD: number;
export declare const DEFAULT_CHUNK_SIZE: number;
export declare const DEFAULT_RETRY: number;
export declare const DEFAULT_RETRY_DELAY_MS: number;

export interface PinionProgress {
    percent: number;
    bytesUploaded: number;
    bytesTotal: number;
    chunkIndex: number | null;
    speed?: number;
    eta?: number | null;
}

export interface PinionStorageAdapter {
    get(key: string): string | null;
    set(key: string, value: string): void;
    remove(key: string): void;
}

export interface PinionUploadOptions {
    onProgress?: (progress: PinionProgress) => void;
    onChunkStart?: (index: number) => void;
    onChunkComplete?: (index: number) => void;
    onError?: (error: PinionError, index: number | null) => void;
    onUploadProgress?: (event: AxiosProgressEvent, index: number) => void;
    chunkSize?: number;
    parallel?: number;
    signal?: AbortSignal;
    retry?: number;
    retryDelayMs?: number;
    destination?: string;
    extensions?: string[] | string;
    fileHash?: string;
    meta?: Record<string, unknown>;
    headers?: Record<string, string>;
    onFileStart?: (file: File, index: number) => void;
    onFileComplete?: (file: File, result: unknown, index: number) => void;
    fileParallel?: number;
    auto?: boolean;
    threshold?: number;
}

export interface PinionClientOptions {
    baseURL?: string;
    storageKey?: string;
    unwrap?: (response: AxiosResponse) => unknown;
    unwrapPreset?: 'pinoox' | 'laravel' | 'flat' | 'raw' | 'default';
    storage?: PinionStorageAdapter;
    headers?: Record<string, string>;
    destination?: string;
    extensions?: string[] | string;
    threshold?: number;
}

export declare class PinionError extends Error {
    code: string;
    details: Record<string, unknown>;
    constructor(code: string, message: string, details?: Record<string, unknown>);
}

export declare function toPinionError(error: unknown, fallbackCode?: string): PinionError;
export declare function sha256Hex(blob: Blob): Promise<string>;
export declare function buildFingerprint(file: File): string;
export declare function shouldUsePinion(file: File, threshold?: number): boolean;
export declare function defaultUnwrap(response: AxiosResponse): unknown;
export declare function unwrapPinoox(response: AxiosResponse): unknown;
export declare function unwrapLaravel(response: AxiosResponse): unknown;
export declare function unwrapFlat(response: AxiosResponse): unknown;
export declare function unwrapRaw(response: AxiosResponse): unknown;
export declare const unwrapPresets: Record<string, (response: AxiosResponse) => unknown>;
export declare function resolveUnwrap(name: string): (response: AxiosResponse) => unknown;
export declare function createLocalStorageAdapter(): PinionStorageAdapter | null;
export declare function createMemoryStorageAdapter(): PinionStorageAdapter;
export declare function createSessionStore(adapter: PinionStorageAdapter | null, storageKey: string): {
    read(): Record<string, unknown>;
    get(fingerprint: string): unknown;
    save(fingerprint: string, session: { id: string; missing_indexes?: number[] }): void;
    clear(fingerprint: string): void;
};

export interface PinionApi {
    init(payload: Record<string, unknown>, config?: AxiosRequestConfig): Promise<unknown>;
    uploadPart(formData: FormData, config?: AxiosRequestConfig): Promise<unknown>;
    complete(uploadId: string, payload?: Record<string, unknown>, config?: AxiosRequestConfig): Promise<unknown>;
    status(uploadId: string, config?: AxiosRequestConfig): Promise<unknown>;
    abort(uploadId: string, config?: AxiosRequestConfig): Promise<unknown>;
}

export interface PinionFileHandle {
    file: File;
    fingerprint(): string;
    needsPinion(threshold?: number): boolean;
    upload(opts?: PinionUploadOptions): Promise<unknown>;
    resume(opts?: PinionUploadOptions): Promise<unknown>;
}

export interface PinionClient {
    buildFingerprint(file: File): string;
    shouldUsePinion(file: File, threshold?: number): boolean;
    upload(file: File, opts?: PinionUploadOptions): Promise<unknown>;
    resume(file: File, opts?: PinionUploadOptions): Promise<unknown>;
    uploadMany(files: File[], opts?: PinionUploadOptions): Promise<unknown[]>;
    for(file: File): PinionFileHandle;
    cancel(): void;
    getStoredSession(fingerprint: string): unknown;
    api: PinionApi;
    getActiveSignal(): AbortSignal | null;
    options: { baseURL: string; threshold: number };
}

export declare function createPinionClient(axios: AxiosInstance, options?: PinionClientOptions): PinionClient;

export declare function createPinionAxios(
    axios: { create(config?: AxiosRequestConfig): AxiosInstance },
    options?: PinionClientOptions & { axiosConfig?: AxiosRequestConfig },
): { axios: AxiosInstance; client: PinionClient };

export declare function uploadFile(
    axios: AxiosInstance,
    file: File,
    options?: PinionClientOptions & PinionUploadOptions,
): Promise<unknown | null>;

export declare function pinion(
    axios: { create(config?: AxiosRequestConfig): AxiosInstance },
    options?: PinionClientOptions & { axiosConfig?: AxiosRequestConfig },
): PinionClient;
