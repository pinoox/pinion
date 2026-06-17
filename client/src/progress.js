/**
 * @typedef {import('./createClient.js').PinionProgress} PinionProgress
 */

let progressAnchor = { bytes: 0, time: Date.now() };

/**
 * Reset speed/ETA tracking at upload start.
 */
export function resetProgressTracker() {
    progressAnchor = { bytes: 0, time: Date.now() };
}

/**
 * @param {(progress: PinionProgress) => void} [onProgress]
 * @param {number} bytesUploaded
 * @param {number} bytesTotal
 * @param {number|null} chunkIndex
 */
export function emitProgress(onProgress, bytesUploaded, bytesTotal, chunkIndex) {
    if (!onProgress) {
        return;
    }

    const now = Date.now();
    const elapsedSec = Math.max(0.001, (now - progressAnchor.time) / 1000);
    const deltaBytes = Math.max(0, bytesUploaded - progressAnchor.bytes);
    const speed = deltaBytes / elapsedSec;

    progressAnchor = { bytes: bytesUploaded, time: now };

    const remainingBytes = Math.max(0, bytesTotal - bytesUploaded);
    const eta = speed > 0 ? Math.round(remainingBytes / speed) : null;

    onProgress({
        percent: bytesTotal > 0 ? Math.min(100, Math.round((bytesUploaded / bytesTotal) * 100)) : 0,
        bytesUploaded,
        bytesTotal,
        chunkIndex,
        speed: Math.round(speed),
        eta,
    });
}
