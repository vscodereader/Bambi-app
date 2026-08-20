import { runPointShopExpiryNotifyTick } from "@bambi-app/api/services/bambi-point-shop-expiry";
import type { FastifyPluginCallback } from "fastify";

// 포인트몰 보유 아이템(끌올·연장) 만료 임박 알림 스케줄러. 상태는 메모리에 두지 않고
// 매 틱 DB 기준으로 재계산하며, 발송 여부는 expiry_notified_at 멱등 각인이 정본이라
// 서버가 재시작하거나 인스턴스가 늘어도 한 건당 한 번만 나간다. 그래서 틱 간격은
// 촘촘할 이유가 없어 6시간으로 둔다.
const TICK_INTERVAL_MS = 6 * 60 * 60 * 1000;

export const pointShopExpiryPlugin: FastifyPluginCallback = (
	app,
	_opts,
	done
) => {
	// 재진입 가드: 이전 틱이 끝나지 않았으면 이번 틱은 건너뛴다.
	let running = false;

	const tick = () => {
		if (running) {
			return;
		}
		running = true;

		runPointShopExpiryNotifyTick(new Date())
			.then(({ notifiedCount }) => {
				if (notifiedCount > 0) {
					app.log.info({ notifiedCount }, "point-shop expiry notified");
				}
			})
			.catch((error) => {
				app.log.error(error, "point-shop expiry tick failed");
			})
			.finally(() => {
				running = false;
			});
	};

	const timer = setInterval(tick, TICK_INTERVAL_MS);

	app.addHook("onClose", (_instance, hookDone) => {
		clearInterval(timer);
		hookDone();
	});

	done();
};
