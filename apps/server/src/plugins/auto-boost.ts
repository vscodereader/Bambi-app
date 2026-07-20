import { runAutoBoostTick } from "@bambi-app/api/services/bambi-auto-boost";
import type { FastifyPluginCallback } from "fastify";

// 자동 끌어올리기 틱 스케줄러. 60초마다 서비스 함수를 호출한다. 상태는 메모리에 두지 않고
// 매 틱 DB 기준으로 재계산하므로 서버 재시작에도 당일 내 캐치업된다.
const TICK_INTERVAL_MS = 60_000;

export const autoBoostPlugin: FastifyPluginCallback = (app, _opts, done) => {
	// 재진입 가드: 이전 틱이 끝나지 않았으면 이번 틱은 건너뛴다(느린 DB에서 중첩 실행 방지).
	let running = false;

	const timer = setInterval(() => {
		if (running) {
			return;
		}
		running = true;

		runAutoBoostTick(new Date())
			.then((fired) => {
				if (fired > 0) {
					app.log.info({ fired }, "auto-boost tick fired boosts");
				}
			})
			.catch((error) => {
				app.log.error(error, "auto-boost tick failed");
			})
			.finally(() => {
				running = false;
			});
	}, TICK_INTERVAL_MS);

	app.addHook("onClose", (_instance, hookDone) => {
		clearInterval(timer);
		hookDone();
	});

	done();
};
