/**
 * 联合测试 - 验证会话历史和工具调用解析的真实行为
 *
 * 不使用 mock，直接测试真实的文件读写和消息解析。
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { mapJsonlEntry, mapMessageToJsonl, extractSessionMetadata } from '../claude-files/session-parser';
import type { Message } from '@common/types';

describe('联合测试: 会话历史 + 工具调用解析', () => {
  let testDir: string;

  beforeAll(async () => {
    testDir = path.join(os.tmpdir(), 'cc-desk-integration-test', Date.now().toString());
    await fs.mkdir(testDir, { recursive: true });
  });

  afterAll(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  it('应该正确持久化和读取各种消息类型', async () => {
    const testMessages: Message[] = [
      {
        id: 'msg_1',
        sessionId: 'test-session',
        role: 'user',
        type: 'text',
        content: '请帮我读取 package.json',
        timestamp: 1000,
      },
      {
        id: 'msg_2',
        sessionId: 'test-session',
        role: 'assistant',
        type: 'text',
        content: '好的，我来读取文件。',
        timestamp: 2000,
      },
      {
        id: 'msg_3',
        sessionId: 'test-session',
        role: 'assistant',
        type: 'thinking',
        content: '需要先确认文件路径...',
        timestamp: 2100,
      },
      {
        id: 'msg_4',
        sessionId: 'test-session',
        role: 'assistant',
        type: 'tool_use',
        content: '',
        toolName: 'Read',
        toolInput: { file_path: '/project/package.json' },
        timestamp: 2200,
      },
      {
        id: 'msg_5',
        sessionId: 'test-session',
        role: 'tool',
        type: 'tool_result',
        content: '{"name": "my-cc-desk", "version": "0.1.0"}',
        toolResult: '{"name": "my-cc-desk", "version": "0.1.0"}',
        toolName: 'Read',
        success: true,
        timestamp: 3000,
      },
    ];

    // 写入 JSONL 文件
    const jsonlPath = path.join(testDir, 'test-roundtrip.jsonl');
    for (const msg of testMessages) {
      const entry = mapMessageToJsonl(msg);
      await fs.appendFile(jsonlPath, JSON.stringify(entry) + '\n', 'utf-8');
    }

    // 读取并解析
    const content = await fs.readFile(jsonlPath, 'utf-8');
    const lines = content.trim().split('\n');
    const parsedMessages: Message[] = [];

    for (const line of lines) {
      const entry = JSON.parse(line);
      const msg = mapJsonlEntry(entry, 'test-session');
      if (msg) {
        parsedMessages.push(msg);
      }
    }

    // 验证消息数量
    expect(parsedMessages.length).toBe(5);

    // 验证消息类型
    const messageTypes = parsedMessages.map(m => m.type);
    expect(messageTypes).toContain('text');
    expect(messageTypes).toContain('thinking');
    expect(messageTypes).toContain('tool_use');
    expect(messageTypes).toContain('tool_result');

    // 验证 tool_use 解析
    const toolUseMsg = parsedMessages.find(m => m.type === 'tool_use');
    expect(toolUseMsg).toBeDefined();
    expect(toolUseMsg!.toolName).toBe('Read');
    expect(toolUseMsg!.toolInput).toEqual({ file_path: '/project/package.json' });

    // 验证 tool_result 解析
    const toolResultMsg = parsedMessages.find(m => m.type === 'tool_result');
    expect(toolResultMsg).toBeDefined();
    expect(toolResultMsg!.success).toBe(true);
    expect(toolResultMsg!.content).toContain('my-cc-desk');
  });

  it('应该正确提取 system/init 中的 SDK sessionId', async () => {
    const sessionWithInit = path.join(testDir, 'session-with-init.jsonl');
    await fs.writeFile(sessionWithInit, [
      JSON.stringify({ type: 'session_meta', name: 'Test Session', permission_mode: 'default' }),
      JSON.stringify({ type: 'user', content: 'Hello' }),
      JSON.stringify({ type: 'system', subtype: 'init', session_id: 'sdk_session_abc123' }),
      JSON.stringify({ type: 'assistant', content: 'Hi there!' }),
    ].join('\n') + '\n', 'utf-8');

    const metadata = await extractSessionMetadata(
      (p) => fs.readFile(p, 'utf-8'),
      sessionWithInit
    );

    expect(metadata.name).toBe('Test Session');
    expect(metadata.sdkSessionId).toBe('sdk_session_abc123');
  });

  it('应该正确处理消息 ID 去重', async () => {
    const duplicatePath = path.join(testDir, 'duplicate.jsonl');

    // 模拟重复写入相同消息
    for (let i = 0; i < 2; i++) {
      const entry = mapMessageToJsonl({
        id: 'same_id',
        sessionId: 'test',
        role: 'assistant',
        type: 'text',
        content: '这条消息会被写入两次',
        timestamp: 1000,
      });
      await fs.appendFile(duplicatePath, JSON.stringify(entry) + '\n', 'utf-8');
    }

    const content = await fs.readFile(duplicatePath, 'utf-8');
    const lines = content.trim().split('\n');

    // 文件中应该有 2 行
    expect(lines.length).toBe(2);

    // 模拟前端去重逻辑
    const messages: Message[] = [];
    for (const line of lines) {
      const entry = JSON.parse(line);
      const msg = mapJsonlEntry(entry, 'test');
      if (msg) {
        const exists = messages.find(m => m.id === msg.id);
        if (!exists) {
          messages.push(msg);
        }
      }
    }

    // 去重后应该只有 1 条消息
    expect(messages.length).toBe(1);
    expect(messages[0].id).toBe('same_id');
  });

  it('应该正确处理嵌套的 tool_result 结构', async () => {
    // 模拟 SDK 返回的嵌套 tool_result
    const sdkStyleEntry = {
      type: 'tool_result',
      tool_use_id: 'toolu_123',
      content: 'File content here',
      is_error: false,
    };

    const msg = mapJsonlEntry(sdkStyleEntry, 'test-session');
    expect(msg).toBeDefined();
    expect(msg!.type).toBe('tool_result');
    expect(msg!.toolUseId).toBe('toolu_123');
    expect(msg!.success).toBe(true);
  });

  it('应该正确处理缺少可选字段的消息', async () => {
    // 最小化的消息结构
    const minimalEntry = {
      type: 'tool_use',
      tool_name: 'Bash',
      tool_input: { command: 'ls' },
    };

    const msg = mapJsonlEntry(minimalEntry, 'test-session');
    expect(msg).toBeDefined();
    expect(msg!.type).toBe('tool_use');
    expect(msg!.toolName).toBe('Bash');
    // id 和 timestamp 应该被自动生成
    expect(msg!.id).toBeDefined();
    expect(msg!.timestamp).toBeGreaterThan(0);
  });
});
