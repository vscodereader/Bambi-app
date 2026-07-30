import { runCrawlTick } from "@bambi-app/api/services/bambi-crawl-ingest";
// fastify-schedule의 현재 이름이 @fastify/schedule이다. 스코프 없는 fastify-schedule은
// 1.1.0에서 멈춘 구버전이라 Fastify 5용 타입 선언이 없다.
import { fastifySchedule } from "@fastify/schedule";
import type { FastifyPluginAsync } from "fastify";
import { AsyncTask, SimpleIntervalJob } from "toad-scheduler";

// 외부 공고 수집 스케줄러. 틱은 자주 돌지만 실제 수집 여부는 매번 DB에서 판단한다 —
// 켜짐/꺼짐(bambi_site_settings.crawl_enabled)과 주기(crawl_interval_hours) 모두
// 프로세스 메모리가 아니라 DB에 있어야 서버를 재시작하거나 인스턴스가 늘어도 상태가 갈리지 않고,
// 운영자가 콘솔에서 끄면 재배포 없이 즉시 멈춘다.
//
// 그래서 job.stop()을 켜짐/꺼짐 스위치로 쓰지 않는다. toad-scheduler의 job 상태는 그 프로세스
// 안에서만 참이라, 인스턴스가 둘이면 한쪽만 멈춘 채로 다른 쪽이 계속 긁는다.
const TICK_INTERVAL_MINUTES = 10;

export const crawlPlugin: FastifyPluginAsync = async (app) => {
	await app.register(fastifySchedule);

	// 재진입 가드. 한 회차는 목록 수십 페이지 + 상세 수백 건이라 틱 간격보다 오래 걸릴 수 있다.
	let running = false;

	const task = new AsyncTask(
		"crawl-tick",
		async () => {
			if (running) {
				return;
			}
			running = true;

			try {
				const result = await runCrawlTick(new Date());

				if (result.reason === "not_due") {
					return;
				}

				if (result.reason === "aborted_low_yield") {
					// 수율이 무너진 회차다. 데이터는 건드리지 않았지만 셀렉터 점검이 필요하다는
					// 신호라 경고로 남긴다.
					app.log.warn(result, "crawl tick aborted on low yield");
					return;
				}

				app.log.info(result, "crawl tick completed");

				if (result.pendingDetails > 0) {
					// 상한에 걸려 다음 회차로 넘긴 잔량을 드러낸다. 조용히 자르면 "다 수집했다"로 읽힌다.
					app.log.info(
						{ pendingDetails: result.pendingDetails },
						"crawl tick deferred details to the next run"
					);
				}
			} finally {
				running = false;
			}
		},
		(error) => {
			// 틱 실패가 서버를 죽이면 안 된다. 다음 틱이 다시 시도한다.
			app.log.error(error, "crawl tick failed");
			running = false;
		}
	);

	app.scheduler.addSimpleIntervalJob(
		new SimpleIntervalJob(
			{ minutes: TICK_INTERVAL_MINUTES, runImmediately: false },
			task,
			{ id: "crawl-tick", preventOverrun: true }
		)
	);
};
