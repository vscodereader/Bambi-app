import { runScheduledWithdrawalPurge } from "@bambi-app/api/services/bambi-withdrawal-purge";
import type { FastifyPluginCallback } from "fastify";

// 탈퇴 계정 잔여 식별값 파기 스케줄러. 틱은 자주 돌지만 실제 실행 여부는 매 틱 DB에서 판단한다
// (crawl 플러그인과 같은 구조) — 실행 시각(bambi_site_settings.withdrawal_purge_hour)과 마지막
// 실행 시각이 모두 DB에 있어 프로세스 메모리에 상태가 남지 않는다. 그래서 서버를 재시작해도
// 그날 몫이 밀리지 않고(다음 틱에 캐치업), 인스턴스가 늘어도 하루 한 번이 유지되며, 운영자가
// 사이트 정보에서 시각을 바꾸면 재배포 없이 다음 틱부터 반영된다.
// 틱 간격은 crawl 플러그인과 같은 10분이다. 설정 단위가 "시"라 이보다 촘촘할 이유가 없고,
// 실행은 설정 시각 이후 첫 틱에 시작한다.
const TICK_INTERVAL_MS = 10 * 60 * 1000;

export const withdrawalPurgePlugin: FastifyPluginCallback = (
	app,
	_opts,
	done
) => {
	// 재진입 가드: 이전 실행이 끝나지 않았으면 이번 틱은 건너뛴다.
	let running = false;

	const tick = () => {
		if (running) {
			return;
		}
		running = true;

		runScheduledWithdrawalPurge()
			.then(({ purgedCount, ran }) => {
				if (ran && purgedCount > 0) {
					app.log.info({ purgedCount }, "withdrawal purge completed");
				}
			})
			.catch((error) => {
				// 실패가 서버를 죽이면 안 된다. 마지막 실행 시각은 이미 찍혔으므로 이 회차는
				// 넘기고 다음 날 예약 실행이 다시 시도한다(급하면 운영자가 수동 실행).
				app.log.error(error, "withdrawal purge failed");
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
