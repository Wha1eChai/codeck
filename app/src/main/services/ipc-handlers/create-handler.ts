import { ipcMain } from 'electron';

import type { BrowserWindow } from 'electron';
import type { ZodType } from 'zod';

// ── Helpers ──

function requireWindow(getter: () => BrowserWindow | null): BrowserWindow {
  const win = getter();
  if (!win) throw new Error('No active window');
  return win;
}

// ── No-input handler ──

/**
 * Register an IPC handler with no input validation.
 *
 * @example
 * createHandler(CHANNEL, { handle: () => service.getAll() })
 */
export function createHandler<TOutput>(
  channel: string,
  config: { handle: () => TOutput | Promise<TOutput> },
): void {
  ipcMain.handle(channel, async () => config.handle());
}

// ── Schema-validated handler (single payload) ──

/**
 * Register an IPC handler that validates a single payload with a Zod schema.
 * The payload type is inferred from the schema.
 *
 * @example
 * createValidatedHandler(CHANNEL, {
 *   schema: myZodSchema,
 *   handle: (validated) => service.doSomething(validated),
 * })
 */
export function createValidatedHandler<TInput, TOutput>(
  channel: string,
  config: {
    schema: ZodType<TInput>;
    handle: (validated: TInput) => TOutput | Promise<TOutput>;
  },
): void {
  ipcMain.handle(channel, async (_, payload: unknown) => {
    const validated = config.schema.parse(payload);
    return config.handle(validated);
  });
}

// ── Window handler (no input) ──

/**
 * Register an IPC handler that receives BrowserWindow with no payload.
 *
 * @example
 * createWindowHandler(CHANNEL, {
 *   window: getMainWindow,
 *   handle: (win) => win.webContents.send(...),
 * })
 */
export function createWindowHandler<TOutput>(
  channel: string,
  config: {
    window: () => BrowserWindow | null;
    handle: (win: BrowserWindow) => TOutput | Promise<TOutput>;
  },
): void {
  ipcMain.handle(channel, async () => {
    const win = requireWindow(config.window);
    return config.handle(win);
  });
}

// ── Window + schema handler ──

/**
 * Register an IPC handler that receives BrowserWindow + validated payload.
 *
 * @example
 * createWindowValidatedHandler(CHANNEL, {
 *   schema: myZodSchema,
 *   window: getMainWindow,
 *   handle: (win, validated) => service.doSomething(win, validated),
 * })
 */
export function createWindowValidatedHandler<TInput, TOutput>(
  channel: string,
  config: {
    schema: ZodType<TInput>;
    window: () => BrowserWindow | null;
    handle: (win: BrowserWindow, validated: TInput) => TOutput | Promise<TOutput>;
  },
): void {
  ipcMain.handle(channel, async (_, payload: unknown) => {
    const win = requireWindow(config.window);
    const validated = config.schema.parse(payload);
    return config.handle(win, validated);
  });
}

// ── Multi-arg handler ──

/**
 * Register an IPC handler that receives multiple positional IPC arguments
 * and validates them as a single Zod object.
 *
 * `mapArgs` transforms the positional args into the object shape expected by the schema.
 *
 * @example
 * createMultiArgHandler(CHANNEL, {
 *   schema: z.object({ name: z.string(), value: z.string() }),
 *   mapArgs: (name, value) => ({ name, value }),
 *   handle: (validated) => service.setEnvVar(validated.name, validated.value),
 * })
 */
export function createMultiArgHandler<TInput, TOutput>(
  channel: string,
  config: {
    schema: ZodType<TInput>;
    mapArgs: (...args: readonly unknown[]) => unknown;
    handle: (validated: TInput) => TOutput | Promise<TOutput>;
  },
): void {
  ipcMain.handle(channel, async (_, ...args: unknown[]) => {
    const raw = config.mapArgs(...args);
    const validated = config.schema.parse(raw);
    return config.handle(validated);
  });
}

/**
 * Multi-arg variant that also provides BrowserWindow.
 */
export function createMultiArgWindowHandler<TInput, TOutput>(
  channel: string,
  config: {
    schema: ZodType<TInput>;
    window: () => BrowserWindow | null;
    mapArgs: (...args: readonly unknown[]) => unknown;
    handle: (win: BrowserWindow, validated: TInput) => TOutput | Promise<TOutput>;
  },
): void {
  ipcMain.handle(channel, async (_, ...args: unknown[]) => {
    const win = requireWindow(config.window);
    const raw = config.mapArgs(...args);
    const validated = config.schema.parse(raw);
    return config.handle(win, validated);
  });
}
