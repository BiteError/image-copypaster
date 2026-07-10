// @vitest-environment jsdom
import { expect, test, describe, vi } from 'vitest'
import ErrorBus, { meetsThreshold, parseDebugConfig, isBenignError, installGlobalErrorHandlers } from '../error_bus.js'

describe('ErrorBus', () => {
  test('report() dispatches a "report" event carrying level, message, and detail', () => {
    const bus = new ErrorBus();
    const handler = vi.fn();
    bus.addEventListener('report', handler);

    bus.report('error', "Couldn't paste image", new Error('boom'));

    expect(handler).toHaveBeenCalledTimes(1);
    const event = handler.mock.calls[0][0];
    expect(event.detail.level).toBe('error');
    expect(event.detail.message).toBe("Couldn't paste image");
    expect(event.detail.detail).toBeInstanceOf(Error);
  });

  test('detail defaults to null when omitted', () => {
    const bus = new ErrorBus();
    const handler = vi.fn();
    bus.addEventListener('report', handler);

    bus.report('info', 'no image on clipboard');

    expect(handler.mock.calls[0][0].detail.detail).toBeNull();
  });

  test('multiple subscribers all receive the same report', () => {
    const bus = new ErrorBus();
    const a = vi.fn();
    const b = vi.fn();
    bus.addEventListener('report', a);
    bus.addEventListener('report', b);

    bus.report('warning', 'fallback engaged');

    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
  });
});

describe('meetsThreshold', () => {
  test.each([
    ['error', 'error', true],
    ['warning', 'error', false],
    ['error', 'warning', true],
    ['info', 'debug', true],
    ['debug', 'info', false],
    ['warning', 'warning', true],
  ])('meetsThreshold(%s, %s) -> %s', (level, threshold, expected) => {
    expect(meetsThreshold(level, threshold)).toBe(expected);
  });
});

describe('parseDebugConfig', () => {
  test('defaults to log_level "error" and stack_trace disabled when absent', () => {
    expect(parseDebugConfig('')).toStrictEqual({ logLevel: 'error', stackTrace: false });
  });

  test('reads a valid log_level', () => {
    expect(parseDebugConfig('?log_level=warning')).toStrictEqual({ logLevel: 'warning', stackTrace: false });
  });

  test('falls back to "error" for an unrecognized log_level', () => {
    expect(parseDebugConfig('?log_level=nonsense')).toStrictEqual({ logLevel: 'error', stackTrace: false });
  });

  test('reads stack_trace=enabled independently of log_level', () => {
    expect(parseDebugConfig('?stack_trace=enabled')).toStrictEqual({ logLevel: 'error', stackTrace: true });
  });

  test('any value other than "enabled" leaves stack_trace disabled', () => {
    expect(parseDebugConfig('?stack_trace=true')).toStrictEqual({ logLevel: 'error', stackTrace: false });
  });

  test('both params combine independently', () => {
    expect(parseDebugConfig('?log_level=debug&stack_trace=enabled')).toStrictEqual({ logLevel: 'debug', stackTrace: true });
  });
});

describe('isBenignError', () => {
  test('flags the known ResizeObserver noise message', () => {
    expect(isBenignError('ResizeObserver loop limit exceeded')).toBe(true);
  });

  test('flags it as a substring of a longer message too', () => {
    expect(isBenignError('Uncaught: ResizeObserver loop limit exceeded at line 1')).toBe(true);
  });

  test('does not flag unrelated messages', () => {
    expect(isBenignError('TypeError: cannot read properties of undefined')).toBe(false);
  });

  test('does not flag non-string input', () => {
    expect(isBenignError(undefined)).toBe(false);
    expect(isBenignError(new Error('ResizeObserver loop limit exceeded'))).toBe(false);
  });
});

describe('installGlobalErrorHandlers', () => {
  test('a real window error event dispatches an error-level report', () => {
    const bus = new ErrorBus();
    const handler = vi.fn();
    bus.addEventListener('report', handler);
    installGlobalErrorHandlers(bus);

    window.dispatchEvent(new ErrorEvent('error', { message: 'boom', error: new Error('boom') }));

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0][0].detail.level).toBe('error');
  });

  test('the ResizeObserver noise message is filtered rather than dispatched', () => {
    const bus = new ErrorBus();
    const handler = vi.fn();
    bus.addEventListener('report', handler);
    installGlobalErrorHandlers(bus);

    window.dispatchEvent(new ErrorEvent('error', { message: 'ResizeObserver loop limit exceeded' }));

    expect(handler).not.toHaveBeenCalled();
  });

  test('a real unhandledrejection event dispatches an error-level report', () => {
    const bus = new ErrorBus();
    const handler = vi.fn();
    bus.addEventListener('report', handler);
    installGlobalErrorHandlers(bus);

    const event = new Event('unhandledrejection');
    event.reason = new Error('promise blew up');
    window.dispatchEvent(event);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0][0].detail.level).toBe('error');
    expect(handler.mock.calls[0][0].detail.detail).toBe(event.reason);
  });
});
