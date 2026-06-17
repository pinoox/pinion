import { PinionError } from './errors.js';

/**
 * @typedef {object} PinionHttpResponse
 * @property {unknown} data
 * @property {number} status
 */

/**
 * @typedef {object} PinionRequestConfig
 * @property {AbortSignal} [signal]
 * @property {Record<string, string>} [headers]
 * @property {(event: { loaded?: number; total?: number; progress?: number }) => void} [onUploadProgress]
 */

/**
 * @typedef {object} PinionTransport
 * @property {'axios'|'fetch'} kind
 * @property {(path: string, config?: PinionRequestConfig) => Promise<unknown>} get
 * @property {(path: string, data: Record<string, unknown>, config?: PinionRequestConfig) => Promise<unknown>} postJson
 * @property {(path: string, formData: FormData, config?: PinionRequestConfig) => Promise<unknown>} postForm
 */

/**
 * @param {unknown} value
 * @returns {value is import('axios').AxiosInstance}
 */
export function isAxiosInstance(value) {
    return value != null
        && typeof value === 'object'
        && typeof /** @type {{ post?: unknown; get?: unknown; postJson?: unknown }} */ (value).post === 'function'
        && typeof /** @type {{ get?: unknown }} */ (value).get === 'function'
        && typeof /** @type {{ postJson?: unknown }} */ (value).postJson !== 'function';
}

/**
 * @param {unknown} value
 * @returns {value is PinionTransport}
 */
export function isPinionTransport(value) {
    return value != null
        && typeof value === 'object'
        && typeof /** @type {{ postJson?: unknown }} */ (value).postJson === 'function'
        && typeof /** @type {{ postForm?: unknown }} */ (value).postForm === 'function'
        && typeof /** @type {{ get?: unknown }} */ (value).get === 'function';
}

/**
 * @param {unknown} value
 */
export function isAxiosStatic(value) {
    return value != null
        && typeof value === 'object'
        && typeof /** @type {{ create?: unknown }} */ (value).create === 'function'
        && !isAxiosInstance(value);
}

/**
 * @param {string} baseURL
 * @param {Record<string, string>} [defaultHeaders]
 * @param {PinionRequestConfig} [config]
 */
function mergeHeaders(baseURL, defaultHeaders = {}, config = {}) {
    return {
        ...defaultHeaders,
        ...(config.headers ?? {}),
    };
}

/**
 * @param {string} baseURL
 * @param {string} path
 */
function joinUrl(baseURL, path) {
    const root = baseURL.replace(/\/$/, '');
    const suffix = path.startsWith('/') ? path : `/${path}`;
    return `${root}${suffix}`;
}

/**
 * @param {import('axios').AxiosInstance} axios
 * @param {string} baseURL
 * @param {{ unwrap: (response: PinionHttpResponse) => unknown, headers?: Record<string, string> }} options
 * @returns {PinionTransport}
 */
export function createAxiosTransport(axios, baseURL, options) {
    const defaultHeaders = options.headers ?? {};
    const unwrap = options.unwrap;

    /**
     * @param {import('axios').AxiosRequestConfig} [config]
     */
    function toAxiosConfig(config = {}) {
        return {
            ...config,
            headers: mergeHeaders(baseURL, defaultHeaders, config),
        };
    }

    return {
        kind: 'axios',
        async get(path, config = {}) {
            try {
                const response = await axios.get(joinUrl(baseURL, path), toAxiosConfig(config));
                return unwrap(response);
            } catch (error) {
                throw normalizeHttpError(error);
            }
        },
        async postJson(path, data, config = {}) {
            try {
                const response = await axios.post(joinUrl(baseURL, path), data, toAxiosConfig({
                    ...config,
                    headers: {
                        'Content-Type': 'application/json',
                        Accept: 'application/json',
                        ...(config.headers ?? {}),
                    },
                }));
                return unwrap(response);
            } catch (error) {
                throw normalizeHttpError(error);
            }
        },
        async postForm(path, formData, config = {}) {
            try {
                const response = await axios.post(joinUrl(baseURL, path), formData, toAxiosConfig(config));
                return unwrap(response);
            } catch (error) {
                throw normalizeHttpError(error);
            }
        },
    };
}

/**
 * @param {{ baseURL: string, fetch?: typeof fetch, unwrap: (response: PinionHttpResponse) => unknown, headers?: Record<string, string> }} options
 * @returns {PinionTransport}
 */
export function createFetchTransport(options) {
    const fetchFn = options.fetch ?? globalThis.fetch;
    if (typeof fetchFn !== 'function') {
        throw new PinionError(
            'PINION_NO_FETCH',
            'fetch is not available in this environment. Pass options.fetch or use Axios.',
        );
    }

    const defaultHeaders = options.headers ?? {};
    const unwrap = options.unwrap;
    const baseURL = options.baseURL;

    /**
     * @param {Response} response
     */
    async function parseResponse(response) {
        const contentType = response.headers.get('content-type') ?? '';
        let data = null;

        if (contentType.includes('application/json')) {
            data = await response.json();
        } else {
            const text = await response.text();
            data = text.length ? text : null;
        }

        if (!response.ok) {
            throw new PinionError('PINION_HTTP_ERROR', `HTTP ${response.status}`, {
                status: response.status,
                body: data,
            });
        }

        return unwrap({ data, status: response.status });
    }

    return {
        kind: 'fetch',
        async get(path, config = {}) {
            const response = await fetchFn(joinUrl(baseURL, path), {
                method: 'GET',
                headers: mergeHeaders(baseURL, defaultHeaders, config),
                signal: config.signal,
            });

            return parseResponse(response);
        },
        async postJson(path, data, config = {}) {
            const response = await fetchFn(joinUrl(baseURL, path), {
                method: 'POST',
                headers: mergeHeaders(baseURL, defaultHeaders, {
                    ...config,
                    headers: {
                        'Content-Type': 'application/json',
                        Accept: 'application/json',
                        ...(config.headers ?? {}),
                    },
                }),
                body: JSON.stringify(data),
                signal: config.signal,
            });

            return parseResponse(response);
        },
        async postForm(path, formData, config = {}) {
            const response = await fetchFn(joinUrl(baseURL, path), {
                method: 'POST',
                headers: mergeHeaders(baseURL, defaultHeaders, config),
                body: formData,
                signal: config.signal,
            });

            return parseResponse(response);
        },
    };
}

/**
 * @param {unknown} error
 */
function normalizeHttpError(error) {
    if (error instanceof PinionError) {
        return error;
    }

    if (error && typeof error === 'object' && 'response' in error) {
        const err = /** @type {{ message?: string; response?: { status?: number; data?: unknown } }} */ (error);
        if (err.response) {
            return new PinionError('PINION_HTTP_ERROR', err.message ?? 'Request failed', {
                status: err.response.status,
                body: err.response.data,
            });
        }
    }

    return error;
}
