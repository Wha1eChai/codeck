const MAX_REPEATS = 3

interface ToolCall {
  readonly toolName: string
  readonly argsKey: string
}

/**
 * Detects doom loops: the same tool called with the same arguments
 * multiple times in a row without any different tool call in between.
 */
export interface DoomDetector {
  /** Record a tool call. Returns true if a doom loop is detected. */
  record(toolName: string, args: Record<string, unknown>): boolean
  reset(): void
}

export function createDoomDetector(threshold: number = MAX_REPEATS): DoomDetector {
  let lastCall: ToolCall | undefined
  let repeatCount = 0

  return {
    record(toolName: string, args: Record<string, unknown>): boolean {
      const argsKey = JSON.stringify(args)
      const current: ToolCall = { toolName, argsKey }

      if (lastCall && lastCall.toolName === current.toolName && lastCall.argsKey === current.argsKey) {
        repeatCount++
      } else {
        lastCall = current
        repeatCount = 1
      }

      return repeatCount >= threshold
    },

    reset(): void {
      lastCall = undefined
      repeatCount = 0
    },
  }
}
