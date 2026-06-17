import { DEFAULT_CHUNK_THRESHOLD } from './constants.js';

/**
 * @param {File} file
 * @returns {string}
 */
export function buildFingerprint(file) {
    return [file.name, file.size, file.lastModified, file.type || ''].join(':');
}

/**
 * @param {File} file
 * @param {number} [threshold]
 * @returns {boolean}
 */
export function shouldUsePinion(file, threshold = DEFAULT_CHUNK_THRESHOLD) {
    return file instanceof File && file.size > threshold;
}
