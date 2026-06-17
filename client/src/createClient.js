import {
    DEFAULT_BASE_URL,
    DEFAULT_CHUNK_SIZE,
    DEFAULT_CHUNK_THRESHOLD,
    DEFAULT_PARALLEL,
    DEFAULT_RETRY,
    DEFAULT_RETRY_DELAY_MS,
    DEFAULT_STORAGE_KEY,
} from './constants.js';
import { sha256Hex } from './checksum.js';
import { buildFingerprint, shouldUsePinion } from './fingerprint.js';
import { PinionError, toPinionError } from './errors.js';
import { createSessionStore } from './storage.js';
import { defaultUnwrap } from './unwrap.js';
import { resolveUnwrap } from './unwrapPresets.js';
import { emitProgress, resetProgressTracker } from './progress.js';
import {
    createAxiosTransport,
    createFetchTransport,
    isAxiosInstance,
    isPinionTransport,
} from './transport.js';

/**
 * @typedef {import('./transport.js').PinionRequestConfig} PinionRequestConfig
 * @typedef {import('./transport.js').PinionTransport} PinionTransport
 */

/**
 * @typedef {object} PinionProgress
 * @property {number} percent
 * @property {number} bytesUploaded
 * @property {number} bytesTotal
 * @property {number|null} chunkIndex
 * @property {number} [speed] bytes per second
 * @property {number|null} [eta] seconds remaining
 */

/**
 * @typedef {object} PinionUploadOptions
 * @property {(progress: PinionProgress) => void} [onProgress]
 * @property {(index: number) => void} [onChunkStart]
 * @property {(index: number) => void} [onChunkComplete]
 * @property {(error: PinionError, index: number|null) => void} [onError]
 * @property {(event: { loaded?: number; total?: number; progress?: number }, index: number) => void} [onUploadProgress]
 * @property {number} [chunkSize]
 * @property {number} [parallel]
 * @property {AbortSignal} [signal]
 * @property {number} [retry]
 * @property {number} [retryDelayMs]
 * @property {string} [destination]
 * @property {string[]|string} [extensions]
 * @property {string} [fileHash]
 * @property {Record<string, unknown>} [meta]
 * @property {Record<string, string>} [headers]
 */

/**
 * @typedef {object} PinionClientOptions
 * @property {string} [baseURL]
 * @property {string} [storageKey]
 * @property {(response: { data?: unknown }) => unknown} [unwrap]
 * @property {'pinoox'|'laravel'|'flat'|'raw'|'default'} [unwrapPreset]
 * @property {import('./storage.js').PinionStorageAdapter} [storage]
 * @property {Record<string, string>} [headers]
 * @property {string} [destination]
 * @property {string[]|string} [extensions]
 * @property {number} [threshold] default shouldUsePinion threshold
 * @property {PinionTransport} [transport] custom HTTP transport
 * @property {typeof fetch} [fetch] fetch implementation (default: globalThis.fetch)
 */

/**
 * @param {import('axios').AxiosInstance | PinionClientOptions} [arg1]
 * @param {PinionClientOptions} [arg2]
 */
export function createPinionClient(arg1, arg2) {
    let options = {};
    let transport;

    if (isAxiosInstance(arg1)) {
        options = arg2 ?? {};
        const baseURL = (options.baseURL ?? DEFAULT_BASE_URL).replace(/\/$/, '');
        const unwrap = options.unwrap
            ?? (options.unwrapPreset ? resolveUnwrap(options.unwrapPreset) : defaultUnwrap);
        transport = createAxiosTransport(arg1, baseURL, {
            unwrap,
            headers: options.headers,
        });
    } else {
        options = arg1 ?? {};
        const baseURL = (options.baseURL ?? DEFAULT_BASE_URL).replace(/\/$/, '');
        const unwrap = options.unwrap
            ?? (options.unwrapPreset ? resolveUnwrap(options.unwrapPreset) : defaultUnwrap);

        if (isPinionTransport(options.transport)) {
            transport = options.transport;
        } else {
            transport = createFetchTransport({
                baseURL,
                fetch: options.fetch,
                unwrap,
                headers: options.headers,
            });
        }
    }

    const baseURL = (options.baseURL ?? DEFAULT_BASE_URL).replace(/\/$/, '');
    const sessionStore = createSessionStore(options.storage ?? null, options.storageKey ?? DEFAULT_STORAGE_KEY);
    const defaultHeaders = options.headers ?? {};
    const defaultDestination = options.destination;
    const defaultExtensions = options.extensions;
    const defaultThreshold = options.threshold ?? DEFAULT_CHUNK_THRESHOLD;

    let activeController = null;

    const api = {
        init: (payload, config) => transport.postJson('/init', payload, config),
        uploadPart: (formData, config) => transport.postForm('/upload', formData, config),
        complete: (uploadId, payload = {}, config) => transport.postJson('/complete', { upload_id: uploadId, ...payload }, config),
        status: (uploadId, config) => transport.get(`/status/${uploadId}`, config),
        abort: (uploadId, config) => transport.postJson(`/abort/${uploadId}`, {}, config),
    };

    const client = {
        buildFingerprint,
        shouldUsePinion: (file, threshold = defaultThreshold) => shouldUsePinion(file, threshold),
        upload,
        resume,
        uploadMany,
        for: forFile,
        cancel,
        getStoredSession,
        api,
        getActiveSignal: () => activeController?.signal ?? null,
        transport,
        options: { baseURL, threshold: defaultThreshold },
    };

    return client;

    /**
     * Fluent entry — pinion.for(file).upload()
     * @param {File} file
     */
    function forFile(file) {
        return {
            file,
            fingerprint: () => buildFingerprint(file),
            needsPinion: (threshold = defaultThreshold) => shouldUsePinion(file, threshold),
            upload: (opts = {}) => upload(file, opts),
            resume: (opts = {}) => resume(file, opts),
        };
    }

    /**
     * @param {File} file
     * @param {PinionUploadOptions} [opts]
     */
    async function upload(file, opts = {}) {
        return resume(file, opts);
    }

    /**
     * @param {File} file
     * @param {PinionUploadOptions} [opts]
     */
    async function resume(file, opts = {}) {
        const fingerprint = buildFingerprint(file);
        const parallel = Math.max(1, opts.parallel ?? DEFAULT_PARALLEL);
        const retry = Math.max(0, opts.retry ?? DEFAULT_RETRY);
        const retryDelayMs = opts.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;

        activeController = new AbortController();
        const signal = opts.signal;
        if (signal) {
            signal.addEventListener('abort', () => activeController?.abort(), { once: true });
        }

        const requestConfig = mergeRequestConfig({ signal: activeController.signal }, opts.headers);

        try {
            resetProgressTracker();

            const initPayload = {
                filename: file.name,
                size: file.size,
                mime: file.type || null,
                chunk_size: opts.chunkSize,
                fingerprint,
                destination: opts.destination ?? defaultDestination,
                extensions: opts.extensions ?? defaultExtensions,
                file_hash: opts.fileHash,
                meta: opts.meta ?? {},
            };

            const initData = await withRetry(
                () => api.init(stripUndefined(initPayload), requestConfig),
                retry,
                retryDelayMs,
                opts.onError,
                null,
            );

            const session = normalizeSession(initData);
            if (!session?.id) {
                throw new PinionError('PINION_INIT_FAILED', 'Pinion init did not return a session id.');
            }

            sessionStore.save(fingerprint, session);

            const size = session.chunk_size || opts.chunkSize || DEFAULT_CHUNK_SIZE;
            const indexes = session.missing_indexes?.length
                ? [...session.missing_indexes]
                : Array.from({ length: session.total_chunks || Math.ceil(file.size / size) }, (_, i) => i);

            let uploadedBytes = session.bytes_received || 0;
            emitProgress(opts.onProgress, uploadedBytes, file.size, null);

            const queue = [...indexes];

            const workers = Array.from({ length: parallel }, async () => {
                while (queue.length) {
                    const index = queue.shift();
                    if (index === undefined) {
                        break;
                    }

                    opts.onChunkStart?.(index);

                    await withRetry(
                        () => uploadChunk(file, session, index, size, requestConfig, opts),
                        retry,
                        retryDelayMs,
                        opts.onError,
                        index,
                    );

                    const chunkBytes = Math.min(size, file.size - index * size);
                    uploadedBytes += chunkBytes;

                    opts.onChunkComplete?.(index);
                    emitProgress(opts.onProgress, uploadedBytes, file.size, index);
                }
            });

            await Promise.all(workers);

            const result = await withRetry(
                () => api.complete(session.id, stripUndefined({ file_hash: opts.fileHash }), requestConfig),
                retry,
                retryDelayMs,
                opts.onError,
                null,
            );

            sessionStore.clear(fingerprint);
            return result;
        } catch (error) {
            throw toPinionError(error);
        } finally {
            activeController = null;
        }
    }

    /**
     * @param {File[]} files
     * @param {PinionUploadOptions & { onFileStart?: (file: File, index: number) => void, onFileComplete?: (file: File, result: unknown, index: number) => void, fileParallel?: number }} [opts]
     */
    async function uploadMany(files, opts = {}) {
        const results = [];
        const fileParallel = Math.max(1, opts.fileParallel ?? 1);

        if (fileParallel === 1) {
            for (let i = 0; i < files.length; i++) {
                const file = files[i];
                opts.onFileStart?.(file, i);
                const result = await upload(file, opts);
                results.push(result);
                opts.onFileComplete?.(file, result, i);
            }
            return results;
        }

        const queue = files.map((file, index) => ({ file, index }));
        const out = new Array(files.length);

        await Promise.all(Array.from({ length: fileParallel }, async () => {
            while (queue.length) {
                const item = queue.shift();
                if (!item) {
                    break;
                }
                opts.onFileStart?.(item.file, item.index);
                const result = await upload(item.file, opts);
                out[item.index] = result;
                opts.onFileComplete?.(item.file, result, item.index);
            }
        }));

        return out;
    }

    function cancel() {
        activeController?.abort();
    }

    /**
     * @param {string} fingerprint
     */
    function getStoredSession(fingerprint) {
        return sessionStore.get(fingerprint);
    }

    /**
     * @param {File} file
     * @param {object} session
     * @param {number} index
     * @param {number} size
     * @param {PinionRequestConfig} requestConfig
     * @param {PinionUploadOptions} opts
     */
    async function uploadChunk(file, session, index, size, requestConfig, opts) {
        const start = index * size;
        const end = Math.min(start + size, file.size);
        const blob = file.slice(start, end);
        const formData = new FormData();
        formData.append('upload_id', session.id);
        formData.append('index', String(index));
        formData.append('chunk_hash', await sha256Hex(blob));
        formData.append('chunk', blob, `${file.name}.part`);

        const uploadConfig = { ...requestConfig };

        if (transport.kind === 'axios' && opts.onUploadProgress) {
            uploadConfig.onUploadProgress = (event) => opts.onUploadProgress?.(event, index);
        }

        await transport.postForm('/upload', formData, uploadConfig);
    }

    /**
     * @param {PinionRequestConfig} [config]
     * @param {Record<string, string>} [extraHeaders]
     */
    function mergeRequestConfig(config = {}, extraHeaders = {}) {
        return {
            ...config,
            headers: {
                ...defaultHeaders,
                ...extraHeaders,
                ...(config.headers ?? {}),
            },
        };
    }
}

/**
 * @param {unknown} initData
 */
function normalizeSession(initData) {
    if (!initData || typeof initData !== 'object') {
        return null;
    }

    const data = /** @type {Record<string, unknown>} */ (initData);
    if (data.session && typeof data.session === 'object') {
        return /** @type {Record<string, unknown>} */ (data.session);
    }

    return data;
}

/**
 * @param {Record<string, unknown>} payload
 */
function stripUndefined(payload) {
    return Object.fromEntries(Object.entries(payload).filter(([, value]) => value !== undefined && value !== null));
}

/**
 * @template T
 * @param {() => Promise<T>} fn
 * @param {number} retry
 * @param {number} delayMs
 * @param {(error: PinionError, index: number|null) => void} [onError]
 * @param {number|null} index
 * @returns {Promise<T>}
 */
async function withRetry(fn, retry, delayMs, onError, index) {
    let lastError;

    for (let attempt = 0; attempt <= retry; attempt++) {
        try {
            return await fn();
        } catch (error) {
            lastError = toPinionError(error);
            onError?.(lastError, index);

            if (attempt >= retry) {
                break;
            }

            await sleep(delayMs * (attempt + 1));
        }
    }

    throw lastError;
}

/**
 * @param {number} ms
 */
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
