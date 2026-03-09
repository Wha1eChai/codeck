import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import type { Session, CreateSessionInput, Message, PermissionMode, RuntimeProvider } from '@common/types';
import {
  createSessionJsonlMapper,
  extractSessionMetadata,
  parseSessionDetails,
  mapMessageToJsonl,
} from './claude-files/session-parser';
import type { ProjectInfo, SessionFileMetadata, SessionParseResult, RawJsonlEntry } from './claude-files/types';

// Re-export types for backward compatibility
export type { ProjectInfo, SessionParseResult, RawJsonlEntry };

export interface SessionRuntimeMetadataInput {
  readonly sdkSessionId?: string;
  readonly runtime?: RuntimeProvider;
  readonly model?: string;
  readonly permissionMode?: PermissionMode;
  readonly cwd?: string;
  readonly tools?: readonly string[];
}

const PROJECT_METADATA_KEY = 'ccuiProjectMeta';

/**
 * Service for managing Claude Code native file storage.
 * Supports both SDK-native project layout and the legacy hash/sessions layout.
 */
export class ClaudeFilesService {
  private getClaudeRoot(): string {
    return path.join(os.homedir(), '.claude');
  }

  private getProjectsRoot(): string {
    return path.join(this.getClaudeRoot(), 'projects');
  }

  private getLegacyProjectHash(projectPath: string): string {
    return crypto.createHash('sha256').update(projectPath).digest('hex').substring(0, 12);
  }

  private getLegacyProjectDir(projectPath: string): string {
    return path.join(this.getProjectsRoot(), this.getLegacyProjectHash(projectPath));
  }

  private getLegacySessionsDir(projectPath: string): string {
    return path.join(this.getLegacyProjectDir(projectPath), 'sessions');
  }

  private encodeNativeProjectDir(projectPath: string): string {
    const normalized = path.resolve(projectPath);
    if (/^[A-Za-z]:[\\/]/.test(normalized)) {
      const drive = normalized[0];
      const rest = normalized.slice(3).replace(/[\\/]+/g, '-');
      return `${drive}--${rest}`;
    }

    return encodeURIComponent(normalized.replace(/\\/g, '/'));
  }

  private decodeNativeProjectDir(dirName: string): string | null {
    if (dirName.includes('%')) {
      try {
        return decodeURIComponent(dirName);
      } catch {
        return null;
      }
    }

    if (/^[A-Za-z]--/.test(dirName)) {
      const drive = `${dirName[0]}:`;
      const rest = dirName.slice(3).replace(/-/g, '\\');
      return `${drive}\\${rest}`;
    }

    return null;
  }

  private getNativeProjectDir(projectPath: string): string {
    return path.join(this.getProjectsRoot(), this.encodeNativeProjectDir(projectPath));
  }

  private getCandidateSessionDirs(projectPath: string): string[] {
    return [this.getNativeProjectDir(projectPath), this.getLegacySessionsDir(projectPath)];
  }

  private normalizeForCompare(targetPath: string): string {
    return process.platform === 'win32' ? targetPath.toLowerCase() : targetPath;
  }

  private ensurePathIsWithinDir(baseDir: string, resolvedPath: string): void {
    const normalizedBase = this.normalizeForCompare(path.resolve(baseDir));
    const normalizedResolved = this.normalizeForCompare(path.resolve(resolvedPath));
    if (
      normalizedResolved !== normalizedBase &&
      !normalizedResolved.startsWith(`${normalizedBase}${path.sep}`)
    ) {
      throw new Error('Invalid session ID: path traversal detected');
    }
  }

  private getSessionFilePathInDir(baseDir: string, sessionId: string): string {
    const resolved = path.resolve(baseDir, `${sessionId}.jsonl`);
    this.ensurePathIsWithinDir(baseDir, resolved);
    return resolved;
  }

  private getPreferredSessionDir(projectPath: string): string {
    const nativeDir = this.getNativeProjectDir(projectPath);
    if (existsSync(nativeDir)) {
      return nativeDir;
    }

    const legacyDir = this.getLegacySessionsDir(projectPath);
    if (existsSync(legacyDir)) {
      return legacyDir;
    }

    return nativeDir;
  }

  getSessionFilePath(projectPath: string, sessionId: string): string {
    for (const dirPath of this.getCandidateSessionDirs(projectPath)) {
      const candidate = this.getSessionFilePathInDir(dirPath, sessionId);
      if (existsSync(candidate)) {
        return candidate;
      }
    }

    return this.getSessionFilePathInDir(this.getPreferredSessionDir(projectPath), sessionId);
  }

  private async readJsonObject(filePath: string): Promise<Record<string, unknown>> {
    try {
      const raw = await fs.readFile(filePath, 'utf-8');
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      // Ignore read/parse failures, caller handles defaults.
    }

    return {};
  }

  private async listJsonlFiles(dirPath: string): Promise<string[]> {
    try {
      await fs.access(dirPath);
      const files = await fs.readdir(dirPath);
      return files.filter((file) => file.endsWith('.jsonl'));
    } catch {
      return [];
    }
  }

  private async writeProjectMetadata(projectDir: string, projectPath: string): Promise<void> {
    const metadataPath = path.join(projectDir, 'settings.json');
    await fs.mkdir(projectDir, { recursive: true });

    const existing = await this.readJsonObject(metadataPath);
    const existingNamespaced =
      existing[PROJECT_METADATA_KEY] &&
      typeof existing[PROJECT_METADATA_KEY] === 'object' &&
      !Array.isArray(existing[PROJECT_METADATA_KEY])
        ? (existing[PROJECT_METADATA_KEY] as Record<string, unknown>)
        : {};

    const updated = {
      ...existing,
      [PROJECT_METADATA_KEY]: {
        ...existingNamespaced,
        project_path: projectPath,
        last_accessed: Date.now(),
        accessed_by: 'codeck',
      },
    };

    await fs.writeFile(metadataPath, JSON.stringify(updated, null, 2), 'utf-8');
  }

  // Project Management

  /**
   * Scan all existing projects in ~/.claude/projects/
   * Returns projects with their metadata (path may be null if not tracked).
   */
  async scanExistingProjects(): Promise<ProjectInfo[]> {
    const projectsDir = this.getProjectsRoot();

    try {
      await fs.access(projectsDir);
    } catch {
      return [];
    }

    const entries = await fs.readdir(projectsDir, { withFileTypes: true });
    const projectDirs = entries.filter((entry) => entry.isDirectory());
    const projects: ProjectInfo[] = [];

    for (const dir of projectDirs) {
      const projectKey = dir.name;
      const projectDir = path.join(projectsDir, projectKey);

      try {
        const projectInfo = await this.readProjectMetadata(projectKey);
        if (!projectInfo.path) {
          projectInfo.path = this.decodeNativeProjectDir(projectKey);
        }

        const rootJsonl = await this.listJsonlFiles(projectDir);
        const nestedJsonl = await this.listJsonlFiles(path.join(projectDir, 'sessions'));
        const allJsonl = [...rootJsonl, ...nestedJsonl.map((file) => path.join('sessions', file))];
        projectInfo.sessionCount = allJsonl.length;

        if (!projectInfo.lastAccessed && allJsonl.length > 0) {
          const stats = await Promise.all(
            allJsonl.map((file) => fs.stat(path.join(projectDir, file))),
          );
          projectInfo.lastAccessed = Math.max(...stats.map((item) => item.mtimeMs));
        }

        projects.push(projectInfo);
      } catch (error) {
        if (process.env.NODE_ENV === 'development') {
          process.stderr.write(`Failed to scan project ${projectKey}: ${error}\n`);
        }
      }
    }

    return projects.sort((left, right) => right.lastAccessed - left.lastAccessed);
  }

  private async readProjectMetadata(projectKey: string): Promise<ProjectInfo> {
    const metadataPath = path.join(this.getProjectsRoot(), projectKey, 'settings.json');

    const projectInfo: ProjectInfo = {
      hash: projectKey,
      path: null,
      lastAccessed: 0,
      sessionCount: 0,
    };

    const parsed = await this.readJsonObject(metadataPath);
    const namespaced =
      parsed[PROJECT_METADATA_KEY] &&
      typeof parsed[PROJECT_METADATA_KEY] === 'object' &&
      !Array.isArray(parsed[PROJECT_METADATA_KEY])
        ? (parsed[PROJECT_METADATA_KEY] as Record<string, unknown>)
        : {};

    const pathValue =
      (namespaced.project_path as string | undefined) ??
      (namespaced.original_path as string | undefined) ??
      (parsed.project_path as string | undefined) ??
      (parsed.original_path as string | undefined);
    const lastAccessedValue =
      (namespaced.last_accessed as number | undefined) ??
      (parsed.last_accessed as number | undefined) ??
      0;

    projectInfo.path = pathValue || null;
    projectInfo.lastAccessed = lastAccessedValue;
    return projectInfo;
  }

  /**
   * Try to resolve project path from project directory key.
   */
  async resolveProjectPath(projectKey: string): Promise<string | null> {
    const metadataPath = path.join(this.getProjectsRoot(), projectKey, 'settings.json');
    const parsed = await this.readJsonObject(metadataPath);
    const namespaced =
      parsed[PROJECT_METADATA_KEY] &&
      typeof parsed[PROJECT_METADATA_KEY] === 'object' &&
      !Array.isArray(parsed[PROJECT_METADATA_KEY])
        ? (parsed[PROJECT_METADATA_KEY] as Record<string, unknown>)
        : {};

    const pathFromMetadata =
      (namespaced.project_path as string | undefined) ??
      (namespaced.original_path as string | undefined) ??
      (parsed.project_path as string | undefined) ??
      (parsed.original_path as string | undefined);

    if (pathFromMetadata) {
      return pathFromMetadata;
    }

    return this.decodeNativeProjectDir(projectKey);
  }

  /**
   * Read the ccuiProjectMeta namespace from project settings.
   */
  async getProjectMetadata(projectPath: string): Promise<Record<string, unknown>> {
    const dir = this.getNativeProjectDir(projectPath);
    const metadataPath = path.join(dir, 'settings.json');
    const parsed = await this.readJsonObject(metadataPath);
    const ns = parsed[PROJECT_METADATA_KEY];
    return ns && typeof ns === 'object' && !Array.isArray(ns)
      ? (ns as Record<string, unknown>)
      : {};
  }

  /**
   * Partially update the ccuiProjectMeta namespace in project settings.
   * Merges `partial` into the existing namespace, preserving other keys.
   */
  async updateProjectMetadata(
    projectPath: string,
    partial: Record<string, unknown>,
  ): Promise<void> {
    const dir = this.getNativeProjectDir(projectPath);
    const metadataPath = path.join(dir, 'settings.json');
    await fs.mkdir(dir, { recursive: true });

    const existing = await this.readJsonObject(metadataPath);
    const existingNs =
      existing[PROJECT_METADATA_KEY] &&
      typeof existing[PROJECT_METADATA_KEY] === 'object' &&
      !Array.isArray(existing[PROJECT_METADATA_KEY])
        ? (existing[PROJECT_METADATA_KEY] as Record<string, unknown>)
        : {};

    const updated = {
      ...existing,
      [PROJECT_METADATA_KEY]: { ...existingNs, ...partial },
    };
    await fs.writeFile(metadataPath, JSON.stringify(updated, null, 2), 'utf-8');
  }

  /**
   * Save project metadata for path resolution.
   */
  async saveProjectMetadata(projectPath: string): Promise<void> {
    await Promise.all([
      this.writeProjectMetadata(this.getNativeProjectDir(projectPath), projectPath),
      this.writeProjectMetadata(this.getLegacyProjectDir(projectPath), projectPath),
    ]);
  }

  // Session Management

  /**
   * List all sessions for a project.
   * Parses JSONL files to extract meaningful session names.
   */
  async listSessions(projectPath: string): Promise<Session[]> {
    const sessionsById = new Map<string, Session>();

    for (const dirPath of this.getCandidateSessionDirs(projectPath)) {
      const files = await this.listJsonlFiles(dirPath);
      for (const file of files) {
        const sessionId = file.replace('.jsonl', '');
        if (sessionsById.has(sessionId)) continue;

        const filePath = path.join(dirPath, file);
        try {
          const stats = await fs.stat(filePath);
          const metadata = await extractSessionMetadata(
            (p, e) => fs.readFile(p, e),
            filePath,
          );

          sessionsById.set(sessionId, {
            id: sessionId,
            name: metadata.name || `Session ${sessionId.substring(0, 6)}`,
            projectPath,
            runtime: metadata.runtime || 'claude',
            permissionMode: metadata.permissionMode || 'default',
            createdAt: stats.birthtimeMs,
            updatedAt: stats.mtimeMs,
          });
        } catch (error) {
          if (process.env.NODE_ENV === 'development') {
            process.stderr.write(`Failed to read session file ${file}: ${error}\n`);
          }
        }
      }
    }

    return Array.from(sessionsById.values()).sort((left, right) => right.updatedAt - left.updatedAt);
  }

  /**
   * Parse detailed session info including message count.
   */
  async parseSessionDetails(
    projectPath: string,
    sessionId: string,
  ): Promise<SessionParseResult | null> {
    const filePath = this.getSessionFilePath(projectPath, sessionId);

    return parseSessionDetails(
      (p, e) => fs.readFile(p, e),
      (p) => fs.stat(p),
      filePath,
      sessionId,
      projectPath,
    );
  }

  /**
   * Create a new session with persistence.
   * Creates a JSONL file so the session appears in listSessions.
   */
  async createSession(input: CreateSessionInput): Promise<Session> {
    const id = crypto.randomUUID();
    const now = Date.now();
    const runtime = input.runtime || 'claude';

    const session: Session = {
      id,
      name: input.name,
      projectPath: input.projectPath,
      runtime,
      permissionMode: input.permissionMode,
      createdAt: now,
      updatedAt: now,
    };

    await this.persistSession(session);

    return session;
  }

  /**
   * Persist a specific session header without generating a new session ID.
   * Used when draft sessions need to become canonical before the first message is written.
   */
  async persistSession(session: Session): Promise<void> {
    await this.saveProjectMetadata(session.projectPath);

    const sessionDir = this.getPreferredSessionDir(session.projectPath);
    await fs.mkdir(sessionDir, { recursive: true });

    const filePath = this.getSessionFilePathInDir(sessionDir, session.id);
    try {
      await fs.access(filePath);
      return;
    } catch (error) {
      const isNotFound =
        error instanceof Error && (error as NodeJS.ErrnoException).code === 'ENOENT';
      if (!isNotFound) {
        throw error;
      }
    }

    const createdAt = session.createdAt || Date.now();
    const header = {
      type: 'session_meta',
      session_id: session.id,
      name: session.name,
      project_path: session.projectPath,
      runtime: session.runtime,
      permission_mode: session.permissionMode,
      created_at: createdAt,
      timestamp: createdAt,
    };
    await fs.writeFile(filePath, JSON.stringify(header) + '\n', 'utf-8');
  }

  async deleteSession(projectPath: string, sessionId: string): Promise<void> {
    const sessionFile = this.getSessionFilePath(projectPath, sessionId);

    try {
      await fs.unlink(sessionFile);
    } catch (error) {
      const isNotFound =
        error instanceof Error && (error as NodeJS.ErrnoException).code === 'ENOENT';
      if (!isNotFound) {
        throw error;
      }
    }
  }

  // Message History

  /**
   * Parse all messages from a session JSONL file.
   */
  async getSessionMessages(projectPath: string, sessionId: string): Promise<Message[]> {
    const filePath = this.getSessionFilePath(projectPath, sessionId);
    const messages: Message[] = [];
    const mapper = createSessionJsonlMapper(sessionId);

    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const lines = content.split('\n');

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        try {
          const entry = JSON.parse(trimmed) as RawJsonlEntry;
          const mapped = mapper.mapEntry(entry);
          if (mapped.length > 0) {
            messages.push(...mapped);
          }
        } catch {
          continue;
        }
      }
    } catch (error) {
      const isNotFound =
        error instanceof Error && (error as NodeJS.ErrnoException).code === 'ENOENT';
      if (!isNotFound) {
        throw error;
      }
    } finally {
      mapper.reset();
    }

    return messages;
  }

  /**
   * Append a message to a session file.
   */
  async appendMessage(projectPath: string, sessionId: string, message: Message): Promise<void> {
    const filePath = this.getSessionFilePath(projectPath, sessionId);
    const jsonlEntry = mapMessageToJsonl(message);
    const line = JSON.stringify(jsonlEntry) + '\n';

    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.appendFile(filePath, line, 'utf-8');
  }

  /**
   * Persist runtime binding metadata (e.g. SDK-native session ID) for resume.
   */
  async appendSessionRuntime(
    projectPath: string,
    sessionId: string,
    input: string | SessionRuntimeMetadataInput,
  ): Promise<void> {
    const filePath = this.getSessionFilePath(projectPath, sessionId);
    const metadata = typeof input === 'string' ? { sdkSessionId: input } : input;
    const entry = {
      type: 'session_runtime',
      session_id: sessionId,
      ...(metadata.sdkSessionId ? { sdk_session_id: metadata.sdkSessionId } : {}),
      ...(metadata.runtime ? { runtime_provider: metadata.runtime } : {}),
      ...(metadata.model ? { model: metadata.model } : {}),
      ...(metadata.permissionMode ? { permission_mode: metadata.permissionMode } : {}),
      ...(metadata.cwd ? { cwd: metadata.cwd } : {}),
      ...(metadata.tools && metadata.tools.length > 0 ? { tools: metadata.tools } : {}),
      timestamp: Date.now(),
    };

    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.appendFile(filePath, JSON.stringify(entry) + '\n', 'utf-8');
  }

  async getSessionMetadata(projectPath: string, sessionId: string): Promise<SessionFileMetadata> {
    const filePath = this.getSessionFilePath(projectPath, sessionId);
    return extractSessionMetadata((p, e) => fs.readFile(p, e), filePath);
  }
}

export const claudeFilesService = new ClaudeFilesService();
