"use client";

// 고객센터는 회원이 문의를 넣고 운영자가 답하는 창구다. 운영자 계정으로 1:1 문의를 넣으면
// 자기 문의가 자기 답변 큐(/moderator/support)에 섞여 처리 대상이 흐려지므로, 운영자
// 세션에는 작성·내 문의 내역 대신 문의 관리로 가는 안내를 보여준다.
// 최종 강제는 서버(support.createInquiry의 admin 차단)가 하고, 여기서는 길을 바꿔준다.

import { buttonVariants } from "@bambi-app/ui/components/button";
import { Skeleton } from "@bambi-app/ui/components/skeleton";
import type { Route } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { useBambiAuth } from "@/components/bambi/auth-client-provider";
import { EmptyState } from "@/components/bambi/empty-state";

// 신규 라우트는 Next typedRoutes 생성 타입에 아직 없을 수 있어 캐스팅한다.
const MODERATOR_SUPPORT_PATH = "/moderator/support" as Route;

export function ModeratorSupportNotice() {
	return (
		<EmptyState
			action={
				/* base-ui Button은 nativeButton이 기본 true라 render로 <a>를 넣으면 경고한다. */
				<Link
					className={buttonVariants({ size: "lg" })}
					href={MODERATOR_SUPPORT_PATH}
				>
					문의 관리로 가기
				</Link>
			}
			description="회원이 남긴 1:1 문의는 운영자 콘솔의 고객센터 관리에서 확인하고 답변할 수 있어요."
			title="운영자 계정은 문의 접수 대상이 아니에요"
		/>
	);
}

// 회원 전용 고객센터 화면(문의 작성·내 문의 내역)을 감싼다. 역할을 아직 모르는 동안은
// 자리표시만 둔다 — 폼을 먼저 그리면 운영자에게 입력창이 한 번 번쩍이고 사라진다.
export function MemberOnlySupport({ children }: { children: ReactNode }) {
	const { isPending, role } = useBambiAuth();

	if (isPending) {
		return (
			<div className="flex flex-col gap-3 py-6">
				<Skeleton className="h-8 w-40" />
				<Skeleton className="h-24 w-full" />
			</div>
		);
	}

	if (role === "admin") {
		return (
			<div className="py-6">
				<ModeratorSupportNotice />
			</div>
		);
	}

	return children;
}
