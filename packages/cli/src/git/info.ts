import { execSync } from 'node:child_process';
import type { CiProvider, RunTrigger } from '@promptcheck/shared';

export interface GitMetadata {
  branch: string;
  commitSha: string;
  commitAuthor: string | null;
  trigger: RunTrigger;
  ciProvider: CiProvider;
  ciRunUrl: string | null;
}

function runGit(command: string): string | null {
  try {
    return execSync(command, { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return null;
  }
}

/**
 * Sanitiza o nome do autor garantindo conformidade com a LGPD:
 * Nunca retorna e-mails (se contiver '@', é descartado).
 */
export function sanitizeAuthorName(rawName: string | null | undefined): string | null {
  if (!rawName) return null;
  const trimmed = rawName.trim();
  if (!trimmed || trimmed.includes('@')) {
    return null;
  }
  return trimmed.slice(0, 100);
}

/**
 * Coleta o autor do commit seguindo rigorosamente a ordem de precedência aprovada:
 * 1. GITHUB_ACTOR / GITLAB_USER_LOGIN
 * 2. git log -1 --format=%an
 * 3. git config user.name
 */
export function resolveCommitAuthor(): string | null {
  const ciActor = process.env.GITHUB_ACTOR || process.env.GITLAB_USER_LOGIN;
  if (ciActor) {
    const sanitized = sanitizeAuthorName(ciActor);
    if (sanitized) return sanitized;
  }

  const gitAuthor = runGit('git log -1 --format=%an');
  if (gitAuthor) {
    const sanitized = sanitizeAuthorName(gitAuthor);
    if (sanitized) return sanitized;
  }

  const gitConfigName = runGit('git config user.name');
  if (gitConfigName) {
    const sanitized = sanitizeAuthorName(gitConfigName);
    if (sanitized) return sanitized;
  }

  return null;
}

/**
 * Coleta todos os metadados do repositório Git e do ambiente de CI
 */
export function collectGitMetadata(): GitMetadata {
  // Branch
  let branch =
    process.env.GITHUB_REF_NAME ||
    process.env.CI_COMMIT_REF_NAME ||
    runGit('git rev-parse --abbrev-ref HEAD') ||
    'main';

  if (branch.startsWith('refs/heads/')) {
    branch = branch.replace('refs/heads/', '');
  }

  // Commit SHA
  const commitSha =
    process.env.GITHUB_SHA ||
    process.env.CI_COMMIT_SHA ||
    runGit('git rev-parse HEAD') ||
    '0000000000000000000000000000000000000000';

  // CI Provider & Run URL
  let ciProvider: CiProvider = 'local';
  let ciRunUrl: string | null = null;
  let trigger: RunTrigger = 'manual';

  if (process.env.GITHUB_ACTIONS === 'true') {
    ciProvider = 'github_actions';
    const server = process.env.GITHUB_SERVER_URL || 'https://github.com';
    const repo = process.env.GITHUB_REPOSITORY;
    const runId = process.env.GITHUB_RUN_ID;
    if (repo && runId) {
      ciRunUrl = `${server}/${repo}/actions/runs/${runId}`;
    }

    const eventName = process.env.GITHUB_EVENT_NAME;
    if (eventName === 'pull_request') trigger = 'pull_request';
    else if (eventName === 'schedule') trigger = 'schedule';
    else if (eventName === 'push') trigger = 'push';
    else trigger = 'push';
  } else if (process.env.GITLAB_CI === 'true') {
    ciProvider = 'gitlab_ci';
    ciRunUrl = process.env.CI_PIPELINE_URL || null;
    trigger = 'push';
  }

  return {
    branch,
    commitSha: commitSha.slice(0, 40),
    commitAuthor: resolveCommitAuthor(),
    trigger,
    ciProvider,
    ciRunUrl,
  };
}
