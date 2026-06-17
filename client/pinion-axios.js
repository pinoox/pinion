/**
 * Pinion browser client for Axios.
 *
 * Usage:
 *   import axios from 'axios';
 *   import { createPinionClient } from 'pinoox/pinion/client/pinion-axios.js';
 *
 *   const pinion = createPinionClient(axios, { baseURL: '/api/pinion' });
 *   await pinion.upload(file, { onProgress: (p) => console.log(p) });
 */

const DEFAULT_PARALLEL = 2;
const DEFAULT_CHUNK_THRESHOLD = 8 * 1024 * 1024;

/**
 * @param {import('axios').AxiosInstance} axios
 * @param {object} [options]
 * @param {string} [options.baseURL='/api/pinion']
 * @param {string} [options.storageKey='pinion_sessions']
 * @param {(response: any) => any} [options.unwrap] unwrap API envelope
 */
export function createPinionClient(axios, options = {}) {
    const baseURL = (options.baseURL ?? '/api/pinion').replace(/\/$/, '');
    const storageKey = options.storageKey ?? 'pinion_sessions';
    const unwrap = options.unwrap ?? defaultUnwrap;

    return {
        buildFingerprint,
        shouldUsePinion,
        upload,
        api: {
            init: (payload, config) => postJson('/init', payload, config),
            uploadPart: (formData, config) => postMultipart('/upload', formData, config),
            complete: (uploadId, config) => postJson('/complete', { upload_id: uploadId }, config),
            status: (uploadId, config) => axios.get(`${baseURL}/status/${uploadId}`, config).then(unwrap),
            abort: (uploadId, config) => postJson(`/abort/${uploadId}`, {}, config),
        },
    };

    async function postJson(path, data, config = {}) {
        const response = await axios.post(`${baseURL}${path}`, data, {
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            ...config,
        });
        return unwrap(response);
    }

    async function postMultipart(path, formData, config = {}) {
        const response = await axios.post(`${baseURL}${path}`, formData, {
            ...config,
            // Let Axios set multipart boundary — do not set Content-Type manually.
        });
        return unwrap(response);
    }

    function readStoredSessions() {
        try {
            return JSON.parse(localStorage.getItem(storageKey) || '{}');
        } catch {
            return {};
        }
    }

    function storeSession(fingerprint, session) {
        const map = readStoredSessions();
        map[fingerprint] = {
            upload_id: session.id,
            missing_indexes: session.missing_indexes ?? [],
            updated_at: Date.now(),
        };
        localStorage.setItem(storageKey, JSON.stringify(map));
    }

    function clearStoredSession(fingerprint) {
        const map = readStoredSessions();
        delete map[fingerprint];
        localStorage.setItem(storageKey, JSON.stringify(map));
    }

    /**
     * @param {File} file
     * @param {object} [opts]
     * @param {(percent: number) => void} [opts.onProgress]
     * @param {number} [opts.chunkSize]
     * @param {number} [opts.parallel]
     * @param {AbortSignal} [opts.signal]
     */
    async function upload(file, opts = {}) {
        const fingerprint = buildFingerprint(file);
        const parallel = Math.max(1, opts.parallel ?? DEFAULT_PARALLEL);
        const axiosConfig = opts.signal ? { signal: opts.signal } : {};

        const initData = await postJson('/init', {
            filename: file.name,
            size: file.size,
            mime: file.type || null,
            chunk_size: opts.chunkSize,
            fingerprint,
        }, axiosConfig);

        const session = initData?.session ?? initData;
        if (!session?.id) {
            throw new Error('pinion_init_failed');
        }

        storeSession(fingerprint, session);

        const size = session.chunk_size || opts.chunkSize || 5 * 1024 * 1024;
        const indexes = session.missing_indexes?.length
            ? [...session.missing_indexes]
            : Array.from({ length: session.total_chunks || Math.ceil(file.size / size) }, (_, i) => i);

        let uploadedBytes = session.bytes_received || 0;
        const queue = [...indexes];

        const workers = Array.from({ length: parallel }, async () => {
            while (queue.length) {
                const index = queue.shift();
                const start = index * size;
                const end = Math.min(start + size, file.size);
                const blob = file.slice(start, end);
                const formData = new FormData();
                formData.append('upload_id', session.id);
                formData.append('index', String(index));
                formData.append('chunk_hash', await sha256Hex(blob));
                formData.append('chunk', blob, `${file.name}.part`);

                await postMultipart('/upload', formData, axiosConfig);

                uploadedBytes += blob.size;
                if (opts.onProgress) {
                    opts.onProgress(Math.min(100, Math.round((uploadedBytes / file.size) * 100)));
                }
            }
        });

        await Promise.all(workers);

        const result = await postJson('/complete', { upload_id: session.id }, axiosConfig);
        clearStoredSession(fingerprint);

        return result;
    }
}

export function buildFingerprint(file) {
    return [file.name, file.size, file.lastModified, file.type || ''].join(':');
}

export function shouldUsePinion(file, threshold = DEFAULT_CHUNK_THRESHOLD) {
    return file instanceof File && file.size > threshold;
}

async function sha256Hex(blob) {
    const buffer = await blob.arrayBuffer();
    const hash = await crypto.subtle.digest('SHA-256', buffer);
    return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Supports Laravel, Pinoox ApiResponse, or flat JSON bodies. */
function defaultUnwrap(response) {
    const body = response?.data;
    if (body == null) {
        return null;
    }
    if (typeof body === 'object' && 'data' in body && body.data !== undefined) {
        return body.data;
    }
    return body;
}
