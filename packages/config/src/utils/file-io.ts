import fs from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'

/**
 * Safely read a file as UTF-8 string. Returns null if file doesn't exist or read fails.
 */
export async function safeReadFile(filePath: string): Promise<string | null> {
  try {
    return await fs.readFile(filePath, 'utf-8')
  } catch {
    return null
  }
}

/**
 * Safely read and parse a JSON file. Returns null if file doesn't exist or parsing fails.
 */
export async function safeReadJson<T = unknown>(filePath: string): Promise<T | null> {
  const raw = await safeReadFile(filePath)
  if (raw === null) return null

  try {
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

/**
 * Safely list directory contents. Returns empty array if directory doesn't exist.
 */
export async function safeListDir(dirPath: string): Promise<readonly string[]> {
  try {
    return await fs.readdir(dirPath)
  } catch {
    return []
  }
}

/**
 * Safely list directory entries with types. Returns empty array if directory doesn't exist.
 */
export async function safeListDirEntries(
  dirPath: string,
): Promise<readonly import('node:fs').Dirent[]> {
  try {
    return await fs.readdir(dirPath, { withFileTypes: true })
  } catch {
    return []
  }
}

/**
 * Check if a path exists.
 */
export async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

/**
 * Atomically write JSON to a file. Uses tmp file + rename with Windows fallback.
 */
export async function atomicWriteJson(
  filePath: string,
  data: unknown,
  indent: number = 2,
): Promise<void> {
  const dir = path.dirname(filePath)
  await fs.mkdir(dir, { recursive: true })

  const content = JSON.stringify(data, null, indent)
  const tmpPath = path.join(dir, `.tmp-${crypto.randomUUID()}`)

  try {
    await fs.writeFile(tmpPath, content, 'utf-8')
    await fs.rename(tmpPath, filePath)
  } catch {
    // Windows fallback: direct write if rename fails (cross-device, etc.)
    try {
      await fs.writeFile(filePath, content, 'utf-8')
    } finally {
      try {
        await fs.unlink(tmpPath)
      } catch {
        // ignore cleanup failure
      }
    }
  }
}

/**
 * Atomically write text content to a file.
 */
export async function atomicWriteText(filePath: string, content: string): Promise<void> {
  const dir = path.dirname(filePath)
  await fs.mkdir(dir, { recursive: true })

  const tmpPath = path.join(dir, `.tmp-${crypto.randomUUID()}`)

  try {
    await fs.writeFile(tmpPath, content, 'utf-8')
    await fs.rename(tmpPath, filePath)
  } catch {
    try {
      await fs.writeFile(filePath, content, 'utf-8')
    } finally {
      try {
        await fs.unlink(tmpPath)
      } catch {
        // ignore cleanup failure
      }
    }
  }
}
