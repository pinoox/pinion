export {
    PROTOCOL,
    PROTOCOL_VERSION,
    DEFAULT_BASE_URL,
    DEFAULT_STORAGE_KEY,
    DEFAULT_PARALLEL,
    DEFAULT_CHUNK_THRESHOLD,
    DEFAULT_CHUNK_SIZE,
    DEFAULT_RETRY,
    DEFAULT_RETRY_DELAY_MS,
} from './constants.js';

export { PinionError, toPinionError } from './errors.js';
export { sha256Hex } from './checksum.js';
export { buildFingerprint, shouldUsePinion } from './fingerprint.js';
export { defaultUnwrap } from './unwrap.js';
export {
    unwrapPinoox,
    unwrapLaravel,
    unwrapFlat,
    unwrapRaw,
    unwrapPresets,
    resolveUnwrap,
} from './unwrapPresets.js';
export {
    createLocalStorageAdapter,
    createMemoryStorageAdapter,
    createSessionStore,
} from './storage.js';
export {
    createAxiosTransport,
    createFetchTransport,
    isAxiosInstance,
    isAxiosStatic,
    isPinionTransport,
} from './transport.js';
export { createPinionClient } from './createClient.js';

import { createPinionClient } from './createClient.js';
import { isAxiosInstance, isAxiosStatic } from './transport.js';

/**
 * Create a Pinion client using native fetch (no Axios required).
 *
 * @param {import('./createClient.js').PinionClientOptions} [options]
 */
export function createPinionFetch(options = {}) {
    return createPinionClient(options);
}

/**
 * Create an Axios instance + Pinion client in one call.
 *
 * @param {import('axios').AxiosStatic} axios
 * @param {import('./createClient.js').PinionClientOptions & { axiosConfig?: import('axios').CreateAxiosDefaults }} [options]
 */
export function createPinionAxios(axios, options = {}) {
    const { axiosConfig, ...clientOptions } = options;
    const instance = axios.create(axiosConfig ?? {});

    return {
        axios: instance,
        client: createPinionClient(instance, clientOptions),
    };
}

/**
 * Simplest API — one function upload.
 * Works with or without Axios:
 * - `uploadFile(file, options)` — uses fetch
 * - `uploadFile(axios, file, options)` — uses Axios (legacy)
 *
 * @param {import('axios').AxiosInstance | File} arg1
 * @param {File | (import('./createClient.js').PinionClientOptions & import('./createClient.js').PinionUploadOptions & { auto?: boolean })} [arg2]
 * @param {import('./createClient.js').PinionClientOptions & import('./createClient.js').PinionUploadOptions & { auto?: boolean }} [arg3]
 * @returns {Promise<unknown|null>} null when auto=true and file is below threshold
 */
export async function uploadFile(arg1, arg2, arg3) {
    let file;
    let options;
    let client;

    if (isAxiosInstance(arg1)) {
        file = /** @type {File} */ (arg2);
        options = arg3 ?? {};
        client = createPinionClient(arg1, options);
    } else {
        file = /** @type {File} */ (arg1);
        options = arg2 ?? {};
        client = createPinionClient(options);
    }

    const { auto = false, ...rest } = options;
    const threshold = rest.threshold;

    if (auto && !client.shouldUsePinion(file, threshold)) {
        return null;
    }

    return client.upload(file, rest);
}

/**
 * Factory — fetch by default, Axios when passed.
 * - `pinion(options)` — fetch transport
 * - `pinion(axios, options)` — Axios transport
 * - `pinion(axiosInstance, options)` — existing Axios instance
 *
 * @param {import('axios').AxiosStatic | import('axios').AxiosInstance | import('./createClient.js').PinionClientOptions} [arg1]
 * @param {import('./createClient.js').PinionClientOptions & { axiosConfig?: import('axios').CreateAxiosDefaults }} [arg2]
 */
export function pinion(arg1, arg2) {
    if (isAxiosStatic(arg1)) {
        return createPinionAxios(arg1, arg2).client;
    }

    if (isAxiosInstance(arg1)) {
        return createPinionClient(arg1, arg2);
    }

    return createPinionClient(arg1 ?? {});
}
