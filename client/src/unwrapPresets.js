/**
 * @param {import('axios').AxiosResponse} response
 */
export function unwrapPinoox(response) {
    const body = response?.data;
    if (body && typeof body === 'object' && 'data' in body) {
        return body.data;
    }
    return body ?? null;
}

/**
 * @param {import('axios').AxiosResponse} response
 */
export function unwrapLaravel(response) {
    return unwrapPinoox(response);
}

/**
 * @param {import('axios').AxiosResponse} response
 */
export function unwrapFlat(response) {
    return response?.data ?? null;
}

/**
 * @param {import('axios').AxiosResponse} response
 */
export function unwrapRaw(response) {
    return response;
}

export const unwrapPresets = {
    pinoox: unwrapPinoox,
    laravel: unwrapLaravel,
    flat: unwrapFlat,
    raw: unwrapRaw,
    default: unwrapFlat,
};

/**
 * @param {'pinoox'|'laravel'|'flat'|'raw'|'default'} name
 */
export function resolveUnwrap(name) {
    return unwrapPresets[name] ?? unwrapPresets.default;
}
