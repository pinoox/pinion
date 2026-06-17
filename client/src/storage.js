/**
 * @typedef {object} PinionStorageAdapter
 * @property {(key: string) => string|null} get
 * @property {(key: string, value: string) => void} set
 * @property {(key: string) => void} remove
 */

/**
 * @returns {PinionStorageAdapter|null}
 */
export function createLocalStorageAdapter() {
    if (typeof localStorage === 'undefined') {
        return null;
    }

    return {
        get: (key) => localStorage.getItem(key),
        set: (key, value) => localStorage.setItem(key, value),
        remove: (key) => localStorage.removeItem(key),
    };
}

/** @returns {PinionStorageAdapter} */
export function createMemoryStorageAdapter() {
    const map = new Map();

    return {
        get: (key) => map.get(key) ?? null,
        set: (key, value) => { map.set(key, value); },
        remove: (key) => { map.delete(key); },
    };
}

/**
 * @param {PinionStorageAdapter|null} adapter
 * @param {string} storageKey
 */
export function createSessionStore(adapter, storageKey) {
    const storage = adapter ?? createMemoryStorageAdapter();

    return {
        read() {
            try {
                return JSON.parse(storage.get(storageKey) || '{}');
            } catch {
                return {};
            }
        },
        get(fingerprint) {
            return this.read()[fingerprint] ?? null;
        },
        save(fingerprint, session) {
            const map = this.read();
            map[fingerprint] = {
                upload_id: session.id,
                missing_indexes: session.missing_indexes ?? [],
                updated_at: Date.now(),
            };
            storage.set(storageKey, JSON.stringify(map));
        },
        clear(fingerprint) {
            const map = this.read();
            delete map[fingerprint];
            storage.set(storageKey, JSON.stringify(map));
        },
    };
}
