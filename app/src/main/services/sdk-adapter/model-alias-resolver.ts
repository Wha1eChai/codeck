// ============================================================
// Model Alias Resolver — 纯函数，零副作用
//
// 将短别名（sonnet/opus/haiku）解析为完整 model ID。
// 非别名原样透传，undefined 返回 undefined。
// ============================================================

import { DEFAULT_MODEL_ALIASES } from '@common/defaults'

/**
 * Resolve a model alias or full model ID to a concrete model identifier.
 *
 * - Known alias (e.g. 'sonnet') → mapped full ID (e.g. 'claude-sonnet-4-6')
 * - Full model ID (e.g. 'claude-sonnet-4-6') → passed through as-is
 * - undefined → undefined (SDK uses its default)
 */
export function resolveModelAlias(
  modelOrAlias: string | undefined,
  aliases: Readonly<Record<string, string>> | undefined,
): string | undefined {
  if (!modelOrAlias) return undefined
  const effective = aliases ?? DEFAULT_MODEL_ALIASES
  return effective[modelOrAlias] ?? modelOrAlias
}
