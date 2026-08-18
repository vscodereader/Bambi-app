"use client";

import { Button } from "@bambi-app/ui/components/button";
import { ChevronRight, SendHorizontal } from "lucide-react";
import Link from "next/link";

// 홈 뷰: 인사 카드 + (공지 배너) + "메시지를 보내주세요" + 게시 FAQ 바로가기.
// notice/faqs는 셸의 getWidgetHome 응답, onStartChat/onNavigate는 뷰 전환·패널 닫기.
export function WidgetHome({
	faqs,
	notice,
	onNavigate,
	onStartChat,
}: {
	faqs: { id: string; question: string }[];
	notice: null | string;
	onNavigate: () => void;
	onStartChat: () => void;
}) {
	return (
		<div className="flex flex-1 flex-col gap-3 overflow-y-auto p-4">
			<div className="rounded-xl bg-primary p-4 text-primary-foreground">
				<p className="m-0 font-bold text-lg">안녕하세요 👋</p>
				<p className="m-0 text-sm opacity-90">무엇을 도와드릴까요?</p>
			</div>
			{notice ? (
				<div className="rounded-lg border bg-muted/50 p-3 text-sm">
					{notice}
				</div>
			) : null}
			<Button className="justify-between" onClick={onStartChat}>
				메시지를 보내주세요
				<SendHorizontal />
			</Button>
			{faqs.length > 0 ? (
				<div className="flex flex-col gap-1">
					<p className="m-0 px-1 text-muted-foreground text-xs">
						자주 묻는 질문
					</p>
					{faqs.map((faq) => (
						<Link
							className="flex items-center justify-between gap-2 rounded-lg border p-3 text-sm hover:bg-muted"
							href="/support"
							key={faq.id}
							onClick={onNavigate}
						>
							<span className="min-w-0 truncate">{faq.question}</span>
							<ChevronRight className="size-4 shrink-0 text-muted-foreground" />
						</Link>
					))}
				</div>
			) : null}
		</div>
	);
}
