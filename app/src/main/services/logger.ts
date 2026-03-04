const isDev = process.env.NODE_ENV !== 'production'

export function createLogger(module: string) {
  const prefix = `[${module}]`
  return {
    debug: isDev
      ? (msg: string, ...args: unknown[]) => console.debug(prefix, msg, ...args)
      : () => {},
    info: isDev
      ? (msg: string, ...args: unknown[]) => console.info(prefix, msg, ...args)
      : () => {},
    warn: (msg: string, ...args: unknown[]) => console.warn(prefix, msg, ...args),
    error: (msg: string, ...args: unknown[]) => console.error(prefix, msg, ...args),
  }
}
