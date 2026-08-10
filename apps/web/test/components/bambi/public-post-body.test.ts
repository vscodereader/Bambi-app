import { describe, expect, it } from "vitest";
import { isSafeLinkHref } from "@/components/bambi/public-post-body";

// 공개 본문 렌더러는 doc JSON의 링크 href를 신뢰하지 않는다 — 실행 가능한 스킴이
// <a href>로 그려지면 클릭 XSS가 되므로 화이트리스트 통과분만 링크로 그린다.
describe("isSafeLinkHref", () => {
	it("allows http/https/mailto/tel", () => {
		expect(isSafeLinkHref("https://example.com/x")).toBe(true);
		expect(isSafeLinkHref("http://example.com")).toBe(true);
		expect(isSafeLinkHref("mailto:a@b.c")).toBe(true);
		expect(isSafeLinkHref("tel:01012345678")).toBe(true);
	});
	it("rejects executable and unknown schemes", () => {
		expect(isSafeLinkHref("javascript:alert(1)")).toBe(false);
		expect(isSafeLinkHref("data:text/html,<script>x</script>")).toBe(false);
		expect(isSafeLinkHref("vbscript:x")).toBe(false);
		expect(isSafeLinkHref("JavaScript:alert(1)")).toBe(false);
	});
	it("rejects relative and malformed values", () => {
		expect(isSafeLinkHref("/seeker")).toBe(false);
		expect(isSafeLinkHref("example.com")).toBe(false);
		expect(isSafeLinkHref("")).toBe(false);
	});
});
