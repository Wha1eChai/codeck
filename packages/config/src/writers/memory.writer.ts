import { atomicWriteText } from '../utils/file-io.js'

export async function writeMemoryContent(
  filePath: string,
  content: string,
): Promise<void> {
  await atomicWriteText(filePath, content)
}
