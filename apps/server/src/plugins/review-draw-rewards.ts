import { runReviewDrawRewardTick } from "@bambi-app/api/services/bambi-review-draw-rewards";
import type { FastifyPluginCallback } from "fastify";

const TICK_INTERVAL_MS = 60 * 1000;

export const reviewDrawRewardsPlugin: FastifyPluginCallback = (
	app,
	_opts,
	done
) => {
	let running = false;
	const tick = () => {
		if (running) {
			return;
		}
		running = true;
		runReviewDrawRewardTick(new Date())
			.then(({ awarded, disqualified }) => {
				if (awarded > 0 || disqualified > 0) {
					app.log.info(
						{ awarded, disqualified },
						"review draw rewards processed"
					);
				}
			})
			.catch((error) => app.log.error(error, "review draw rewards tick failed"))
			.finally(() => {
				running = false;
			});
	};
	tick();
	const timer = setInterval(tick, TICK_INTERVAL_MS);
	app.addHook("onClose", (_instance, hookDone) => {
		clearInterval(timer);
		hookDone();
	});
	done();
};
