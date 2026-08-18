"use client";

import { Button } from "@bambi-app/ui/components/button";
import {
	Message,
	MessageAvatar,
	MessageContent,
	MessageGroup,
} from "@bambi-app/ui/components/message";
import { ChevronRight, MessageCircle, SendHorizontal, X } from "lucide-react";
import Link from "next/link";

// 홈 뷰: 운영자 인사 말풍선(shadcn Message) + (공지 배너) + "메시지를 보내주세요" + 게시 FAQ 바로가기.
// notice/faqs는 셸의 getWidgetHome 응답, onStartChat/onNavigate는 뷰 전환·패널 닫기, onClose는 패널 닫기(우상단 X).
export function WidgetHome({
	faqs,
	notice,
	onClose,
	onNavigate,
	onStartChat,
}: {
	faqs: { id: string; question: string }[];
	notice: null | string;
	onClose: () => void;
	onNavigate: () => void;
	onStartChat: () => void;
}) {
	return (
		<div className="relative flex flex-1 flex-col overflow-hidden">
			{/* 홈 뷰 닫기 — 스크롤 영역 밖에 고정해 함께 스크롤되지 않는다. */}
			<Button
				aria-label="문의 닫기"
				className="absolute top-2 right-2 z-10 text-muted-foreground"
				onClick={onClose}
				size="icon-sm"
				variant="ghost"
			>
				<X />
			</Button>
			<div className="flex flex-1 flex-col gap-3 overflow-y-auto p-4">
				<MessageGroup>
					<Message align="start">
						<MessageAvatar className="size-8 bg-primary text-primary-foreground">
							<MessageCircle className="size-4" />
						</MessageAvatar>
						<MessageContent>
							<div className="w-fit rounded-xl rounded-bl-sm bg-muted px-3 py-2">
								<p className="m-0 font-semibold text-foreground text-sm">
									안녕하세요 👋
								</p>
								<p className="m-0 text-muted-foreground text-sm">
									무엇을 도와드릴까요?
								</p>
							</div>
						</MessageContent>
					</Message>
				</MessageGroup>
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
		</div>
	);
}
