export function createLogger(module: string) {
  const prefix = `[${module}]`
  return {
    debug: (msg: string, ...args: unknown[]) => console.debug(prefix, msg, ...args),
    info: (msg: string, ...args: unknown[]) => console.info(prefix, msg, ...args),
    warn: (msg: string, ...args: unknown[]) => console.warn(prefix, msg, ...args),
    error: (msg: string, ...args: unknown[]) => console.error(prefix, msg, ...args),
  }
}
