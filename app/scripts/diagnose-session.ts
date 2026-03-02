/**
 * 诊断脚本 - 检查 JSONL 会话文件的实际内容
 *
 * 运行: npx tsx scripts/diagnose-session.ts
 *
 * ⚠️  本脚本仅读取本机 ~/.claude/ 目录数据用于调试，不会上传任何内容。
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

// 简化的 mapJsonlEntry 函数（不导入模块，直接复制逻辑）
function mapJsonlEntry(entry: Record<string, unknown>, sessionId: string) {
  const type = entry.type as string | undefined;

  // Skip metadata/control entries.
  if (type === 'session_meta' || type === 'system_init') {
    return { skipped: true, reason: 'metadata' };
  }

  // Normalize type
  let entryType = 'text';
  if (type === 'thinking' || type === 'reasoning' || entry.thinking) {
    entryType = 'thinking';
  } else if (type?.startsWith('tool_') || type === 'tool') {
    entryType = type;
  } else if (type === 'usage' || type === 'tokens' || entry.input_tokens || entry.inputTokens) {
    entryType = 'usage';
  } else if (type === 'error' || entry.error || entry.is_error) {
    entryType = 'error';
  } else if (type === 'assistant' || type === 'user') {
    entryType = 'text';
  }

  return {
    originalType: type,
    normalizedType: entryType,
    hasContent: !!(entry.content || entry.text || entry.thinking || entry.message),
    keys: Object.keys(entry),
    preview: JSON.stringify(entry).slice(0, 200)
  };
}

async function main() {
  console.log('=== JSONL 会话文件诊断 ===\n');

  // 检查 ~/.claude/projects 目录
  const claudeDir = path.join(os.homedir(), '.claude');
  const projectsDir = path.join(claudeDir, 'projects');

  try {
    await fs.access(projectsDir);
  } catch {
    console.log(`项目目录不存在: ${projectsDir}`);
    console.log('请先运行应用创建会话。');
    return;
  }

  // 列出所有项目
  const projects = await fs.readdir(projectsDir);
  console.log(`找到 ${projects.length} 个项目目录\n`);

  for (const projectHash of projects.slice(0, 3)) {  // 只检查前3个
    const projectPath = path.join(projectsDir, projectHash);
    const sessionsDir = path.join(projectPath, 'sessions');

    try {
      const stat = await fs.stat(projectPath);
      if (!stat.isDirectory()) continue;
    } catch {
      continue;
    }

    console.log(`\n--- 项目: ${projectHash.slice(0, 12)}... ---`);

    // 读取项目 settings.json 获取原始路径
    try {
      const settingsPath = path.join(projectPath, 'settings.json');
      const settings = JSON.parse(await fs.readFile(settingsPath, 'utf-8'));
      console.log(`原始路径: ${settings.project_path || settings.original_path || '未知'}`);
      console.log(`ccuiProjectMeta: ${JSON.stringify(settings.ccuiProjectMeta || '无')}`);
    } catch {
      console.log('项目 settings.json 不存在');
    }

    // 列出会话文件
    try {
      await fs.access(sessionsDir);
      const sessions = await fs.readdir(sessionsDir);
      console.log(`会话文件: ${sessions.length} 个`);

      // 检查第一个会话文件
      const firstSession = sessions.find(s => s.endsWith('.jsonl'));
      if (firstSession) {
        const sessionPath = path.join(sessionsDir, firstSession);
        console.log(`\n检查会话: ${firstSession}`);

        const content = await fs.readFile(sessionPath, 'utf-8');
        const lines = content.trim().split('\n');
        console.log(`总行数: ${lines.length}`);

        // 解析每一行
        let parsedCount = 0;
        let skippedCount = 0;
        const typeCounts: Record<string, number> = {};

        for (const line of lines) {
          if (!line.trim()) continue;

          try {
            const entry = JSON.parse(line);
            const result = mapJsonlEntry(entry, firstSession.replace('.jsonl', ''));

            if ('skipped' in result && result.skipped) {
              skippedCount++;
            } else {
              parsedCount++;
              const t = result.normalizedType || 'unknown';
              typeCounts[t] = (typeCounts[t] || 0) + 1;
            }
          } catch (e) {
            console.log(`解析失败: ${line.slice(0, 100)}`);
          }
        }

        console.log(`\n解析结果:`);
        console.log(`  - 成功解析: ${parsedCount}`);
        console.log(`  - 跳过(metadata): ${skippedCount}`);
        console.log(`  - 类型分布:`);
        for (const [t, c] of Object.entries(typeCounts)) {
          console.log(`      ${t}: ${c}`);
        }

        // 显示前3行原始内容
        console.log(`\n前3行原始内容:`);
        for (let i = 0; i < Math.min(3, lines.length); i++) {
          console.log(`  [${i}] ${lines[i].slice(0, 150)}...`);
        }
      }
    } catch (e) {
      console.log(`无法读取 sessions 目录: ${e}`);
    }
  }

  console.log('\n=== 诊断完成 ===');
}

main().catch(console.error);
