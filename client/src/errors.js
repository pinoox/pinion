export class PinionError extends Error {
    /**
     * @param {string} code
     * @param {string} message
     * @param {Record<string, unknown>} [details]
     */
    constructor(code, message, details = {}) {
        super(message);
        this.name = 'PinionError';
        this.code = code;
        this.details = details;
    }
}

/**
 * @param {unknown} error
 * @param {string} fallbackCode
 */
export function toPinionError(error, fallbackCode = 'PINION_CLIENT_ERROR') {
    if (error instanceof PinionError) {
        return error;
    }

    if (error && typeof error === 'object' && 'code' in error) {
        const err = /** @type {{ code?: string; message?: string; details?: Record<string, unknown> }} */ (error);
        return new PinionError(err.code ?? fallbackCode, err.message ?? fallbackCode, err.details ?? {});
    }

    const message = error instanceof Error ? error.message : String(error);
    return new PinionError(fallbackCode, message);
}
