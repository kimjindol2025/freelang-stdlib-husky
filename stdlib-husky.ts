/**
 * FreeLang v2 stdlib — stdlib-husky.ts
 *
 * npm husky 완전 대체 네이티브 구현
 * Node.js 내장 fs / child_process(spawnSync) / path 모듈만 사용 (외부 npm 0개)
 *
 * 보안: shell 인젝션 방지 — exec/execSync 대신 spawnSync 사용 (셸 없이 직접 실행)
 *
 * 등록 함수:
 *   husky_install(hooksDir, gitDir)         → bool
 *   husky_add(hooksDir, hook, cmd)          → bool
 *   husky_remove(hooksDir, hook)            → bool
 *   husky_list(hooksDir)                    → string[]
 *   husky_exists(hooksDir, hook)            → bool
 *   husky_read(hooksDir, hook)              → string
 *   husky_run(hooksDir, hook, args)         → int (exit code)
 *   husky_set_git_config(gitDir, hooksDir)  → bool
 *   husky_unset_git_config(gitDir)          → bool
 *   husky_find_git_dir(projectDir)          → string
 *
 * hooks 스크립트 구조:
 *   #!/bin/sh
 *   # husky - FreeLang Git Hook Manager
 *   <cmd>
 *
 * 설치 방식:
 *   1. fs.mkdirSync(hooksDir, { recursive: true })
 *   2. fs.writeFileSync(hookPath, scriptContent)
 *   3. fs.chmodSync(hookPath, 0o755)          ← chmod +x
 *   4. spawnSync('git', ['config', 'core.hooksPath', hooksDir])
 */

import { NativeFunctionRegistry } from './vm/native-function-registry';
import * as fs   from 'fs';
import * as path from 'path';
import { spawnSync } from 'child_process';

// ─────────────────────────────────────────────────────────────────────────────
// 상수
// ─────────────────────────────────────────────────────────────────────────────

/** hook 스크립트 헤더 (POSIX sh) */
const SCRIPT_HEADER = '#!/bin/sh\n# husky - FreeLang Git Hook Manager\n\n';

// ─────────────────────────────────────────────────────────────────────────────
// 내부 유틸
// ─────────────────────────────────────────────────────────────────────────────

/** hook 파일 전체 경로 */
function hookPath(hooksDir: string, hook: string): string {
  return path.join(hooksDir, hook);
}

/** hook 스크립트 내용 생성 */
function buildScript(cmd: string): string {
  return SCRIPT_HEADER + cmd + '\n';
}

/**
 * .git 디렉토리를 startDir에서 상위로 탐색
 * 반환: .git 절대 경로 (없으면 "")
 */
function findGitDir(startDir: string): string {
  let current = path.resolve(startDir);
  const root   = path.parse(current).root;

  while (current !== root) {
    const candidate = path.join(current, '.git');
    try {
      if (fs.statSync(candidate).isDirectory()) return candidate;
    } catch {}
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return '';
}

/**
 * git config core.hooksPath 설정
 * spawnSync 사용 — 셸 없이 직접 git 실행 (인젝션 방지)
 */
function setGitConfig(gitDir: string, hooksDir: string): boolean {
  const workTree = path.dirname(gitDir);
  const result = spawnSync(
    'git',
    ['config', 'core.hooksPath', hooksDir],
    { cwd: workTree, encoding: 'utf-8' }
  );
  return result.status === 0;
}

/**
 * git config --local --unset core.hooksPath
 */
function unsetGitConfig(gitDir: string): boolean {
  const workTree = path.dirname(gitDir);
  const result = spawnSync(
    'git',
    ['config', '--local', '--unset', 'core.hooksPath'],
    { cwd: workTree, encoding: 'utf-8' }
  );
  // exit code 5 = key not found → 이미 제거된 상태로 정상 처리
  return result.status === 0 || result.status === 5;
}

// ─────────────────────────────────────────────────────────────────────────────
// registerHuskyFunctions — 메인 등록 함수
// ─────────────────────────────────────────────────────────────────────────────

export function registerHuskyFunctions(registry: NativeFunctionRegistry): void {

  // ── husky_install ──────────────────────────────────────────────────────────
  // husky_install(hooksDir, gitDir) → bool
  // hooksDir 디렉토리 생성 + .gitkeep + 버전 파일
  registry.register({
    name: 'husky_install',
    module: 'husky',
    executor: (args) => {
      const hooksDir = String(args[0] ?? '.husky');
      try {
        fs.mkdirSync(hooksDir, { recursive: true });

        const keepFile = path.join(hooksDir, '.gitkeep');
        if (!fs.existsSync(keepFile)) {
          fs.writeFileSync(keepFile, '');
        }
        fs.writeFileSync(
          path.join(hooksDir, '.husky-version'),
          'FreeLang-Husky/2.0\n'
        );
        return true;
      } catch {
        return false;
      }
    }
  });

  // ── husky_add ─────────────────────────────────────────────────────────────
  // husky_add(hooksDir, hook, cmd) → bool
  // hook 스크립트 파일 생성 + chmod +x (0o755)
  registry.register({
    name: 'husky_add',
    module: 'husky',
    executor: (args) => {
      const hooksDir = String(args[0] ?? '.husky');
      const hook     = String(args[1] ?? '');
      const cmd      = String(args[2] ?? '');

      if (!hook || !cmd) return false;

      try {
        fs.mkdirSync(hooksDir, { recursive: true });
        const filePath = hookPath(hooksDir, hook);
        fs.writeFileSync(filePath, buildScript(cmd), { encoding: 'utf-8' });
        fs.chmodSync(filePath, 0o755);  // chmod +x
        return true;
      } catch {
        return false;
      }
    }
  });

  // ── husky_remove ──────────────────────────────────────────────────────────
  // husky_remove(hooksDir, hook) → bool
  registry.register({
    name: 'husky_remove',
    module: 'husky',
    executor: (args) => {
      const hooksDir = String(args[0] ?? '.husky');
      const hook     = String(args[1] ?? '');
      try {
        fs.unlinkSync(hookPath(hooksDir, hook));
        return true;
      } catch {
        return false;
      }
    }
  });

  // ── husky_list ────────────────────────────────────────────────────────────
  // husky_list(hooksDir) → string[]
  // 실행 가능한 hook 파일 이름 목록 (숨김/메타 파일 제외)
  registry.register({
    name: 'husky_list',
    module: 'husky',
    executor: (args) => {
      const hooksDir = String(args[0] ?? '.husky');
      try {
        return fs.readdirSync(hooksDir).filter(name => {
          if (name.startsWith('.'))        return false; // 숨김 파일
          if (name.endsWith('-version'))   return false; // 메타 파일
          const fullPath = path.join(hooksDir, name);
          try {
            const stat = fs.statSync(fullPath);
            return stat.isFile() && (stat.mode & 0o111) !== 0; // 실행권한 확인
          } catch { return false; }
        });
      } catch {
        return [];
      }
    }
  });

  // ── husky_exists ──────────────────────────────────────────────────────────
  // husky_exists(hooksDir, hook) → bool
  registry.register({
    name: 'husky_exists',
    module: 'husky',
    executor: (args) => {
      const hooksDir = String(args[0] ?? '.husky');
      const hook     = String(args[1] ?? '');
      return fs.existsSync(hookPath(hooksDir, hook));
    }
  });

  // ── husky_read ────────────────────────────────────────────────────────────
  // husky_read(hooksDir, hook) → string
  // 헤더(shebang/#주석) 제거 후 실제 명령어만 반환
  registry.register({
    name: 'husky_read',
    module: 'husky',
    executor: (args) => {
      const hooksDir = String(args[0] ?? '.husky');
      const hook     = String(args[1] ?? '');
      try {
        const content = fs.readFileSync(hookPath(hooksDir, hook), 'utf-8');
        return content
          .split('\n')
          .filter(l => l.trim() && !l.startsWith('#') && !l.startsWith('#!/'))
          .join('\n')
          .trim();
      } catch {
        return '';
      }
    }
  });

  // ── husky_run ─────────────────────────────────────────────────────────────
  // husky_run(hooksDir, hook, args) → int (exit code)
  // spawnSync('sh', [filePath, ...extraArgs]) — 셸 인젝션 방지
  registry.register({
    name: 'husky_run',
    module: 'husky',
    executor: (args) => {
      const hooksDir  = String(args[0] ?? '.husky');
      const hook      = String(args[1] ?? '');
      const extraArgs = Array.isArray(args[2])
        ? (args[2] as unknown[]).map(String)
        : [];

      const filePath = hookPath(hooksDir, hook);
      if (!fs.existsSync(filePath)) return 1;

      try { fs.chmodSync(filePath, 0o755); } catch {}

      // spawnSync: 셸을 거치지 않고 sh에 파일을 직접 전달 → 인젝션 불가
      const result = spawnSync(
        'sh',
        [filePath, ...extraArgs],
        { stdio: 'inherit', timeout: 60000 }
      );
      return result.status ?? 1;
    }
  });

  // ── husky_set_git_config ──────────────────────────────────────────────────
  // husky_set_git_config(gitDir, hooksDir) → bool
  registry.register({
    name: 'husky_set_git_config',
    module: 'husky',
    executor: (args) => {
      const gitDir   = String(args[0] ?? '.git');
      const hooksDir = String(args[1] ?? '.husky');
      return setGitConfig(gitDir, hooksDir);
    }
  });

  // ── husky_unset_git_config ────────────────────────────────────────────────
  // husky_unset_git_config(gitDir) → bool
  registry.register({
    name: 'husky_unset_git_config',
    module: 'husky',
    executor: (args) => {
      return unsetGitConfig(String(args[0] ?? '.git'));
    }
  });

  // ── husky_find_git_dir ────────────────────────────────────────────────────
  // husky_find_git_dir(projectDir) → string
  registry.register({
    name: 'husky_find_git_dir',
    module: 'husky',
    executor: (args) => {
      return findGitDir(String(args[0] ?? '.'));
    }
  });
}
