# 수집 커뮤니티 기능 실행·커밋 안내

작업 브랜치: `feat/crawled-community-board-editing`
작업 경로: `C:\Users\user\bambi.worktrees\crawled-community-board-editing`

에이전트는 커밋·푸시·머지, 앱 빌드·개발 서버 실행, 실제 개발 DB 마이그레이션 적용을 하지 않았다. 아래 명령은 사용자가 직접 실행한다.

## 1. 의존성과 환경 파일

현재 작업 폴더의 의존성 설치는 완료했다. 아래 명령은 재설치가 필요할 때도 같은 잠금 파일을 사용하며, 원본 환경 파일은 대상이 없을 때만 복사한다.

```powershell
Set-Location 'C:\Users\user\bambi.worktrees\crawled-community-board-editing'
pnpm install --frozen-lockfile
if ($LASTEXITCODE -ne 0) { throw '의존성 설치 실패' }
if (-not (Test-Path -LiteralPath 'apps\server\.env')) {
    Copy-Item -LiteralPath 'C:\Users\user\bambi\apps\server\.env' -Destination 'apps\server\.env'
}
if (-not (Test-Path -LiteralPath 'apps\web\.env')) {
    Copy-Item -LiteralPath 'C:\Users\user\bambi\apps\web\.env' -Destination 'apps\web\.env'
}
```

## 2. 마이그레이션

새 파일은 `0116_crawled_community_board_editing.sql`이다. 격리된 PostgreSQL 18에서 이전 이력과 새 SQL을 적용하고 기존 글·댓글 보존을 확인했다.

개발 DB는 읽기 전용으로 다시 확인했다. `0114_light_talos`, `0115_user-presence`, `0116_crawled_community_board_editing`까지 적용되어 있다. 다른 환경에 배포할 때는 적용 직전에 이력을 다시 확인한다. 과거 기록 23건의 해시는 현재 저장소 파일과 일치하지 않으며 그 기록이나 기존 migration은 수정하지 않았다. 아래 명령은 apps/server/.env에 연결된 DB에 실제 적용하므로, 작업 후 다른 migration이 추가됐으면 먼저 최신 develop과 이력을 다시 확인한다.

```powershell
Set-Location 'C:\Users\user\bambi.worktrees\crawled-community-board-editing'
pnpm --filter @bambi-app/db db:migrate
if ($LASTEXITCODE -ne 0) { throw '마이그레이션 실패. 재실행 전 오류와 적용 이력을 확인해 주세요.' }
```

## 3. 서버 터미널

```powershell
Set-Location 'C:\Users\user\bambi.worktrees\crawled-community-board-editing'
if (-not (Test-Path -LiteralPath 'apps\server\.env')) {
    Copy-Item -LiteralPath 'C:\Users\user\bambi\apps\server\.env' -Destination 'apps\server\.env'
}
pnpm dev:server
```

## 4. 웹 터미널

```powershell
Set-Location 'C:\Users\user\bambi.worktrees\crawled-community-board-editing'
if (-not (Test-Path -LiteralPath 'apps\web\.env')) {
    Copy-Item -LiteralPath 'C:\Users\user\bambi\apps\web\.env' -Destination 'apps\web\.env'
}
$env:WATCHPACK_POLLING = 'true'
pnpm --filter web exec next dev --port 23001
```

## 5. 화면 확인

1. 관리자 → 크롤러 → 커뮤니티에서 수집할 게시판과 편집 글 표시 등급을 선택한다. 등급은 먼저 저장해야 편집 저장이 가능하다.
2. 게시판을 선택해 즉시수집한다. 같은 원본을 다른 게시판으로 수집한 뒤 글·댓글이 독립인지 확인한다.
3. 관리자 목록의 편집 또는 수다방 상세의 편집으로 제목·이미지·서식을 수정한다.
4. 원본 수집 댓글의 수정 버튼으로 편집한다. 댓글만 수정했을 때 글 작성자는 유지되고 글 날짜·노출 순서는 바뀌어야 한다.
5. 비밀게시판 수정 전후 밤비·여성 표시와 기존 접근 권한을 확인한다.
6. 목록·모바일 드롭다운·취소·오류·등급 변경 반영을 확인한다. 실제 브라우저 수동 확인은 아직 수행하지 않았다.

## 6. 커밋 전 확인

이 명령은 최신 develop이 현재 브랜치에 포함되지 않았으면 중단한다. 그 경우 변경을 보존한 채 develop 반영·충돌 해결을 먼저 해야 한다.

```powershell
Set-Location 'C:\Users\user\bambi.worktrees\crawled-community-board-editing'
if ((git branch --show-current).Trim() -ne 'feat/crawled-community-board-editing') { throw '작업 브랜치를 확인해 주세요.' }
git fetch origin develop
if ($LASTEXITCODE -ne 0) { throw 'fetch 실패' }
git merge-base --is-ancestor origin/develop HEAD
if ($LASTEXITCODE -ne 0) { throw '최신 develop 반영과 충돌 해결이 먼저 필요합니다.' }
git diff --check
if ($LASTEXITCODE -ne 0) { throw '변경 파일 공백 오류를 확인해 주세요.' }
git status --short
```

## 7. DB·API·설계 커밋

제목과 상세 본문을 BOM 없는 UTF-8 파일로 저장한다. PowerShell에서 표시한 한글을 확인한 뒤 Git이 같은 파일을 읽게 한다.

```powershell
$files = @(
    'docs/superpowers/plans/2026-09-03-crawled-community-board-editing.md',
    'docs/superpowers/plans/2026-09-03-crawled-community-runbook.md',
    'packages/api/src/routers/bambi/community-boards.ts',
    'packages/api/src/routers/bambi/community.ts',
    'packages/api/src/routers/bambi/crawled-community-edit.ts',
    'packages/api/src/routers/bambi/crawler.ts',
    'packages/api/src/routers/bambi/member-grades.ts',
    'packages/api/src/services/bambi-community-post-policy.ts',
    'packages/api/src/services/bambi-crawl-ingest.ts',
    'packages/api/src/services/bambi-crawl-queenalba.ts',
    'packages/api/src/services/bambi-crawled-community-policy.ts',
    'packages/api/src/services/bambi-crawled-community.ts',
    'packages/api/test/routers/bambi/community.test.ts',
    'packages/api/test/routers/bambi/crawled-community-edit.test.ts',
    'packages/api/test/routers/bambi/crawler.test.ts',
    'packages/api/test/services/bambi-crawled-community-policy.test.ts',
    'packages/db/src/migrations/0116_crawled_community_board_editing.sql',
    'packages/db/src/migrations/meta/0116_snapshot.json',
    'packages/db/src/migrations/meta/_journal.json',
    'packages/db/src/schema/bambi.ts'
)
git add -- @files
if ($LASTEXITCODE -ne 0) { throw 'git add 실패' }
$commitMessage = @'
feat: 수집 커뮤니티 게시판별 저장과 관리자 편집 API 추가

- 수집 목적 게시판을 DB에서 선택·저장하고 즉시·예약 수집 회차에 고정
- 같은 원본도 게시판별 독립 ID와 댓글을 가지도록 복합 유니크 변경
- 기존 글 ID·본문·댓글을 보존하는 Drizzle 0116 마이그레이션 추가
- 원본과 관리자 편집값 분리, 수집 댓글 안정 ID 및 revision 충돌 검사
- 실제 게시판 권한과 비밀게시판 밤비·여성 표시 재사용; 포인트 열람 기능 추가 없음
- 글·댓글 작성자 변경을 분리하고 편집 시 최신순·30일 노출 기간 갱신
- 기존 등급 선택·변경을 과거 편집 글·댓글에 반영
- 검증: 격리 PostgreSQL 마이그레이션 적용·보존 확인, 관련 API 150건 통과
- 기존 커뮤니티 전체 테스트 6건 실패는 변경 전 develop에서도 동일하게 재현
'@
$commitMessagePath = Join-Path $env:TEMP 'bambi-crawled-api-commit.txt'
[System.IO.File]::WriteAllText($commitMessagePath, $commitMessage, (New-Object System.Text.UTF8Encoding($false)))
Get-Content -LiteralPath $commitMessagePath -Encoding UTF8
git -c i18n.commitEncoding=UTF-8 commit -F $commitMessagePath
if ($LASTEXITCODE -ne 0) { throw '커밋 실패. 출력 내용을 확인해 주세요.' }
```

## 8. 웹·운영자 매뉴얼 커밋

```powershell
$files = @(
    'apps/web/src/app/moderator/crawler/community/[id]/edit/page.tsx',
    'apps/web/src/app/moderator/crawler/crawled-content-cards.tsx',
    'apps/web/src/app/moderator/crawler/page.tsx',
    'apps/web/src/app/moderator/member-grades/page.tsx',
    'apps/web/src/components/bambi/community-post-detail-parts.tsx',
    'apps/web/src/components/bambi/community-post-form.tsx',
    'apps/web/src/components/bambi/crawled-source-comments.tsx',
    'apps/web/src/components/bambi/screens/community-crawled-topic-detail.tsx',
    'apps/web/src/lib/bambi/community.ts',
    'docs/manual/moderator-manual.md'
)
git add -- @files
if ($LASTEXITCODE -ne 0) { throw 'git add 실패' }
$commitMessage = @'
feat(web): 수집 게시판 선택과 기존 글·댓글 편집기 연결

- 베스트를 제외한 모든 DB 게시판을 드롭다운에 표시하고 신규 게시판 재조회
- 편집 글·댓글 표시 등급 선택 및 설정 변경 후 캐시 갱신
- 운영자 수집 목록·수다방 상세에서 기존 CommunityPostForm 편집기로 연결
- 원본 수집 댓글만 기존 CommentEditForm으로 편집하고 밤비 댓글 권한 유지
- 수정 본문은 기존 Tiptap 뷰어, 작성자·성별·등급은 기존 공용 컴포넌트 재사용
- 운영자 매뉴얼·설계·실행 명령과 검증 결과 기록
- 검증: API/web 타입 검사, 변경 TS/TSX Biome 검사, 웹 회귀 25건 통과
- 브라우저 수동 동작은 미검증; 개발 서버·빌드·공유 개발 DB 적용은 수행하지 않음
'@
$commitMessagePath = Join-Path $env:TEMP 'bambi-crawled-web-commit.txt'
[System.IO.File]::WriteAllText($commitMessagePath, $commitMessage, (New-Object System.Text.UTF8Encoding($false)))
Get-Content -LiteralPath $commitMessagePath -Encoding UTF8
git -c i18n.commitEncoding=UTF-8 commit -F $commitMessagePath
if ($LASTEXITCODE -ne 0) { throw '커밋 실패. 출력 내용을 확인해 주세요.' }
```

## 9. 푸시

```powershell
git status --short
git push -u origin feat/crawled-community-board-editing
if ($LASTEXITCODE -ne 0) { throw '푸시 실패. 출력 내용을 확인해 주세요.' }
```

이슈 #293을 작성했다. 푸시 후 PR은 `Closes #293`을 넣고 CMU02의 최신 작성 형식에 맞춘다. 최종 머지는 동료가 수행한다.
