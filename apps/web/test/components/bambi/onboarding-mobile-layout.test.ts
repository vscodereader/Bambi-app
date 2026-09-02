import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { srcPath } from "../../src-path";

const FLOW_SOURCE = fs.readFileSync(
	srcPath("components/bambi/onboarding/onboarding-flow.tsx"),
	"utf8"
);
const MOCKUP_SOURCE = fs.readFileSync(
	srcPath("components/bambi/onboarding/phone-screen-mockup.tsx"),
	"utf8"
);
const SLIDE_SOURCE = fs.readFileSync(
	srcPath("components/bambi/onboarding/onboarding-slide.tsx"),
	"utf8"
);
const EMPLOYER_PREVIEW_SOURCE = fs.readFileSync(
	srcPath("components/bambi/onboarding/employer-onboarding-preview.tsx"),
	"utf8"
);
const FIXED_REM_MAX_HEIGHT_PATTERN = /max-h-\[\d+rem\]/;
const FIXED_CAMERA_SIZE_PATTERN = /size-\d+ rounded-full bg-ink-900/;
const FIXED_IMAGE_WIDTH_PATTERN = /width=\{\d+\}/;
const FIXED_IMAGE_HEIGHT_PATTERN = /height=\{\d+\}/;

describe("onboarding mobile viewport layout", () => {
	it("keeps the complete flow inside the dynamic viewport", () => {
		expect(FLOW_SOURCE).toContain("h-dvh");
		expect(FLOW_SOURCE).toContain("overflow-hidden");
		expect(FLOW_SOURCE).toContain("flex min-h-0");
		expect(FLOW_SOURCE).not.toContain("min-h-[42rem]");
	});

	it("lets the phone mockup shrink with the remaining height", () => {
		expect(MOCKUP_SOURCE).toContain("h-full");
		expect(MOCKUP_SOURCE).toContain("max-h-full");
		expect(MOCKUP_SOURCE).toContain("w-auto");
		expect(MOCKUP_SOURCE).not.toMatch(FIXED_REM_MAX_HEIGHT_PATTERN);
		expect(MOCKUP_SOURCE).toContain("unoptimized");
		expect(MOCKUP_SOURCE).not.toMatch(FIXED_IMAGE_WIDTH_PATTERN);
		expect(MOCKUP_SOURCE).not.toMatch(FIXED_IMAGE_HEIGHT_PATTERN);
		expect(MOCKUP_SOURCE).not.toContain("absolute top-2 left-1/2");
		expect(MOCKUP_SOURCE).toContain("flex-col");
		expect(MOCKUP_SOURCE).toContain("shrink-0 justify-center");
		expect(MOCKUP_SOURCE).toContain(">●</span>");
		expect(MOCKUP_SOURCE).not.toMatch(FIXED_CAMERA_SIZE_PATTERN);
		expect(MOCKUP_SOURCE).not.toContain("w-1/5");
		expect(MOCKUP_SOURCE).toContain("src={src}");
		expect(MOCKUP_SOURCE).toContain("shrink-0 justify-center");
		expect(MOCKUP_SOURCE).toContain("object-contain object-top");
		expect(MOCKUP_SOURCE).toContain("overflow-y-auto");
		expect(MOCKUP_SOURCE).toContain("ONBOARDING_AUTO_SWIPE_PAUSE_MS");
		expect(MOCKUP_SOURCE).toContain('getPropertyValue("--ease-out")');
		expect(MOCKUP_SOURCE).toContain("content.animate(");
		expect(MOCKUP_SOURCE).not.toContain("renderedScale");
		expect(MOCKUP_SOURCE).not.toContain("scale-110");
		expect(MOCKUP_SOURCE).toContain("max-md:[scrollbar-width:none]");
		expect(MOCKUP_SOURCE).toContain("max-md:mx-auto");
		expect(MOCKUP_SOURCE).toContain("max-md:w-full");
		expect(MOCKUP_SOURCE).toContain("data-scroll-content");
		expect(MOCKUP_SOURCE).not.toContain("requestAnimationFrame");
	});

	it("gives desktop navigation buttons a substantial touch target", () => {
		expect(FLOW_SOURCE).toContain('size="lg"');
		expect(FLOW_SOURCE).toContain("lg:w-1/2");
		expect(FLOW_SOURCE).not.toContain("lg:h-12");
	});

	it("uses one responsive slide layout for seeker and employer content", () => {
		expect(FLOW_SOURCE).toContain(
			"<OnboardingSlide slide={slides[currentIndex]} />"
		);
		expect(SLIDE_SOURCE).not.toContain("audience");
		expect(SLIDE_SOURCE).not.toContain('slide.id === "employer');
		expect(SLIDE_SOURCE).not.toContain('slide.id === "seeker');
		expect(SLIDE_SOURCE).toContain("<PhoneScreenMockup");
		expect(SLIDE_SOURCE).toContain("lg:whitespace-nowrap");
		expect(SLIDE_SOURCE).toContain("whitespace-pre-line sm:hidden");
	});

	it("keeps role previews sharp and non-interactive", () => {
		expect(SLIDE_SOURCE).toContain("codePreview={slide.codePreview}");
		expect(EMPLOYER_PREVIEW_SOURCE).toContain("@container");
		expect(EMPLOYER_PREVIEW_SOURCE).toContain("pointer-events-none");
		expect(EMPLOYER_PREVIEW_SOURCE).toContain("inert");
		expect(EMPLOYER_PREVIEW_SOURCE).toContain("invisible");
		expect(EMPLOYER_PREVIEW_SOURCE).not.toContain("onClick");
		expect(EMPLOYER_PREVIEW_SOURCE).not.toContain("fetch(");
		expect(EMPLOYER_PREVIEW_SOURCE).toContain("사업자 인증 서류");
		expect(EMPLOYER_PREVIEW_SOURCE).toContain("개업일자");
		expect(EMPLOYER_PREVIEW_SOURCE).toContain("세부지역");
		expect(EMPLOYER_PREVIEW_SOURCE).toContain("급여 단위");
		expect(EMPLOYER_PREVIEW_SOURCE).toContain("근무 일정");
		expect(EMPLOYER_PREVIEW_SOURCE).toContain("연락처 공개 요청");
		expect(EMPLOYER_PREVIEW_SOURCE).toContain(
			"ONBOARDING_SEQUENCE_ITEM_INTERVAL_MS"
		);
		expect(EMPLOYER_PREVIEW_SOURCE).toContain("bambiSheetUp_var(--dur-slow)");
		expect(EMPLOYER_PREVIEW_SOURCE).toContain(
			"bambiSlideInFromRight_calc(var(--dur-slow)*2)"
		);
		expect(EMPLOYER_PREVIEW_SOURCE).toContain("visibleCount >= 3");
		expect(EMPLOYER_PREVIEW_SOURCE).toContain('"밤비"');
		expect(EMPLOYER_PREVIEW_SOURCE).toContain('"111-11-11111"');
		expect(EMPLOYER_PREVIEW_SOURCE).toContain('"홍길동"');
		expect(EMPLOYER_PREVIEW_SOURCE).toContain('"2000-01-01"');
		expect(EMPLOYER_PREVIEW_SOURCE).toContain("getTypedBusinessValues");
		expect(EMPLOYER_PREVIEW_SOURCE).toContain("documentRef.current?.offsetTop");
		expect(EMPLOYER_PREVIEW_SOURCE).toContain("submitRef.current?.offsetTop");
		expect(EMPLOYER_PREVIEW_SOURCE).toContain("사업자등록증.pdf");
		expect(EMPLOYER_PREVIEW_SOURCE).toContain("data-business-phase");
		expect(EMPLOYER_PREVIEW_SOURCE).toContain('"OO바"');
		expect(EMPLOYER_PREVIEW_SOURCE).toContain('"주말 라운지 모집"');
		expect(EMPLOYER_PREVIEW_SOURCE).toContain('"2,000,000원"');
		expect(EMPLOYER_PREVIEW_SOURCE).toContain('"금·토 20:00–02:00"');
		expect(EMPLOYER_PREVIEW_SOURCE).toContain("공고_썸네일_예시.png");
		expect(EMPLOYER_PREVIEW_SOURCE).toContain("실제_내용_예시.png");
		expect(EMPLOYER_PREVIEW_SOURCE).toContain("60일 기간권");
		expect(EMPLOYER_PREVIEW_SOURCE).toContain("무통장입금");
		expect(EMPLOYER_PREVIEW_SOURCE).toContain("getTypedJobValues");
		expect(EMPLOYER_PREVIEW_SOURCE).toContain("data-job-phase");
		expect(EMPLOYER_PREVIEW_SOURCE).toContain("data-marketplace-scroll");
		expect(EMPLOYER_PREVIEW_SOURCE).toContain('perspective="seeker"');
		expect(EMPLOYER_PREVIEW_SOURCE).toContain("010-0000-0000");
		expect(EMPLOYER_PREVIEW_SOURCE).toContain("aspect-[16/9]");
		expect(EMPLOYER_PREVIEW_SOURCE).toContain("스페셜 채용");
		expect(EMPLOYER_PREVIEW_SOURCE).toContain("추천 채용");
		expect(EMPLOYER_PREVIEW_SOURCE).toContain("전체 공고");
		expect(EMPLOYER_PREVIEW_SOURCE).toContain("grid-cols-4");
		expect(EMPLOYER_PREVIEW_SOURCE).not.toContain("운영자 모드");
		expect(EMPLOYER_PREVIEW_SOURCE).not.toContain("아리랑아리랑야");
		expect(EMPLOYER_PREVIEW_SOURCE).not.toContain("서리한이 굶주");
		expect(EMPLOYER_PREVIEW_SOURCE).not.toContain("공고를 공고공");
		expect(EMPLOYER_PREVIEW_SOURCE.match(/tone="organic"/g) ?? []).toHaveLength(
			10
		);
		expect(EMPLOYER_PREVIEW_SOURCE).toContain("NOTIFICATION_ITEMS");
		expect(EMPLOYER_PREVIEW_SOURCE).toContain("새 채팅 메시지");
		expect(EMPLOYER_PREVIEW_SOURCE).toContain("면접 일정 확정");
		expect(EMPLOYER_PREVIEW_SOURCE).toContain("common-notifications");
		expect(EMPLOYER_PREVIEW_SOURCE).toContain("common-safety");
		expect(EMPLOYER_PREVIEW_SOURCE).toContain("차단하기");
		expect(EMPLOYER_PREVIEW_SOURCE).toContain("menuPressing");
	});

	it("restarts the first-slide preview when returning from another slide", () => {
		expect(SLIDE_SOURCE).toContain("key={slide.id}");
		expect(MOCKUP_SOURCE).toContain("container.scrollTop = 0");
	});

	it("reveals chat messages without changing the shared phone frame", () => {
		expect(SLIDE_SOURCE).toContain("sequence={slide.screenSequence}");
		expect(MOCKUP_SOURCE).toContain("ONBOARDING_SEQUENCE_ITEM_INTERVAL_MS");
		expect(MOCKUP_SOURCE).toContain("visibleItemCount");
		expect(MOCKUP_SOURCE).toContain("bambiSheetUp_var(--dur-slow)");
		expect(MOCKUP_SOURCE).toContain(
			"bambiSlideInFromRight_calc(var(--dur-slow)*2)"
		);
		expect(MOCKUP_SOURCE).toContain("motion-reduce:animate-none");
	});

	it("loops the review typing demo inside the shared phone frame", () => {
		expect(SLIDE_SOURCE).toContain("reviewScenarios={slide.reviewScenarios}");
		expect(MOCKUP_SOURCE).toContain("ReviewDemoScreen");
		expect(MOCKUP_SOURCE).toContain("ONBOARDING_REVIEW_TYPING_INTERVAL_MS");
		expect(MOCKUP_SOURCE).toContain("ONBOARDING_REVIEW_SUBMIT_PRESS_MS");
		expect(MOCKUP_SOURCE).toContain("bambiReviewSubmitPress_var(--dur-slow)");
		expect(MOCKUP_SOURCE).toContain("current.scenarioIndex + 1");
		expect(MOCKUP_SOURCE).toContain("REVIEW_RATINGS.map");
		expect(MOCKUP_SOURCE).toContain("@container absolute inset-0");
		expect(MOCKUP_SOURCE).not.toContain('viewBox="0 0 390 844"');
		expect(MOCKUP_SOURCE).not.toContain("REVIEW_STAR_POSITIONS");
	});
});
