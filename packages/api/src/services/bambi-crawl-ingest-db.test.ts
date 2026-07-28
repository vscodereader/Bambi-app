import { readFileSync } from "node:fs";

import dotenv from "dotenv";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// 수집기의 DB 쓰기 경로를 실제 DB로 확인한다. 파서·정책은 순수 함수라 픽스처로 검증되지만,
// upsert 충돌 대상·enum 값·부분 유니크 인덱스는 실제로 붙여봐야 알 수 있다.
// 네트워크는 스텁으로 막고 저장해 둔 픽스처만 돌려준다(상대 사이트를 두드리지 않는다).
dotenv.config({ path: "../../apps/server/.env" });

const [{ db }, bambiSchema, { runCrawlTick }, { createCrawlClient }] =
	await Promise.all([
		import("@bambi-app/db"),
		import("@bambi-app/db/schema/bambi"),
		import("./bambi-crawl-ingest"),
		import("./bambi-crawl-fetch"),
	]);

const { bambiSiteSettings, crawledJobPost, crawlRun } = bambiSchema;
const { eq } = await import("drizzle-orm");

const readFixture = (name: string): string =>
	readFileSync(new URL(`./__fixtures__/${name}`, import.meta.url), "utf8");

const listHtml = readFixture("foxalba-list.html");
const detailHtml = readFixture("foxalba-detail.html");

// 목록 픽스처의 총 건수(3,283)를 그대로 두면 66페이지를 요청한다. 테스트에서는 한 페이지만
// 돌면 충분하므로 카운터만 낮춘 사본을 쓴다.
const singlePageListHtml = listHtml.replace(
	/(<span class="num">총 <b>)[\d,]+(<\/b>)/,
	"$150$2"
);

const ROBOTS = "User-agent: *\nAllow: /\n";

// 네트워크 스텁. 요청 간격·재시도를 타지 않도록 createCrawlClient 대신 직접 구현한다.
const createStubClient = (): ReturnType<typeof createCrawlClient> => ({
	fetchHtml: (url: string) => {
		if (url.endsWith("/robots.txt")) {
			return Promise.resolve(ROBOTS);
		}
		if (url.includes("view.asp")) {
			return Promise.resolve(detailHtml);
		}
		return Promise.resolve(singlePageListHtml);
	},
	isAllowed: () => Promise.resolve(true),
});

beforeAll(async () => {
	// 이 테스트는 공유 dev DB를 쓴다. (여우알바 × 공고)를 대상으로 수집을 켜서 돌린다 —
	// 사이트·데이터 종류를 명시해 컬럼 기본값과 무관하게 구현된 조합의 경로를 타게 한다.
	const target = {
		crawlContentType: "job_post" as const,
		crawlEnabled: true,
		crawlSourceSite: "foxalba" as const,
	};
	await db
		.insert(bambiSiteSettings)
		.values({ id: "default", ...target })
		.onConflictDoUpdate({ set: target, target: bambiSiteSettings.id });
});

afterAll(async () => {
	await db
		.delete(crawledJobPost)
		.where(eq(crawledJobPost.sourceSite, "foxalba"));
	await db.delete(crawlRun).where(eq(crawlRun.sourceSite, "foxalba"));

	// 원래 값 복원이 아니라 무조건 꺼서 끝낸다. 공유 dev DB를 켜진 채로 남기면 서버 스케줄러가
	// 실제 사이트를 긁기 시작하므로, 안전한 기본 상태(off)로 두는 것이 원본 복원보다 중요하다.
	await db
		.update(bambiSiteSettings)
		.set({ crawlEnabled: false })
		.where(eq(bambiSiteSettings.id, "default"));
});

describe("runCrawlTick against the database", () => {
	it("inserts parsed listings and records the run", async () => {
		const result = await runCrawlTick(new Date(), createStubClient(), {
			force: true,
		});

		expect(result.reason).toBe("completed");
		expect(result.itemsNew).toBeGreaterThan(0);

		const rows = await db
			.select({
				contactPhone: crawledJobPost.contactPhone,
				body: crawledJobPost.body,
				payUnit: crawledJobPost.payUnit,
				status: crawledJobPost.status,
			})
			.from(crawledJobPost)
			.where(eq(crawledJobPost.sourceSite, "foxalba"));

		// 목록에 같은 o_idx가 두 번 실리는 경우가 있어(50칸 중 고유 49건) 수집기가 중복을
		// 걷어낸다. 걷어내지 않으면 같은 상세를 두 번 받고 신규 건수도 부풀려진다.
		expect(rows.length).toBe(result.itemsNew);
		expect(rows.length).toBe(49);

		// 상세 픽스처가 하나라 모든 행이 같은 내용으로 들어간다. 값이 실제로 저장됐는지만 본다.
		const [first] = rows;
		expect(first?.payUnit).toBe("TC");
		expect(first?.contactPhone).toBe("010-0000-0000");
		// 본문 마스킹이 저장 단계까지 살아 있어야 한다.
		expect(first?.body).toContain("[연락처 비공개]");
		expect(first?.body).not.toContain("010-1234-5678");

		const [run] = await db
			.select({ itemsNew: crawlRun.itemsNew, status: crawlRun.status })
			.from(crawlRun)
			.where(eq(crawlRun.sourceSite, "foxalba"));

		expect(run?.status).toBe("success");
	});

	it("is idempotent — a second run changes nothing", async () => {
		const before = await db
			.select({ id: crawledJobPost.id })
			.from(crawledJobPost)
			.where(eq(crawledJobPost.sourceSite, "foxalba"));

		const result = await runCrawlTick(new Date(), createStubClient(), {
			force: true,
		});

		// 내용이 그대로면 content_hash가 같아 UPDATE를 건너뛴다.
		expect(result.itemsNew).toBe(0);
		expect(result.itemsUpdated).toBe(0);

		const after = await db
			.select({ id: crawledJobPost.id })
			.from(crawledJobPost)
			.where(eq(crawledJobPost.sourceSite, "foxalba"));

		expect(after.length).toBe(before.length);
	});

	it("refuses to start while another run is in flight", async () => {
		// 부분 유니크 인덱스(status='running')가 두 번째 회차를 막는지 본다.
		// 즉시 수집 버튼 연타와 스케줄러 틱이 겹치는 상황이 이 경로로 들어온다.
		const [blocker] = await db
			.insert(crawlRun)
			.values({ sourceSite: "foxalba", status: "running" })
			.returning({ id: crawlRun.id });

		try {
			const result = await runCrawlTick(new Date(), createStubClient(), {
				force: true,
			});

			expect(result.reason).toBe("already_running");
		} finally {
			if (blocker) {
				await db.delete(crawlRun).where(eq(crawlRun.id, blocker.id));
			}
		}
	});

	it("stays off when the master switch is off, even when forced", async () => {
		await db
			.update(bambiSiteSettings)
			.set({ crawlEnabled: false })
			.where(eq(bambiSiteSettings.id, "default"));

		try {
			const result = await runCrawlTick(new Date(), createStubClient(), {
				force: true,
			});

			// 꺼둔 수집이 버튼 하나로 되살아나면 "껐다"는 말이 거짓이 된다.
			expect(result.reason).toBe("not_due");
		} finally {
			await db
				.update(bambiSiteSettings)
				.set({ crawlEnabled: true })
				.where(eq(bambiSiteSettings.id, "default"));
		}
	});
});
