/**
 * Supports Laravel, Pinoox ApiResponse, or flat JSON bodies.
 *
 * @param {{ data?: unknown }} response
 * @returns {unknown}
 */
export function defaultUnwrap(response) {
    const body = response?.data;
    if (body == null) {
        return null;
    }
    if (typeof body === 'object' && 'data' in body && body.data !== undefined) {
        return body.data;
    }
    return body;
}
