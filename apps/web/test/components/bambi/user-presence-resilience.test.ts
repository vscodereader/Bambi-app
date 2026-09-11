import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const workspaceSource = (path: string): string =>
	readFileSync(resolve(process.cwd(), "../..", path), "utf8");

const activityIntent = workspaceSource(
	"apps/web/src/lib/bambi/user-activity-intent.ts"
);
const nativeOrpc = workspaceSource("apps/native/src/lib/orpc.ts");
const nativeLifecycle = workspaceSource(
	"apps/native/src/components/user-presence-lifecycle.tsx"
);
const apiContext = workspaceSource("packages/api/src/context.ts");
const presenceDb = workspaceSource(
	"packages/api/src/services/bambi-user-presence-db.ts"
);
const attendanceRouter = workspaceSource(
	"packages/api/src/routers/bambi/attendance.ts"
);
const moderationRouter = workspaceSource(
	"packages/api/src/routers/bambi/moderation.ts"
);
const moderatorContext = workspaceSource(
	"apps/web/src/components/bambi/screens/moderator-context.tsx"
);

describe("사용자 presence 리뷰 회귀", () => {
	it("재연결이 명시적 종료 시각을 해제한다", () => {
		expect(presenceDb).toContain(".set({ presenceDisconnectedAt: null })");
	});

	it("설정 조회 promise와 presence 부가 기록 실패를 안전하게 처리한다", () => {
		expect(attendanceRouter).not.toContain("offlineAfterMinutesPromise");
		expect(moderationRouter).not.toContain("offlineAfterMinutesPromise");
		expect(apiContext).toContain(
			"recordUserActivity(session.user.id).catch(() => false)"
		);
	});

	it("스토리지와 Web Crypto가 제한돼도 인메모리 UUID로 폴백한다", () => {
		expect(activityIntent).toContain('typeof crypto !== "undefined"');
		expect(activityIntent).toContain("memoryPresenceConnectionId");
		expect(
			activityIntent.match(/catch \{/g)?.length ?? 0
		).toBeGreaterThanOrEqual(3);
	});

	it("대형 운영자 context는 presence tick을 구독하지 않는다", () => {
		expect(moderatorContext).not.toContain("useModeratorPresenceStream");
		expect(moderatorContext).not.toContain("livePresence");
	});

	it("Native 자동 lifecycle 요청만 path 단위로 활동에서 제외한다", () => {
		expect(nativeOrpc).not.toContain("automaticRequestDepth");
		expect(nativeOrpc).toContain('path[1] === "presence"');
		expect(nativeLifecycle).toContain("let shouldBeConnected");
		expect(nativeLifecycle).toContain("if (connectPromise)");
	});
});
