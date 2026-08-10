import { afterEach, describe, expect, it, vi } from "vitest";

import { validateBiznum } from "@/services/nts-biznum";

const REQUEST = { bNo: "1234567890", pNm: "홍길동", startDt: "20200101" };

const mockFetch = (payload: unknown, status = 200) => {
	const fetchMock = vi.fn().mockResolvedValue({
		json: () => Promise.resolve(payload),
		ok: status < 400,
		status,
	});
	vi.stubGlobal("fetch", fetchMock);
	return fetchMock;
};

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("validateBiznum", () => {
	it("일치·계속사업자면 matched=true, statusCode='01'", async () => {
		const fetchMock = mockFetch({
			data: [{ valid: "01", status: { b_stt_cd: "01", b_stt: "계속사업자" } }],
		});

		await expect(validateBiznum("key", REQUEST)).resolves.toEqual({
			matched: true,
			statusCode: "01",
		});

		const [url, init] = fetchMock.mock.calls[0] ?? [];
		expect(url).toContain("serviceKey=key");
		expect(JSON.parse(init.body).businesses[0]).toMatchObject({
			b_no: "1234567890",
			p_nm: "홍길동",
			start_dt: "20200101",
		});
	});

	it("불일치면 matched=false(상태 코드는 빈 문자열 → null)", async () => {
		mockFetch({
			data: [
				{
					valid: "02",
					valid_msg: "확인할 수 없습니다.",
					status: { b_stt_cd: "" },
				},
			],
		});

		await expect(validateBiznum("key", REQUEST)).resolves.toEqual({
			matched: false,
			statusCode: null,
		});
	});

	it("폐업이면 matched=true지만 statusCode='03'으로 구분된다", async () => {
		mockFetch({
			data: [{ valid: "01", status: { b_stt_cd: "03", b_stt: "폐업자" } }],
		});

		await expect(validateBiznum("key", REQUEST)).resolves.toEqual({
			matched: true,
			statusCode: "03",
		});
	});

	it("HTTP 오류는 던진다(불일치와 구분되는 판정 불가)", async () => {
		mockFetch({}, 500);

		await expect(validateBiznum("key", REQUEST)).rejects.toThrow("HTTP 500");
	});

	it("타임아웃·네트워크 오류도 그대로 던진다", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn().mockRejectedValue(new Error("The operation was aborted."))
		);

		await expect(validateBiznum("key", REQUEST)).rejects.toThrow();
	});
});
