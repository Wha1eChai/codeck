import { createReadStream } from 'fs'
import { createInterface } from 'readline'
import type { RawJsonlEntry } from './types.js'

export interface JsonlLine {
  entry: RawJsonlEntry
  lineNo: number
  raw: string
}

export interface JsonlReaderOptions {
  /** Signal to abort reading early */
  signal?: AbortSignal
  /** Skip lines without full parse (for quick metadata scans) */
  skipLineFilter?: (raw: string) => boolean
}

/**
 * Stream-parse a JSONL file, yielding each valid line.
 * Tolerates malformed lines (skips them without throwing).
 * Based on history-service.ts readline + createReadStream pattern.
 */
export async function* readJsonlFile(
  filePath: string,
  options: JsonlReaderOptions = {},
): AsyncGenerator<JsonlLine> {
  const { signal, skipLineFilter } = options

  const rl = createInterface({
    input: createReadStream(filePath, { encoding: 'utf-8' }),
    crlfDelay: Infinity,
  })

  let lineNo = 0

  try {
    for await (const raw of rl) {
      if (signal?.aborted) break

      lineNo++
      const trimmed = raw.trim()
      if (!trimmed) continue

      // Optional fast-path filter to skip lines without parsing
      if (skipLineFilter?.(trimmed)) continue

      let entry: RawJsonlEntry
      try {
        entry = JSON.parse(trimmed) as RawJsonlEntry
      } catch {
        // Skip malformed JSON lines
        continue
      }

      yield { entry, lineNo, raw: trimmed }
    }
  } finally {
    rl.close()
  }
}

/**
 * Read all entries from a JSONL file into memory.
 * Only use for small files; prefer readJsonlFile stream for large files.
 */
export async function readAllJsonlEntries(
  filePath: string,
  options?: JsonlReaderOptions,
): Promise<JsonlLine[]> {
  const lines: JsonlLine[] = []
  for await (const line of readJsonlFile(filePath, options)) {
    lines.push(line)
  }
  return lines
}

/**
 * Read only the first N valid entries from a JSONL file.
 */
export async function readJsonlHead(
  filePath: string,
  count: number,
): Promise<JsonlLine[]> {
  const lines: JsonlLine[] = []
  const controller = new AbortController()

  for await (const line of readJsonlFile(filePath, { signal: controller.signal })) {
    lines.push(line)
    if (lines.length >= count) {
      controller.abort()
      break
    }
  }
  return lines
}
