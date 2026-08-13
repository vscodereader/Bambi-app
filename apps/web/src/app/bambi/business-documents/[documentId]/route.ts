import { ORPCError } from "@orpc/client";
import { NextResponse } from "next/server";
import { client } from "@/utils/orpc";

const ERROR_STATUS: Record<string, number> = {
	FORBIDDEN: 403,
	NOT_FOUND: 404,
	UNAUTHORIZED: 401,
};

// 사업자 문서 조회 관문. 목록 응답에는 이 경로만 실리고, 실제 파일 위치(60초 서명 URL)는
// 매 요청 oRPC 프로시저의 세션·소유(올린 본인 또는 운영자) 검증을 통과해야만 나온다 —
// 이 URL이 유출·공유돼도 세션 없이는 무용지물이다. client의 SSR 분기가 들어온 요청
// 헤더(쿠키 포함)를 API 서버로 통째로 포워딩하므로 세션이 그대로 전달된다.
export async function GET(
	request: Request,
	{ params }: { params: Promise<{ documentId: string }> }
) {
	const { documentId } = await params;
	const requestUrl = new URL(request.url);
	const download = requestUrl.searchParams.get("download") === "1";

	try {
		const { url } = await client.bambi.onboarding.createBusinessDocumentViewUrl(
			{ documentId, download }
		);

		return NextResponse.redirect(new URL(url, requestUrl.origin), {
			headers: { "cache-control": "no-store" },
			status: 302,
		});
	} catch (error) {
		const status =
			error instanceof ORPCError ? (ERROR_STATUS[error.code] ?? 500) : 500;

		return new Response("문서를 열 수 없습니다.", { status });
	}
}
