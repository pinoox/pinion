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
export { createPinionClient } from './createClient.js';

import { createPinionClient } from './createClient.js';

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
 *
 * @param {import('axios').AxiosInstance} axios
 * @param {File} file
 * @param {import('./createClient.js').PinionClientOptions & import('./createClient.js').PinionUploadOptions & { auto?: boolean }} [options]
 * @returns {Promise<unknown|null>} null when auto=true and file is below threshold
 */
export async function uploadFile(axios, file, options = {}) {
    const { auto = false, ...rest } = options;
    const client = createPinionClient(axios, rest);
    const threshold = rest.threshold;

    if (auto && !client.shouldUsePinion(file, threshold)) {
        return null;
    }

    return client.upload(file, rest);
}

/**
 * @param {import('axios').AxiosStatic} axios
 * @param {import('./createClient.js').PinionClientOptions & { axiosConfig?: import('axios').CreateAxiosDefaults }} [options]
 */
export function pinion(axios, options = {}) {
    return createPinionAxios(axios, options).client;
}
