import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { srcPath } from "../../src-path";

const landingSource = fs.readFileSync(
	path.join(srcPath("components"), "bambi", "public-job-landing.tsx"),
	"utf8"
);
const pageSource = fs.readFileSync(
	path.join(srcPath("app"), "jobs", "page.tsx"),
	"utf8"
);
const railSource = fs.readFileSync(
	path.join(srcPath("components"), "bambi", "public-side-ad-rail-layout.tsx"),
	"utf8"
);
const hitSource = fs.readFileSync(
	path.join(srcPath("components"), "bambi", "public-job-hit.tsx"),
	"utf8"
);

describe("public jobs index design", () => {
	it("applies the soft header to every public jobs landing", () => {
		expect(landingSource).toContain(
			"const isIndexLanding = !(region || industry);"
		);
		expect(landingSource).toContain(
			'"-mx-2 flex flex-col gap-3 rounded-2xl border border-primary/20 bg-primary/5 px-2 py-6 md:mx-0 md:p-8"'
		);
		expect(landingSource).toContain(
			'? "text-center text-xl md:text-left md:text-3xl"'
		);
		expect(landingSource).toContain('isIndexLanding && "text-xs md:text-sm"');
	});

	it("centers both signup actions only on mobile", () => {
		expect(landingSource).toContain(
			'className="flex justify-center md:justify-start"'
		);
		expect(landingSource).toContain('className="self-center md:self-start"');
	});

	it("keeps the existing signup action and listing after the header", () => {
		const headerIndex = landingSource.indexOf("<header");
		const signupIndex = landingSource.indexOf(
			"회원가입하고 채팅으로 문의",
			headerIndex
		);
		const listingIndex = landingSource.indexOf("모집 중인 공고", signupIndex);

		expect(headerIndex).toBeGreaterThan(-1);
		expect(signupIndex).toBeGreaterThan(headerIndex);
		expect(listingIndex).toBeGreaterThan(signupIndex);
	});

	it("renders public job cards in the requested information order", () => {
		const cardIndex = landingSource.indexOf("function LandingJobCard");
		const coverIndex = landingSource.indexOf("<JobCoverImage", cardIndex);
		const titleIndex = landingSource.indexOf("{job.title}", coverIndex);
		const companyIndex = landingSource.indexOf(
			"{job.company} · {job.location}",
			titleIndex
		);
		const badgeIndex = landingSource.indexOf("{job.type}", companyIndex);
		const payIndex = landingSource.indexOf("{job.pay}", badgeIndex);
		const beginnerIndex = landingSource.indexOf(
			"job.beginnerFriendly",
			payIndex
		);

		expect(landingSource.slice(cardIndex, titleIndex)).toContain("blur-sm");
		expect(titleIndex).toBeGreaterThan(coverIndex);
		expect(companyIndex).toBeGreaterThan(titleIndex);
		expect(badgeIndex).toBeGreaterThan(companyIndex);
		expect(payIndex).toBeGreaterThan(badgeIndex);
		expect(beginnerIndex).toBeGreaterThan(payIndex);
		expect(landingSource.slice(cardIndex, payIndex)).not.toContain(
			"근무시간 {job.hours}"
		);
		expect(landingSource.slice(badgeIndex, payIndex)).toContain("mt-auto");
		expect(hitSource).toContain("초보 가능");
		expect(hitSource).toContain(">당일면접<");
		expect(hitSource).not.toContain("당일면접 가능");
		expect(hitSource).toContain("마감임박");
	});

	it("reuses only the marketplace side rails on the jobs index", () => {
		expect(pageSource).toContain("<PublicSideAdRailLayout");
		expect(railSource).toContain("<HorizontalAdBannerRail");
		expect(railSource).toContain("items={adBanners.leftBanner}");
		expect(railSource).toContain("<AdBannerRail");
		expect(railSource).toContain("items={adBanners.rightBanner}");
		expect(railSource).toContain("SIDE_AD_RAIL_ASIDE_CLASS");
		expect(railSource).toContain('"w-full min-w-0 shrink-0"');
		expect(railSource).not.toContain("PremiumAdBannerSection");
	});

	it("keeps the 24-job grid and delegates random HIT selection", () => {
		expect(landingSource).toContain("<PublicJobHitProvider");
		expect(landingSource).toContain("<PublicJobHitRibbon");
		expect(landingSource).toContain("LANDING_JOB_LIMIT = 24");
		expect(landingSource).toContain("md:grid-cols-3");
		expect(landingSource).toContain("has-[[data-hit-ribbon]]:border-primary");
		expect(landingSource).toContain("<PublicJobHitStatusBadges");
	});
});
