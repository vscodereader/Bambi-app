#!/usr/bin/env node
// PR 생성 전 매뉴얼 갱신 가드 (PreToolUse 훅)
//
// Claude가 `gh pr create` 를 Bash 로 실행하려 할 때 이 스크립트가 stdin 으로
// PreToolUse 훅 페이로드를 받아, 브랜치 변경분에 역할군 화면/공용 코드가
// 포함됐는데 대응하는 `docs/manual/*.md` 매뉴얼이 함께 갱신되지 않았으면
// exit 2 로 PR 생성을 차단하고 stderr 로 한국어 안내를 출력한다.
//
// 의존성 없이 Node 표준 라이브러리만 사용한다(Windows·POSIX 공용).
//
// 모드:
//   - stdin 모드(기본): PreToolUse JSON 페이로드를 stdin 으로 받는다.
//   - `--check-files a,b,c` CLI 모드: git 대신 주어진 경로 목록으로 판정하고
//     결과를 stdout 에 출력한다(stdin 을 읽지 않음). 테스트용.
//
// 환경변수:
//   - MANUAL_GUARD_SKIP=1  → 무조건 통과(exit 0).
//   - MANUAL_GUARD_BASE    → PR base 브랜치/ref 를 강제 지정(최우선).

import { execFileSync } from "node:child_process";

const MANUALS = {
	seeker: "docs/manual/seeker-manual.md",
	employer: "docs/manual/employer-manual.md",
	moderator: "docs/manual/moderator-manual.md",
};
const ALL_MANUALS = [MANUALS.seeker, MANUALS.employer, MANUALS.moderator];

/** 경로 구분자를 슬래시로 통일하고 선행 `./` 를 제거한다. */
function norm(p) {
	return p.trim().replace(/\\/g, "/").replace(/^\.\//, "");
}

/**
 * 변경 파일 하나에 대해 갱신이 필요한 매뉴얼 경로 목록을 반환한다.
 * 역할 전용 화면을 먼저 판정하고(먼저 return), 남는 공용 경로를 3종으로 처리한다.
 */
function manualsFor(file) {
	const f = norm(file);

	// 역할 전용 화면 (app 라우트 또는 screens/<role> 접두)
	if (
		f.startsWith("apps/web/src/app/seeker/") ||
		f.startsWith("apps/web/src/components/bambi/screens/seeker")
	) {
		return [MANUALS.seeker];
	}
	if (
		f.startsWith("apps/web/src/app/employer/") ||
		f.startsWith("apps/web/src/components/bambi/screens/employer")
	) {
		return [MANUALS.employer];
	}
	if (
		f.startsWith("apps/web/src/app/moderator/") ||
		f.startsWith("apps/web/src/components/bambi/screens/moderator")
	) {
		return [MANUALS.moderator];
	}

	// 역할 공용 코드 → 매뉴얼 3종 모두
	if (
		f.startsWith("apps/web/src/components/bambi/") ||
		f.startsWith("apps/web/src/lib/bambi/") ||
		f.startsWith("packages/api/src/routers/bambi/")
	) {
		return [...ALL_MANUALS];
	}

	// 그 외 파일은 매뉴얼 불필요
	return [];
}

/**
 * 변경 파일 목록으로 필요한 매뉴얼과 미갱신 매뉴얼을 계산한다.
 * 매뉴얼 자체가 변경 목록에 포함돼 있으면 "갱신됨"으로 간주한다.
 */
function analyze(changedFiles) {
	const normalized = changedFiles.map(norm);
	const changedSet = new Set(normalized);

	// 매뉴얼 경로 → 그 매뉴얼을 요구한 변경 파일 집합
	const requiredBy = new Map();
	for (const file of normalized) {
		for (const manual of manualsFor(file)) {
			if (!requiredBy.has(manual)) requiredBy.set(manual, new Set());
			requiredBy.get(manual).add(file);
		}
	}

	const missing = [];
	for (const [manual, files] of requiredBy) {
		if (!changedSet.has(manual)) {
			missing.push({ manual, files: [...files].sort() });
		}
	}
	missing.sort((a, b) => a.manual.localeCompare(b.manual));

	return { requiredBy, missing };
}

/** 미갱신 매뉴얼 안내 메시지(한국어)를 만든다. */
function buildBlockMessage(missing) {
	const lines = [];
	lines.push("[매뉴얼 갱신 가드] PR 생성을 차단했습니다.");
	lines.push("");
	lines.push(
		"다음 변경 파일에 대응하는 역할군 매뉴얼이 함께 갱신되지 않았습니다:",
	);
	lines.push("");
	for (const { manual, files } of missing) {
		lines.push(`- ${manual} (미갱신)`);
		lines.push("  ↳ 아래 변경 때문에 갱신이 필요합니다:");
		for (const f of files) lines.push(`     - ${f}`);
	}
	lines.push("");
	lines.push("해결 방법:");
	lines.push(
		"  1. 위 매뉴얼을 갱신하세요 (문서 상단 `> 최종 갱신:` 날짜를 오늘 날짜로 반영).",
	);
	lines.push("  2. 갱신한 매뉴얼을 커밋한 뒤 PR 생성을 다시 시도하세요.");
	lines.push("");
	lines.push(
		"급하게 우회해야 한다면 환경변수 MANUAL_GUARD_SKIP=1 을 설정한 뒤 다시 실행하세요.",
	);
	return lines.join("\n");
}

/** git 명령을 실행하고 표준출력을 문자열로 반환한다. 실패 시 throw. */
function git(args) {
	return execFileSync("git", args, {
		encoding: "utf8",
		stdio: ["ignore", "pipe", "pipe"],
	}).trim();
}

/** 주어진 ref 가 커밋으로 확인되면 true. */
function refExists(ref) {
	try {
		git(["rev-parse", "--verify", "--quiet", `${ref}^{commit}`]);
		return true;
	} catch {
		return false;
	}
}

/**
 * PR base ref 를 결정한다.
 * 우선순위: MANUAL_GUARD_BASE env → command 의 --base/-B → 존재하는 첫 기본 ref.
 */
function resolveBase(command) {
	if (process.env.MANUAL_GUARD_BASE) return process.env.MANUAL_GUARD_BASE;

	if (command) {
		// --base <ref> / --base=<ref>
		const longMatch = command.match(/--base(?:=|\s+)(\S+)/);
		if (longMatch) return stripQuotes(longMatch[1]);
		// -B <ref>
		const shortMatch = command.match(/(?:^|\s)-B\s+(\S+)/);
		if (shortMatch) return stripQuotes(shortMatch[1]);
	}

	for (const ref of ["origin/develop", "origin/main", "develop", "main"]) {
		if (refExists(ref)) return ref;
	}
	return null;
}

function stripQuotes(s) {
	return s.replace(/^["']|["']$/g, "");
}

/** base ref 로부터 merge-base 기준 변경 파일 목록을 수집한다. */
function changedFilesFromGit(base) {
	const mergeBase = git(["merge-base", base, "HEAD"]);
	const out = git(["diff", "--name-only", `${mergeBase}...HEAD`]);
	return out
		? out
				.split("\n")
				.map((s) => s.trim())
				.filter(Boolean)
		: [];
}

/** stdin 을 끝까지 읽어 문자열로 반환한다. */
async function readStdin() {
	const chunks = [];
	for await (const chunk of process.stdin) chunks.push(chunk);
	return Buffer.concat(chunks).toString("utf8");
}

const GH_PR_CREATE = /\bgh\s+pr\s+create\b/;

/** CLI `--check-files` 모드: git 없이 주어진 경로로 판정하고 stdout 출력. */
function runCheckFilesMode(rawList) {
	const files = rawList
		.split(",")
		.map((s) => s.trim())
		.filter(Boolean);

	const { requiredBy, missing } = analyze(files);

	const requiredManuals = [...requiredBy.keys()].sort();
	if (requiredManuals.length === 0) {
		process.stdout.write(
			"[매뉴얼 갱신 가드] 매뉴얼 갱신이 필요한 변경이 없습니다. 통과.\n",
		);
		process.exit(0);
	}

	process.stdout.write(
		`[매뉴얼 갱신 가드] 필요한 매뉴얼: ${requiredManuals.join(", ")}\n`,
	);
	if (missing.length === 0) {
		process.stdout.write(
			"모든 필요한 매뉴얼이 변경 목록에 포함되어 있습니다. 통과.\n",
		);
		process.exit(0);
	}

	process.stdout.write(`${buildBlockMessage(missing)}\n`);
	process.exit(2);
}

async function main() {
	// 무조건 우회
	if (process.env.MANUAL_GUARD_SKIP === "1") process.exit(0);

	const argv = process.argv.slice(2);
	const checkFilesIdx = argv.indexOf("--check-files");
	if (checkFilesIdx !== -1) {
		const rawList = argv[checkFilesIdx + 1] ?? "";
		runCheckFilesMode(rawList);
		return; // (runCheckFilesMode 가 process.exit 호출)
	}

	// stdin 모드: PreToolUse 페이로드 파싱
	let payload;
	try {
		const raw = await readStdin();
		payload = JSON.parse(raw);
	} catch (err) {
		// 페이로드 파싱 실패는 가드 오작동일 뿐이므로 PR 을 막지 않는다.
		process.stderr.write(
			`[매뉴얼 갱신 가드] 경고: 훅 입력 파싱 실패로 검사를 건너뜁니다: ${err.message}\n`,
		);
		process.exit(0);
	}

	const toolName = payload?.tool_name;
	const command = payload?.tool_input?.command ?? "";

	// gh pr create 가 아니면 검사 대상이 아니다.
	if (toolName !== "Bash" || !GH_PR_CREATE.test(command)) {
		process.exit(0);
	}

	try {
		const base = resolveBase(command);
		if (!base) {
			process.stderr.write(
				"[매뉴얼 갱신 가드] 경고: base 브랜치를 찾지 못해 검사를 건너뜁니다.\n",
			);
			process.exit(0);
		}

		const changedFiles = changedFilesFromGit(base);
		const { missing } = analyze(changedFiles);

		if (missing.length === 0) {
			// 통과: stdout 을 비워 두어 훅 JSON 파싱과 충돌하지 않게 한다.
			process.exit(0);
		}

		process.stderr.write(`${buildBlockMessage(missing)}\n`);
		process.exit(2);
	} catch (err) {
		// git 실패 등은 PR 을 막지 않는다(가드는 편의 장치지 장벽이 아님).
		process.stderr.write(
			`[매뉴얼 갱신 가드] 경고: 검사 중 오류가 발생해 통과 처리합니다: ${err.message}\n`,
		);
		process.exit(0);
	}
}

main();
