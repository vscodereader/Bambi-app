import { purgeWithdrawnAccountsBatch } from "@bambi-app/api/services/bambi-withdrawal-purge";
import type { FastifyPluginCallback } from "fastify";

// 탈퇴 계정 잔여 식별값 파기 스케줄러. 부팅 몇 분 뒤 1회 + 이후 24시간 간격으로 돈다.
// "오늘 이미 돌았는지"를 기록하지 않는 이유는 파기가 멱등이기 때문이다 — 대상 조건에
// purgedAt IS NULL이 있어 보존기간 경과분만 한 번 처리되고, 중복 실행·재시작 직후 실행·
// 운영자의 수동 실행(사이트 정보의 "지금 파기 실행")이 겹쳐도 결과가 같다. 그래서 상태
// 테이블이나 분산 락 없이 타이머만으로 충분하다.
// 부팅 직후 바로 돌리지 않는 것은 기동 중 DB 커넥션·마이그레이션과 겹치지 않게 하기 위함이다.
// ponytail: 인스턴스가 늘면 인스턴스 수만큼 실행된다. 멱등이라 무해하지만(중복분은 0건 처리)
// 실행 비용이 문제가 되면 DB에 마지막 실행 시각을 두고 crawl 플러그인처럼 "실행 도래" 판정을
// DB로 옮긴다.
const BOOT_DELAY_MS = 5 * 60 * 1000;
const INTERVAL_MS = 24 * 60 * 60 * 1000;

export const withdrawalPurgePlugin: FastifyPluginCallback = (
	app,
	_opts,
	done
) => {
	// 재진입 가드: 이전 실행이 끝나지 않았으면 이번 회차는 건너뛴다.
	let running = false;

	const run = () => {
		if (running) {
			return;
		}
		running = true;

		purgeWithdrawnAccountsBatch()
			.then(({ purgedCount }) => {
				if (purgedCount > 0) {
					app.log.info({ purgedCount }, "withdrawal purge completed");
				}
			})
			.catch((error) => {
				// 실패가 서버를 죽이면 안 된다. 다음 회차가 다시 시도한다.
				app.log.error(error, "withdrawal purge failed");
			})
			.finally(() => {
				running = false;
			});
	};

	const bootTimer = setTimeout(run, BOOT_DELAY_MS);
	const timer = setInterval(run, INTERVAL_MS);

	app.addHook("onClose", (_instance, hookDone) => {
		clearTimeout(bootTimer);
		clearInterval(timer);
		hookDone();
	});

	done();
};
