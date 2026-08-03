import { afterEach, describe, expect, it, vi } from "vitest";

import { createImpressionObserver } from "./use-promotion-impression";

type ObserverCallback = (entries: { isIntersecting: boolean }[]) => void;

class FakeIntersectionObserver {
	static lastInstance: FakeIntersectionObserver | null = null;
	callback: ObserverCallback;
	disconnected = false;
	options: { threshold?: number } | undefined;

	constructor(callback: ObserverCallback, options?: { threshold?: number }) {
		this.callback = callback;
		this.options = options;
		FakeIntersectionObserver.lastInstance = this;
	}

	disconnect() {
		this.disconnected = true;
	}
}

afterEach(() => {
	vi.unstubAllGlobals();
	FakeIntersectionObserver.lastInstance = null;
});

describe("createImpressionObserver", () => {
	it("IntersectionObserver가 없는 환경이면 null을 준다", () => {
		vi.stubGlobal("IntersectionObserver", undefined);
		expect(createImpressionObserver(() => undefined)).toBeNull();
	});

	it("뷰포트 50% 기준으로 옵저버를 만든다", () => {
		vi.stubGlobal("IntersectionObserver", FakeIntersectionObserver);
		createImpressionObserver(() => undefined);
		expect(FakeIntersectionObserver.lastInstance?.options?.threshold).toBe(0.5);
	});

	it("교차 진입 시 1회만 발화하고 관측을 끝낸다", () => {
		vi.stubGlobal("IntersectionObserver", FakeIntersectionObserver);
		const onImpress = vi.fn();
		createImpressionObserver(onImpress);
		const fake = FakeIntersectionObserver.lastInstance;
		fake?.callback([{ isIntersecting: false }]);
		expect(onImpress).not.toHaveBeenCalled();
		fake?.callback([{ isIntersecting: true }]);
		fake?.callback([{ isIntersecting: true }]);
		expect(onImpress).toHaveBeenCalledTimes(1);
		expect(fake?.disconnected).toBe(true);
	});
});
