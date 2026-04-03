import { APP_DB_NAME, APP_DB_VERSION, APP_DB_STORES } from "./state.js";

/**
 * Open the application IndexedDB database and create required object stores.
 *
 * Parameters:
 * - None.
 *
 * Returns:
 * - Promise<IDBDatabase>: Resolves with an opened database handle.
 *
 * Raises:
 * - Error: Raised when IndexedDB is unavailable or the open request fails.
 */
export function openAppDb() {
    if (!("indexedDB" in window)) {
        return Promise.reject(new Error("Browser does not support IndexedDB."));
    }

    return new Promise((resolve, reject) => {
        const request = window.indexedDB.open(APP_DB_NAME, APP_DB_VERSION);

        request.onupgradeneeded = () => {
            const database = request.result;

            if (!database.objectStoreNames.contains(APP_DB_STORES.runs)) {
                database.createObjectStore(APP_DB_STORES.runs, { keyPath: "key" });
            }

            if (!database.objectStoreNames.contains(APP_DB_STORES.bundles)) {
                database.createObjectStore(APP_DB_STORES.bundles, { keyPath: "runId" });
            }
        };

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error || new Error("Failed to open IndexedDB."));
    });
}

/**
 * Read one record from a specific IndexedDB store by key.
 *
 * Parameters:
 * - storeName (string): The object store name.
 * - key (IDBValidKey): Primary key for the requested record.
 *
 * Returns:
 * - Promise<any>: Resolves with the record value or undefined when not found.
 *
 * Raises:
 * - Error: Raised when database operations fail.
 */
export async function readDbRecord(storeName, key) {
    const database = await openAppDb();

    return new Promise((resolve, reject) => {
        const transaction = database.transaction(storeName, "readonly");
        const store = transaction.objectStore(storeName);
        const request = store.get(key);

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error || new Error(`Failed to read record from "${storeName}".`));
        transaction.oncomplete = () => database.close();
        transaction.onabort = () => reject(transaction.error || new Error(`Read transaction aborted on "${storeName}".`));
    });
}

/**
 * Write one record into a specific IndexedDB store.
 *
 * Parameters:
 * - storeName (string): The object store name.
 * - value (object): The value object containing the configured key path.
 *
 * Returns:
 * - Promise<void>: Resolves when the write transaction commits.
 *
 * Raises:
 * - Error: Raised when database write operations fail.
 */
export async function writeDbRecord(storeName, value) {
    const database = await openAppDb();

    return new Promise((resolve, reject) => {
        const transaction = database.transaction(storeName, "readwrite");
        const store = transaction.objectStore(storeName);
        const request = store.put(value);

        request.onerror = () => reject(request.error || new Error(`Failed to write record to "${storeName}".`));
        transaction.oncomplete = () => {
            database.close();
            resolve();
        };
        transaction.onabort = () => reject(transaction.error || new Error(`Write transaction aborted on "${storeName}".`));
    });
}

/**
 * Clear all cached IndexedDB records for runs and run detail bundles.
 *
 * Parameters:
 * - None.
 *
 * Returns:
 * - Promise<void>: Resolves when both stores are cleared.
 *
 * Raises:
 * - Error: Raised when one of the clear operations fails.
 */
export async function clearCachedDatabase() {
    const database = await openAppDb();

    return new Promise((resolve, reject) => {
        const transaction = database.transaction([APP_DB_STORES.runs, APP_DB_STORES.bundles], "readwrite");
        transaction.objectStore(APP_DB_STORES.runs).clear();
        transaction.objectStore(APP_DB_STORES.bundles).clear();

        transaction.oncomplete = () => {
            database.close();
            resolve();
        };
        transaction.onabort = () => reject(transaction.error || new Error("Failed to clear cached database."));
        transaction.onerror = () => reject(transaction.error || new Error("Failed to clear cached database."));
    });
}

/**
 * Load cached run activities from IndexedDB.
 *
 * Parameters:
 * - None.
 *
 * Returns:
 * - Promise<Array<object>>: Cached activities array, or an empty array.
 *
 * Raises:
 * - No explicit throw. Errors are swallowed and treated as cache miss.
 */
export async function loadCachedRuns() {
    try {
        const stored = await readDbRecord(APP_DB_STORES.runs, "all_runs");
        return Array.isArray(stored?.activities) ? stored.activities : [];
    } catch (error) {
        console.warn("Failed to load cached runs from IndexedDB:", error);
        return [];
    }
}
