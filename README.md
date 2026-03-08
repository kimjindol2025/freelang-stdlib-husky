# freelang-stdlib-husky

FreeLang v2 stdlib — `husky.fl` + `stdlib-husky.ts`

**작업지시서 #23 구현체**  
npm husky 완전 대체 (외부 npm 0개, Node.js 내장 fs/child_process/path만 사용)

## 파일 구성

| 파일 | 줄 수 | 설명 |
|------|-------|------|
| `husky.fl` | 361줄 | FreeLang stdlib 인터페이스 |
| `stdlib-husky.ts` | 298줄 | 네이티브 TypeScript 구현 |

## 지원 hooks

`pre-commit` / `commit-msg` / `pre-push` / `post-merge` / `post-checkout` / `pre-rebase` / `prepare-commit-msg` / `post-commit` / `pre-receive` / `update`

## 사용 예시

```fl
import "husky"

// 1회 초기화
install(".husky")

// hook 추가
add("pre-commit", "fl lint.fl && fl test.fl")
add("commit-msg", "fl commitlint.fl $1")
add("pre-push",   "fl test.fl --coverage")

// 목록/제거
let hooks = list()
remove("pre-push")

// 수동 실행 (테스트)
run("pre-commit")

// 상태 출력
status()
```

## hooks 설치 방식

1. `fs.mkdirSync(".husky")` — 디렉토리 생성
2. `fs.writeFileSync(".husky/pre-commit", script)` — 스크립트 파일 작성
3. `fs.chmodSync(".husky/pre-commit", 0o755)` — chmod +x 자동 부여
4. `spawnSync("git", ["config", "core.hooksPath", ".husky"])` — git config 설정

## 보안

- `exec()` / `execSync()` 미사용 → shell 인젝션 방지
- `spawnSync('sh', [filePath, ...args])` — 파일을 직접 sh에 전달

---
작성일: 2026-03-09 | 작업지시서 #23
