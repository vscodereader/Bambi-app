import { runListingPromotionTick } from "@bambi-app/api/services/bambi-listing-promotion";
import type { FastifyPluginCallback } from "fastify";

// 리스팅(스페셜/추천) 대기열 승격 틱 스케줄러. 60초마다 서비스 함수를 호출한다. 상태는
// 메모리에 두지 않고 매 틱 DB 기준으로 재계산하므로 서버 재시작에도 대기열이 이어서 승격된다.
const TICK_INTERVAL_MS = 60_000;

export const listingPromotionPlugin: FastifyPluginCallback = (
	app,
	_opts,
	done
) => {
	// 재진입 가드: 이전 틱이 끝나지 않았으면 이번 틱은 건너뛴다(느린 DB에서 중첩 실행 방지).
	let running = false;

	const timer = setInterval(() => {
		if (running) {
			return;
		}
		running = true;

		runListingPromotionTick(new Date())
			.then((promoted) => {
				if (promoted > 0) {
					app.log.info({ promoted }, "listing promotion tick promoted jobs");
				}
			})
			.catch((error) => {
				app.log.error(error, "listing promotion tick failed");
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
