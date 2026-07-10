// Severity levels, low to high. 'debug' is a threshold-only value (see PRD) - never
// itself dispatched by any call site.
export const LEVELS = { debug: 0, info: 1, warning: 2, error: 3 };

const DEFAULT_LOG_LEVEL = 'error';
const RESIZE_OBSERVER_NOISE = 'ResizeObserver loop limit exceeded';

/**
 * Single pub/sub channel every error in the app dispatches onto - Model (via
 * Controller-mediated catches), Controller, and the global uncaught-exception
 * handlers below. ImageView is the only subscriber.
 */
export default class ErrorBus extends EventTarget {
    report(level, message, detail = null) {
        this.dispatchEvent(new CustomEvent('report', { detail: { level, message, detail } }));
    }
}

export function meetsThreshold(level, threshold) {
    return LEVELS[level] >= LEVELS[threshold];
}

// Parsed once at startup from location.search; nothing persists across reloads.
export function parseDebugConfig(search = '') {
    const params = new URLSearchParams(search);
    const requestedLevel = params.get('log_level');
    const logLevel = Object.hasOwn(LEVELS, requestedLevel) ? requestedLevel : DEFAULT_LOG_LEVEL;
    const stackTrace = params.get('stack_trace') === 'enabled';
    return { logLevel, stackTrace };
}

export function isBenignError(message) {
    return typeof message === 'string' && message.includes(RESIZE_OBSERVER_NOISE);
}

// Wires the app-wide safety net for exceptions nothing else caught. Call once at
// startup; the window 'error' and 'unhandledrejection' events both dispatch 'error'
// onto the bus, minus the well-known spurious ResizeObserver message.
export function installGlobalErrorHandlers(bus) {
    window.addEventListener('error', (event) => {
        if (isBenignError(event.message)) return;
        bus.report('error', 'Something unexpected went wrong', event.error || event.message);
    });

    window.addEventListener('unhandledrejection', (event) => {
        const reason = event.reason;
        const message = reason instanceof Error ? reason.message : String(reason);
        if (isBenignError(message)) return;
        bus.report('error', 'Something unexpected went wrong', reason);
    });
}
