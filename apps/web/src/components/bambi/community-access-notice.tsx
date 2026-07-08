"use client";

import { Button } from "@bambi-app/ui/components/button";
import type { Route } from "next";
import Link from "next/link";
import { EmptyState } from "./empty-state";

type CommunityNotice = "unverified" | "male_employer" | "male_seeker";

interface NoticeContent {
	cta?: { href: Route; label: string };
	description: string;
	title: string;
}

const NOTICE_CONTENT: Record<CommunityNotice, NoticeContent> = {
	unverified: {
		cta: { href: "/seeker/me" as Route, label: "내 정보에서 인증하기" },
		description:
			"휴대폰 본인인증을 마친 여성 회원과 광고 중인 업소만 수다방에 입장할 수 있어요.",
		title: "본인인증이 필요해요",
	},
	male_employer: {
		cta: { href: "/employer/promotions" as Route, label: "광고 등록하러 가기" },
		description: "광고를 등록하면 수다방에 입장할 수 있어요.",
		title: "광고 중인 업소만 입장할 수 있어요",
	},
	male_seeker: {
		description: "수다방은 여성 회원과 광고 중인 업소만 이용할 수 있어요.",
		title: "여성 회원 전용 공간이에요",
	},
};

export function CommunityAccessNotice({ notice }: { notice: CommunityNotice }) {
	const content = NOTICE_CONTENT[notice];
	return (
		<div className="mx-auto flex w-full max-w-full flex-1 flex-col px-5 py-6 md:max-w-[min(80%,72rem)] md:px-6">
			<EmptyState
				action={
					content.cta ? (
						<Button
							render={<Link href={content.cta.href}>{content.cta.label}</Link>}
						/>
					) : undefined
				}
				className="flex-1"
				description={content.description}
				title={content.title}
			/>
		</div>
	);
}
