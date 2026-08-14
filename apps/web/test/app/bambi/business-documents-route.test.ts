import { ORPCError } from "@orpc/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const createBusinessDocumentViewUrl = vi.fn();

vi.mock("@/utils/orpc", () => ({
	client: {
		bambi: {
			onboarding: {
				createBusinessDocumentViewUrl: (input: unknown) =>
					createBusinessDocumentViewUrl(input),
			},
		},
	},
}));

const { GET } = await import(
	"@/app/bambi/business-documents/[documentId]/route"
);

const buildRequest = (search = "") =>
	new Request(`http://localhost:23001/bambi/business-documents/doc_1${search}`);

const buildContext = (documentId = "doc_1") => ({
	params: Promise.resolve({ documentId }),
});

describe("business document view route", () => {
	beforeEach(() => {
		createBusinessDocumentViewUrl.mockReset();
	});

	it("인가 통과 시 서명 URL로 302 리다이렉트하고 캐시를 금지한다", async () => {
		createBusinessDocumentViewUrl.mockResolvedValue({
			url: "https://storage.googleapis.com/bambi-storage-private/employer/o/u/k",
		});

		const response = await GET(buildRequest() as never, buildContext());

		expect(createBusinessDocumentViewUrl).toHaveBeenCalledWith({
			documentId: "doc_1",
			download: false,
		});
		expect(response.status).toBe(302);
		expect(response.headers.get("location")).toBe(
			"https://storage.googleapis.com/bambi-storage-private/employer/o/u/k"
		);
		expect(response.headers.get("cache-control")).toBe("no-store");
	});

	it("download=1이면 다운로드 의도를 프로시저에 전달한다", async () => {
		createBusinessDocumentViewUrl.mockResolvedValue({ url: "https://gcs/x" });

		await GET(buildRequest("?download=1") as never, buildContext());

		expect(createBusinessDocumentViewUrl).toHaveBeenCalledWith({
			documentId: "doc_1",
			download: true,
		});
	});

	it("dev 로컬 상대 URL도 웹 오리진 기준 절대 URL로 302 한다", async () => {
		createBusinessDocumentViewUrl.mockResolvedValue({
			url: "/bambi/local-chat-attachments?category=pdf&fileName=a.pdf&key=k",
		});

		const response = await GET(buildRequest() as never, buildContext());

		expect(response.status).toBe(302);
		expect(response.headers.get("location")).toBe(
			"http://localhost:23001/bambi/local-chat-attachments?category=pdf&fileName=a.pdf&key=k"
		);
	});

	it.each([
		["UNAUTHORIZED", 401],
		["FORBIDDEN", 403],
		["NOT_FOUND", 404],
	] as const)("프로시저 %s 에러를 %i로 매핑한다", async (code, status) => {
		createBusinessDocumentViewUrl.mockRejectedValue(new ORPCError(code));

		const response = await GET(buildRequest() as never, buildContext());

		expect(response.status).toBe(status);
	});

	it("알 수 없는 실패는 500으로 응답한다", async () => {
		createBusinessDocumentViewUrl.mockRejectedValue(new Error("boom"));

		const response = await GET(buildRequest() as never, buildContext());

		expect(response.status).toBe(500);
	});
});
