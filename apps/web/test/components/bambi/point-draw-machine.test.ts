import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { srcPath } from "../../src-path";

const component = readFileSync(
	srcPath("components/bambi/point-shop/point-draw-machine.tsx"),
	"utf8"
);
const styles = readFileSync(
	srcPath("components/bambi/point-shop/point-draw-machine.module.css"),
	"utf8"
);

describe("포인트 랜덤 뽑기 화면", () => {
	it("서버 결과 뒤 흔들림·배출·개봉·결과 단계를 순서대로 진행한다", () => {
		expect(component).toContain('setStage("shaking")');
		expect(component).toContain('setStage("dispensing")');
		expect(component).toContain('setStage("opening")');
		expect(component).toContain('setStage("revealed")');
		expect(component).toContain("drawMutation.mutateAsync");
	});

	it("뽑기권과 활성 당첨 설정이 없으면 버튼을 막는다", () => {
		expect(component).toContain("state?.activePrizeAvailable");
		expect(component).toContain("state?.ticketBalance");
		expect(component).toContain("disabled={!canDraw}");
	});

	it("움직이는 볼과 reduced-motion 대체를 제공한다", () => {
		expect(styles).toContain("@keyframes ball-float");
		expect(styles).toContain("@keyframes machine-shake");
		expect(styles).toContain("@keyframes dispense-ball");
		expect(styles).toContain("@keyframes open-ball");
		expect(styles).toContain("prefers-reduced-motion");
	});
});
