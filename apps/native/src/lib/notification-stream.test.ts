import { describe, expect, it } from "vitest";

import { parseSseChunk } from "./sse-parser";

describe("parseSseChunk", () => {
	it("빈 줄로 끝난 프레임만 돌려주고 나머지는 버퍼에 남긴다", () => {
		const { frames, rest } = parseSseChunk(
			'event: bambi:ping\ndata: {}\n\nevent: bambi:notification\ndata: {"a":1'
		);
		expect(frames).toEqual([{ data: "{}", event: "bambi:ping" }]);
		expect(rest).toBe('event: bambi:notification\ndata: {"a":1');
	});

	it("data 여러 줄은 개행으로 잇고 CRLF도 받는다", () => {
		const { frames, rest } = parseSseChunk(
			"event: x\r\ndata: a\r\ndata: b\r\n\r\n"
		);
		expect(frames).toEqual([{ data: "a\nb", event: "x" }]);
		expect(rest).toBe("");
	});

	it("event가 없으면 message, 주석(:)과 빈 프레임은 버린다", () => {
		const { frames } = parseSseChunk(": keepalive\n\ndata: hi\n\n\n\n");
		expect(frames).toEqual([{ data: "hi", event: "message" }]);
	});
});
