import type { AppRouterClient } from "@bambi-app/api/routers/index";
import { env } from "@bambi-app/env/web";
import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";

// 공개 데이터 조회 전용 익명 orpc 클라이언트. 기존 utils/orpc.ts의 client는 SSR에서
// next/headers()로 요청 헤더 전체를 전달해(요청별 동적 API) revalidate를 붙여도 정적
// 재생성이 막힌다. 이 클라이언트는 headers 콜백이 없어 next/headers를 전혀 읽지 않으므로,
// 이것만 쓰는 공개 라우트는 ISR로 정적 재생성된다. 게스트 토큰·세션 신원이 필요 없는
// 공개 조회(공고 랜딩 등)에만 쓴다 — 신원이 필요한 경로는 기존 client를 그대로 쓴다.
const publicLink = new RPCLink({
	url: `${env.NEXT_PUBLIC_SERVER_URL}/rpc`,
});

export const publicClient: AppRouterClient = createORPCClient(publicLink);
