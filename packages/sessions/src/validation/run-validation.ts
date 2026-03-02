/**
 * Run all validators on sampled sessions.
 * Outputs: src/validation/reports/validation-report.json
 */

import { mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'
import { sampleSessions } from './sampler.js'
import { validateChainIntegrity } from './validators/chain-integrity.js'
import { validateTokenAccuracy } from './validators/token-accuracy.js'
import { validateToolPairing } from './validators/tool-pairing.js'
import { validateIndexVsRaw } from './validators/index-vs-raw.js'

interface ValidationReport {
  runAt: string
  totalSampled: number
  results: {
    chainIntegrity: {
      passed: number
      failed: number
      passRate: number
      failures: string[]
    }
    tokenAccuracy: {
      passed: number
      failed: number
      passRate: number
      failures: string[]
    }
    toolPairing: {
      passed: number
      failed: number
      passRate: number
      failures: string[]
    }
    indexVsRaw: {
      passed: number
      failed: number
      passRate: number
      failures: string[]
    }
  }
  overallPassRate: number
  criticalFailures: string[]
}

async function main() {
  console.log('Sampling sessions...')
  const samples = sampleSessions({ randomCount: 30, includeSmallest: 3, includeLargest: 3 })
  console.log(`Sampled ${samples.length} sessions`)

  const chainResults = []
  const tokenResults = []
  const toolResults = []
  const indexResults = []

  for (let i = 0; i < samples.length; i++) {
    const s = samples[i]!
    process.stdout.write(`\r  Validating ${i + 1}/${samples.length}: ${s.sessionId.slice(0, 8)}...`)

    const [chain, token, tool, index] = await Promise.all([
      validateChainIntegrity(s.sessionId, s.filePath),
      validateTokenAccuracy(s.sessionId, s.filePath),
      validateToolPairing(s.sessionId, s.filePath),
      validateIndexVsRaw(s.sessionId, s.filePath, s.projectDirName),
    ])

    chainResults.push(chain)
    tokenResults.push(token)
    toolResults.push(tool)
    indexResults.push(index)
  }

  process.stdout.write('\n')

  const summarize = (results: Array<{ passed: boolean; errors: string[]; sessionId: string }>) => ({
    passed: results.filter((r) => r.passed).length,
    failed: results.filter((r) => !r.passed).length,
    passRate: results.length > 0 ? results.filter((r) => r.passed).length / results.length : 1,
    failures: results
      .filter((r) => !r.passed)
      .map((r) => `${r.sessionId.slice(0, 8)}: ${r.errors.join('; ')}`),
  })

  const summary = {
    chainIntegrity: summarize(chainResults),
    tokenAccuracy: summarize(tokenResults),
    toolPairing: summarize(toolResults),
    indexVsRaw: summarize(indexResults),
  }

  const allPassed = [
    ...chainResults,
    ...tokenResults,
    ...toolResults,
    ...indexResults,
  ]

  const overallPassRate =
    allPassed.filter((r) => r.passed).length / allPassed.length

  const criticalFailures = [
    ...summary.chainIntegrity.failures,
    ...summary.tokenAccuracy.failures,
  ]

  const report: ValidationReport = {
    runAt: new Date().toISOString(),
    totalSampled: samples.length,
    results: summary,
    overallPassRate,
    criticalFailures,
  }

  const outputDir = new URL('./reports', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
  mkdirSync(outputDir, { recursive: true })
  const outputPath = join(outputDir, 'validation-report.json')
  writeFileSync(outputPath, JSON.stringify(report, null, 2))

  console.log('\n=== Validation Report ===')
  console.log(`Sampled sessions: ${samples.length}`)
  console.log(`Overall pass rate: ${(overallPassRate * 100).toFixed(1)}%`)
  console.log('')
  console.log(`Chain integrity:  ${summary.chainIntegrity.passed}/${samples.length} passed`)
  console.log(`Token accuracy:   ${summary.tokenAccuracy.passed}/${samples.length} passed`)
  console.log(`Tool pairing:     ${summary.toolPairing.passed}/${samples.length} passed`)
  console.log(`Index vs raw:     ${summary.indexVsRaw.passed}/${samples.length} passed`)

  if (criticalFailures.length > 0) {
    console.log('\nCritical failures:')
    for (const f of criticalFailures) console.log(`  ${f}`)
  }

  console.log(`\nOutput: ${outputPath}`)

  if (overallPassRate < 0.95) {
    process.exit(1)
  }
}

main().catch(console.error)
