// Private registry for subscribers
const subscribers = new Set();

let queued = false;

/**
 * Register a refresh callback
 * @param {Function} callback - Function to call on refresh
 * @returns {Function} - Unsubscribe function
 */
export function onAppRefresh(callback) {
    subscribers.add(callback);
    return () => subscribers.delete(callback);
}

/**
 * Trigger refresh - call this to reload current page
 * Components should call this when state changes require re-render
 */
export function refreshApp() {
    if (queued) return;

    queued = true;

    queueMicrotask(() => {
        subscribers.forEach(cb => cb());
        queued = false;
    });
}

// Expose to window for easy access from any component
if (typeof window !== 'undefined') {
    window.refreshApp = refreshApp;
    window.onAppRefresh = onAppRefresh;
}