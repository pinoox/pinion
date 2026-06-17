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

export interface PinionHttpResponse {
    data?: unknown;
    status?: number;
}

export interface PinionRequestConfig {
    signal?: AbortSignal;
    headers?: Record<string, string>;
    onUploadProgress?: (event: AxiosProgressEvent | { loaded?: number; total?: number; progress?: number }) => void;
}

export interface PinionTransport {
    kind: 'axios' | 'fetch';
    get(path: string, config?: PinionRequestConfig): Promise<unknown>;
    postJson(path: string, data: Record<string, unknown>, config?: PinionRequestConfig): Promise<unknown>;
    postForm(path: string, formData: FormData, config?: PinionRequestConfig): Promise<unknown>;
}

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
    onUploadProgress?: (event: AxiosProgressEvent | { loaded?: number; total?: number; progress?: number }, index: number) => void;
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
    unwrap?: (response: PinionHttpResponse | AxiosResponse) => unknown;
    unwrapPreset?: 'pinoox' | 'laravel' | 'flat' | 'raw' | 'default';
    storage?: PinionStorageAdapter;
    headers?: Record<string, string>;
    destination?: string;
    extensions?: string[] | string;
    threshold?: number;
    transport?: PinionTransport;
    fetch?: typeof fetch;
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
export declare function defaultUnwrap(response: PinionHttpResponse | AxiosResponse): unknown;
export declare function unwrapPinoox(response: PinionHttpResponse | AxiosResponse): unknown;
export declare function unwrapLaravel(response: PinionHttpResponse | AxiosResponse): unknown;
export declare function unwrapFlat(response: PinionHttpResponse | AxiosResponse): unknown;
export declare function unwrapRaw(response: PinionHttpResponse | AxiosResponse): unknown;
export declare const unwrapPresets: Record<string, (response: PinionHttpResponse | AxiosResponse) => unknown>;
export declare function resolveUnwrap(name: string): (response: PinionHttpResponse | AxiosResponse) => unknown;
export declare function createLocalStorageAdapter(): PinionStorageAdapter | null;
export declare function createMemoryStorageAdapter(): PinionStorageAdapter;
export declare function createSessionStore(adapter: PinionStorageAdapter | null, storageKey: string): {
    read(): Record<string, unknown>;
    get(fingerprint: string): unknown;
    save(fingerprint: string, session: { id: string; missing_indexes?: number[] }): void;
    clear(fingerprint: string): void;
};

export declare function isAxiosInstance(value: unknown): value is AxiosInstance;
export declare function isAxiosStatic(value: unknown): boolean;
export declare function isPinionTransport(value: unknown): value is PinionTransport;
export declare function createAxiosTransport(
    axios: AxiosInstance,
    baseURL: string,
    options: { unwrap: (response: PinionHttpResponse | AxiosResponse) => unknown; headers?: Record<string, string> },
): PinionTransport;
export declare function createFetchTransport(options: {
    baseURL: string;
    fetch?: typeof fetch;
    unwrap: (response: PinionHttpResponse) => unknown;
    headers?: Record<string, string>;
}): PinionTransport;

export interface PinionApi {
    init(payload: Record<string, unknown>, config?: PinionRequestConfig): Promise<unknown>;
    uploadPart(formData: FormData, config?: PinionRequestConfig): Promise<unknown>;
    complete(uploadId: string, payload?: Record<string, unknown>, config?: PinionRequestConfig): Promise<unknown>;
    status(uploadId: string, config?: PinionRequestConfig): Promise<unknown>;
    abort(uploadId: string, config?: PinionRequestConfig): Promise<unknown>;
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
    transport: PinionTransport;
    options: { baseURL: string; threshold: number };
}

export declare function createPinionClient(axios: AxiosInstance, options?: PinionClientOptions): PinionClient;
export declare function createPinionClient(options?: PinionClientOptions): PinionClient;

export declare function createPinionFetch(options?: PinionClientOptions): PinionClient;

export declare function createPinionAxios(
    axios: { create(config?: AxiosRequestConfig): AxiosInstance },
    options?: PinionClientOptions & { axiosConfig?: AxiosRequestConfig },
): { axios: AxiosInstance; client: PinionClient };

export declare function uploadFile(
    file: File,
    options?: PinionClientOptions & PinionUploadOptions,
): Promise<unknown | null>;
export declare function uploadFile(
    axios: AxiosInstance,
    file: File,
    options?: PinionClientOptions & PinionUploadOptions,
): Promise<unknown | null>;

export declare function pinion(options?: PinionClientOptions): PinionClient;
export declare function pinion(
    axios: { create(config?: AxiosRequestConfig): AxiosInstance },
    options?: PinionClientOptions & { axiosConfig?: AxiosRequestConfig },
): PinionClient;
export declare function pinion(axios: AxiosInstance, options?: PinionClientOptions): PinionClient;
