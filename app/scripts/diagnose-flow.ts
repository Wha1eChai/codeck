/**
 * 诊断脚本 - 追踪会话历史加载的完整数据流
 *
 * 运行: npx tsx scripts/diagnose-flow.ts <sessionId>
 *
 * ⚠️  本脚本仅读取本机 ~/.claude/ 目录数据用于调试，不会上传任何内容。
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';

// 模拟 claudeFilesService 的路径计算逻辑
function getProjectDir(projectPath: string): string {
  const hash = crypto.createHash('sha256').update(projectPath).digest('hex').substring(0, 12);
  return path.join(os.homedir(), '.claude', 'projects', hash);
}

function getSessionsDir(projectPath: string): string {
  return path.join(getProjectDir(projectPath), 'sessions');
}

function getSessionFilePath(projectPath: string, sessionId: string): string {
  return path.join(getSessionsDir(projectPath), `${sessionId}.jsonl`);
}

// 从 session-parser.ts 复制的逻辑
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
    id: entry.id || crypto.randomUUID(),
    sessionId,
    type: entryType,
    role: (entry.role as string) || (type === 'user' ? 'user' : 'assistant'),
    content: String(entry.content ?? entry.prompt ?? entry.message ?? ''),
    timestamp: (entry.timestamp as number) || Date.now(),
    originalType: type,
  };
}

async function getSessionMessages(projectPath: string, sessionId: string) {
  const filePath = getSessionFilePath(projectPath, sessionId);
  console.log(`\n📁 尝试读取文件: ${filePath}`);

  try {
    await fs.access(filePath);
    console.log('✅ 文件存在');
  } catch {
    console.log('❌ 文件不存在!');
    return [];
  }

  const content = await fs.readFile(filePath, 'utf-8');
  const lines = content.split('\n');
  console.log(`📄 文件行数: ${lines.length}`);

  const messages: Record<string, unknown>[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    try {
      const entry = JSON.parse(trimmed);
      const message = mapJsonlEntry(entry, sessionId);
      if (message && !('skipped' in message)) {
        messages.push(message as Record<string, unknown>);
      }
    } catch {
      continue;
    }
  }

  return messages;
}

async function main() {
  console.log('=== 会话历史加载流程诊断 ===\n');

  const targetSessionId = process.argv[2];

  // 1. 扫描所有项目
  const projectsDir = path.join(os.homedir(), '.claude', 'projects');
  const entries = await fs.readdir(projectsDir, { withFileTypes: true });
  const projectDirs = entries.filter(e => e.isDirectory());

  console.log(`📂 找到 ${projectDirs.length} 个项目目录\n`);

  // 2. 查找目标会话
  for (const dir of projectDirs) {
    const hash = dir.name;
    const projectPath = path.join(projectsDir, hash);

    // 读取项目元数据获取原始路径
    let originalPath: string | null = null;
    try {
      const settingsPath = path.join(projectPath, 'settings.json');
      const settings = JSON.parse(await fs.readFile(settingsPath, 'utf-8'));
      originalPath = settings.ccuiProjectMeta?.project_path ||
                     settings.project_path ||
                     settings.original_path ||
                     null;
    } catch {
      // 忽略
    }

    // 检查 sessions 目录
    const sessionsDir = path.join(projectPath, 'sessions');
    try {
      const sessionFiles = await fs.readdir(sessionsDir);
      const jsonlFiles = sessionFiles.filter(f => f.endsWith('.jsonl'));

      for (const file of jsonlFiles) {
        const sessionId = file.replace('.jsonl', '');

        // 如果指定了目标会话，只处理该会话
        if (targetSessionId && sessionId !== targetSessionId) continue;

        console.log(`\n--- 会话: ${sessionId} ---`);
        console.log(`项目 hash: ${hash}`);
        console.log(`原始路径: ${originalPath || '未知'}`);

        if (originalPath) {
          // 验证路径计算
          const calculatedHash = crypto.createHash('sha256').update(originalPath).digest('hex').substring(0, 12);
          console.log(`计算的 hash: ${calculatedHash}`);
          console.log(`hash 匹配: ${calculatedHash === hash ? '✅' : '❌'}`);

          // 模拟加载消息
          const messages = await getSessionMessages(originalPath, sessionId);
          console.log(`\n📊 解析结果: ${messages.length} 条消息`);

          if (messages.length > 0) {
            console.log('\n消息预览:');
            for (const msg of messages.slice(0, 3)) {
              console.log(`  - [${msg.type}] ${(msg.content as string)?.slice(0, 50)}...`);
            }
          }
        } else {
          console.log('⚠️ 无法确定原始项目路径，跳过消息加载测试');
        }
      }
    } catch {
      // 无 sessions 目录
    }
  }

  console.log('\n=== 诊断完成 ===');
}

main().catch(console.error);
