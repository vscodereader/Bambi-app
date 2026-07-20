"use client";

// 고객센터 랜딩 — 공개 FAQ 목록(카테고리 필터 + 아코디언 펼침)과 1:1 문의 진입점.
// 폭·좌우 여백은 app/support/layout.tsx가 관리하므로 여기서 다시 선언하지 않는다.

import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from "@bambi-app/ui/components/accordion";
import { buttonVariants } from "@bambi-app/ui/components/button";
import { Skeleton } from "@bambi-app/ui/components/skeleton";
import {
	ToggleGroup,
	ToggleGroupItem,
} from "@bambi-app/ui/components/toggle-group";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { PostBodyViewer } from "@/components/bambi/community-post-detail-parts";
import { EmptyState } from "@/components/bambi/empty-state";
import {
	SUPPORT_CATEGORIES,
	SUPPORT_CATEGORY_LABELS,
	SUPPORT_INQUIRIES_PATH,
	SUPPORT_INQUIRY_NEW_PATH,
	type SupportCategory,
} from "@/lib/bambi/support";
import { orpc } from "@/utils/orpc";

// ToggleGroup은 값 배열을 다루므로 "전체"도 하나의 값으로 두고 필터 없음에 매핑한다.
const ALL_VALUE = "all";

type FilterValue = SupportCategory | typeof ALL_VALUE;

export function FaqList() {
	const [filter, setFilter] = useState<FilterValue>(ALL_VALUE);

	const faqQuery = useQuery(
		orpc.bambi.support.listFaq.queryOptions({
			input: filter === ALL_VALUE ? {} : { category: filter },
		})
	);

	const items = faqQuery.data?.items ?? [];

	return (
		<div className="flex flex-col gap-6 py-6">
			<header className="flex flex-col gap-2">
				<h1 className="m-0 font-extrabold text-xl">고객센터</h1>
				<p className="m-0 text-muted-foreground text-sm">
					자주 묻는 질문을 먼저 확인하고, 해결되지 않으면 1:1 문의를 남겨
					주세요.
				</p>
			</header>

			<ToggleGroup
				aria-label="FAQ 카테고리"
				className="w-full flex-wrap"
				onValueChange={(value) => {
					const next = value.at(-1);
					// 이미 선택된 칩을 다시 누르면 빈 배열이 오는데, 이때는 전체로 되돌린다.
					setFilter(next ?? ALL_VALUE);
				}}
				value={[filter]}
			>
				<ToggleGroupItem value={ALL_VALUE}>전체</ToggleGroupItem>
				{SUPPORT_CATEGORIES.map((key) => (
					<ToggleGroupItem key={key} value={key}>
						{SUPPORT_CATEGORY_LABELS[key]}
					</ToggleGroupItem>
				))}
			</ToggleGroup>

			{faqQuery.isPending ? (
				<div className="flex flex-col gap-2">
					<Skeleton className="h-12 w-full" />
					<Skeleton className="h-12 w-full" />
					<Skeleton className="h-12 w-full" />
				</div>
			) : null}

			{!faqQuery.isPending && items.length === 0 ? (
				<EmptyState
					description="다른 카테고리를 골라 보거나, 1:1 문의로 직접 물어봐 주세요."
					title="등록된 FAQ가 없어요"
				/>
			) : null}

			{items.length > 0 ? (
				<Accordion className="rounded-xl border px-4">
					{items.map((item) => (
						<AccordionItem key={item.id} value={item.id}>
							<AccordionTrigger>{item.question}</AccordionTrigger>
							<AccordionContent>
								{/* 답변은 운영자가 리치 에디터로 쓴 Tiptap JSON이라 뷰어로 렌더한다.
								    에디터 도입 이전에 저장된 평문 행은 뷰어의 <p> 폴백으로 그대로 나온다. */}
								<PostBodyViewer body={item.answer} />
							</AccordionContent>
						</AccordionItem>
					))}
				</Accordion>
			) : null}

			{/* base-ui Button은 nativeButton이 기본 true라 render로 <a>를 넣으면 경고한다.
			    링크는 이 레포 관례대로 Link에 buttonVariants를 입힌다. */}
			<div className="flex flex-wrap gap-2">
				<Link
					className={buttonVariants({ size: "lg" })}
					href={SUPPORT_INQUIRY_NEW_PATH}
				>
					1:1 문의하기
				</Link>
				<Link
					className={buttonVariants({ size: "lg", variant: "outline" })}
					href={SUPPORT_INQUIRIES_PATH}
				>
					내 문의 내역
				</Link>
			</div>
		</div>
	);
}
