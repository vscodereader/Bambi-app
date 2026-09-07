import { describe, expect, it } from "vitest";

import { resolveUploadUrl, resolveWebUrl } from "./dev-web-url";

// vitest는 NODE_ENV=test라 dev 분기가 살아 있다. web 주소는 인자로 넘겨 env에 의존하지 않는다.
describe("resolveUploadUrl", () => {
	it("서명 URL은 그대로", () => {
		expect(
			resolveUploadUrl("https://storage.example/x?sig=1", "http://w")
		).toBe("https://storage.example/x?sig=1");
	});

	it("dev 상대 경로는 web 주소에 붙인다(끝 슬래시 중복 없음)", () => {
		expect(
			resolveUploadUrl(
				"/bambi/local-job-media?key=a",
				"http://localhost:23001/"
			)
		).toBe("http://localhost:23001/bambi/local-job-media?key=a");
	});

	it("web 주소가 없으면 ''(생략), 비https 절대 URL은 null(차단)", () => {
		expect(resolveUploadUrl("/bambi/local-job-media?key=a", undefined)).toBe(
			""
		);
		expect(resolveUploadUrl("local://upload/x", "http://w")).toBeNull();
		expect(resolveUploadUrl("http://evil/x", "http://w")).toBeNull();
	});
});

describe("resolveWebUrl", () => {
	it("절대 URL은 그대로, dev 상대 경로는 web 주소에 붙인다", () => {
		expect(resolveWebUrl("https://cdn/x.jpg", "http://w")).toBe(
			"https://cdn/x.jpg"
		);
		expect(
			resolveWebUrl("/bambi/local-chat-attachments?key=a", "http://w")
		).toBe("http://w/bambi/local-chat-attachments?key=a");
	});

	it("web 주소 없는 상대 경로·이상한 값은 null", () => {
		expect(resolveWebUrl("/bambi/x", undefined)).toBeNull();
		expect(resolveWebUrl("local://x", "http://w")).toBeNull();
	});
});
