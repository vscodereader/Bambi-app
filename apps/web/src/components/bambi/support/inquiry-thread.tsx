"use client";

// 문의 상세 스레드. 원문 + 시간순 메시지 + 답장 입력을 한 화면에 둔다.
// 폭·좌우 패딩은 app/support/layout.tsx가 이미 잡으므로 여기서 다시 선언하지 않는다.

import { Badge } from "@bambi-app/ui/components/badge";
import { Button } from "@bambi-app/ui/components/button";
import { Card, CardContent } from "@bambi-app/ui/components/card";
import { Separator } from "@bambi-app/ui/components/separator";
import { Skeleton } from "@bambi-app/ui/components/skeleton";
import { Textarea } from "@bambi-app/ui/components/textarea";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { PostBodyViewer } from "@/components/bambi/community-post-detail-parts";
import { Avatar } from "@/components/bambi/ds";
import {
	INQUIRY_STATUS_LABELS,
	SUPPORT_CATEGORY_LABELS,
} from "@/lib/bambi/support";
import { orpc } from "@/utils/orpc";

const BODY_MAX = 5000;

export function InquiryThread({ inquiryId }: { inquiryId: string }) {
	const queryClient = useQueryClient();
	const [reply, setReply] = useState("");

	const inquiryQuery = useQuery(
		orpc.bambi.support.getInquiry.queryOptions({ input: { inquiryId } })
	);

	const invalidate = () =>
		queryClient.invalidateQueries({ queryKey: orpc.bambi.support.key() });

	const replyMutation = useMutation(
		orpc.bambi.support.createInquiryMessage.mutationOptions({
			onError: (error) => {
				toast(error.message || "메시지를 보내지 못했어요.");
			},
			onSuccess: async () => {
				setReply("");
				await invalidate();
			},
		})
	);

	if (inquiryQuery.isPending) {
		return (
			<div className="flex flex-col gap-3 py-6">
				<Skeleton className="h-24 w-full" />
				<Skeleton className="h-24 w-full" />
			</div>
		);
	}

	if (inquiryQuery.isError || !inquiryQuery.data) {
		return (
			<div className="py-6">
				<p className="m-0 text-muted-foreground text-sm">
					문의를 불러오지 못했어요. 접근 권한이 없거나 삭제된 문의일 수 있어요.
				</p>
			</div>
		);
	}

	const { inquiry, messages } = inquiryQuery.data;
	// 종료는 운영자만 한다(문의자가 닫으면 운영자 답변까지 막혀서 종료 버튼을 걷어냈다).
	// 종료된 문의는 서버가 BAD_REQUEST를 주므로 입력창 자체를 내린다.
	const isClosed = inquiry.inquiryStatus === "closed";

	return (
		<div className="flex flex-col gap-5 py-6">
			<header className="flex min-w-0 flex-col gap-2">
				<div className="flex flex-wrap items-center gap-2">
					<Badge variant="secondary">
						{SUPPORT_CATEGORY_LABELS[inquiry.category]}
					</Badge>
					<Badge
						variant={
							inquiry.inquiryStatus === "answered" ? "default" : "outline"
						}
					>
						{INQUIRY_STATUS_LABELS[inquiry.inquiryStatus]}
					</Badge>
				</div>
				<h1 className="m-0 font-extrabold text-lg md:text-xl">
					{inquiry.title}
				</h1>
				<div className="flex items-center gap-2">
					<Avatar
						fallbackIcon="user"
						name={inquiry.authorName}
						size="sm"
						src={inquiry.authorImage ?? undefined}
					/>
					<span className="font-semibold text-sm">{inquiry.authorName}</span>
				</div>
				{/* 본문은 Tiptap JSON이라 뷰어로 렌더한다. JSON이 아닌 기존 평문 문의는
				    뷰어가 whitespace-pre-wrap <p> 폴백으로 그대로 보여준다. */}
				<PostBodyViewer body={inquiry.body} />
				<p className="m-0 text-muted-foreground text-xs">
					{new Date(inquiry.createdAt).toLocaleString("ko-KR")}
				</p>
			</header>

			<Separator />

			<div className="flex flex-col gap-3">
				{messages.map((message) => (
					<Card key={message.id}>
						<CardContent className="flex min-w-0 gap-3 py-4">
							<Avatar
								fallbackIcon="user"
								name={message.authorName}
								size="sm"
								src={message.authorImage ?? undefined}
							/>
							<div className="flex min-w-0 flex-1 flex-col gap-2">
								{/* isStaff는 작성 시점 스냅샷이라 이후 role 변경과 무관하게 표시가 고정된다. */}
								<div className="flex flex-wrap items-center gap-2">
									<span className="font-semibold text-sm">
										{message.authorName}
									</span>
									<Badge variant={message.isStaff ? "default" : "outline"}>
										{message.isStaff ? "운영자" : "나"}
									</Badge>
								</div>
								<p className="m-0 whitespace-pre-wrap break-words text-sm">
									{message.body}
								</p>
								<p className="m-0 text-muted-foreground text-xs">
									{new Date(message.createdAt).toLocaleString("ko-KR")}
								</p>
							</div>
						</CardContent>
					</Card>
				))}
			</div>

			{isClosed ? (
				<p className="m-0 text-muted-foreground text-sm">
					종료된 문의예요. 추가로 문의할 내용이 있으면 새로 등록해 주세요.
				</p>
			) : (
				<div className="flex flex-col gap-2">
					<Textarea
						className="min-h-28"
						maxLength={BODY_MAX}
						onChange={(event) => setReply(event.target.value)}
						placeholder="추가로 남길 내용을 적어 주세요"
						value={reply}
					/>
					<Button
						className="self-start"
						disabled={reply.trim().length === 0 || replyMutation.isPending}
						onClick={() => replyMutation.mutate({ body: reply, inquiryId })}
					>
						보내기
					</Button>
				</div>
			)}
		</div>
	);
}
