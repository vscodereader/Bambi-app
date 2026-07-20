"use client";

// 운영자 고객센터 — 1:1 문의 답변 큐와 FAQ 관리를 탭 2개로 묶는다.
// 답변을 보내면 서버가 isStaff/inquiryStatus를 갱신하므로 화면에서 상태를 만지지 않는다.

import { Badge } from "@bambi-app/ui/components/badge";
import { Button } from "@bambi-app/ui/components/button";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@bambi-app/ui/components/card";
import { Input } from "@bambi-app/ui/components/input";
import { Label } from "@bambi-app/ui/components/label";
import { Separator } from "@bambi-app/ui/components/separator";
import { Skeleton } from "@bambi-app/ui/components/skeleton";
import { Switch } from "@bambi-app/ui/components/switch";
import {
	Tabs,
	TabsContent,
	TabsList,
	TabsTrigger,
} from "@bambi-app/ui/components/tabs";
import { Textarea } from "@bambi-app/ui/components/textarea";
import {
	ToggleGroup,
	ToggleGroupItem,
} from "@bambi-app/ui/components/toggle-group";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { EmptyState } from "@/components/bambi/empty-state";
import {
	INQUIRY_STATUS_LABELS,
	SUPPORT_CATEGORIES,
	SUPPORT_CATEGORY_LABELS,
	type SupportCategory,
} from "@/lib/bambi/support";
import { formatDateTime } from "@/lib/bambi-format";
import { orpc } from "@/utils/orpc";

const FAQ_QUESTION_MIN = 2;

export default function ModeratorSupportPage() {
	return (
		<div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-5 py-6 md:px-6">
			<h1 className="m-0 font-extrabold text-2xl">고객센터 관리</h1>
			<Tabs defaultValue="inquiries">
				<TabsList className="max-w-full flex-wrap">
					<TabsTrigger value="inquiries">문의 답변</TabsTrigger>
					<TabsTrigger value="faq">FAQ 관리</TabsTrigger>
				</TabsList>
				<TabsContent value="inquiries">
					<InquiryQueue />
				</TabsContent>
				<TabsContent value="faq">
					<FaqManager />
				</TabsContent>
			</Tabs>
		</div>
	);
}

function useInvalidateSupport() {
	const queryClient = useQueryClient();

	return () =>
		queryClient.invalidateQueries({ queryKey: orpc.bambi.support.key() });
}

function ListSkeleton() {
	return (
		<div className="flex flex-col gap-2">
			<Skeleton className="h-24 w-full" />
			<Skeleton className="h-24 w-full" />
			<Skeleton className="h-24 w-full" />
		</div>
	);
}

function InquiryQueue() {
	const invalidate = useInvalidateSupport();
	const [openId, setOpenId] = useState<string | null>(null);

	const inquiriesQuery = useQuery(
		orpc.bambi.support.listInquiriesByAdmin.queryOptions({ input: {} })
	);
	const items = inquiriesQuery.data?.items ?? [];

	return (
		<div className="flex flex-col gap-3 pt-4">
			{inquiriesQuery.isPending ? <ListSkeleton /> : null}

			{!inquiriesQuery.isPending && items.length === 0 ? (
				<EmptyState
					description="새 1:1 문의가 들어오면 이곳에서 바로 답변할 수 있어요."
					title="접수된 문의가 없어요"
				/>
			) : null}

			{items.map((item) => (
				<Card key={item.id}>
					<CardHeader className="flex min-w-0 flex-col gap-2">
						<div className="flex flex-wrap items-center gap-2">
							<Badge variant="secondary">
								{SUPPORT_CATEGORY_LABELS[item.category]}
							</Badge>
							<Badge
								variant={item.inquiryStatus === "open" ? "default" : "outline"}
							>
								{INQUIRY_STATUS_LABELS[item.inquiryStatus]}
							</Badge>
							<span className="text-muted-foreground text-xs">
								{formatDateTime(item.lastMessageAt)}
							</span>
						</div>
						<CardTitle className="truncate">{item.title}</CardTitle>
					</CardHeader>
					<CardContent className="flex min-w-0 flex-col gap-3">
						<p className="m-0 line-clamp-3 whitespace-pre-wrap text-muted-foreground text-sm">
							{item.body}
						</p>
						<Button
							className="self-start"
							onClick={() => setOpenId(openId === item.id ? null : item.id)}
							size="sm"
							variant="outline"
						>
							{openId === item.id ? "접기" : "대화 열기"}
						</Button>
						{openId === item.id ? (
							<InquiryThread
								inquiryId={item.id}
								isClosed={item.inquiryStatus === "closed"}
								onAnswered={invalidate}
							/>
						) : null}
					</CardContent>
				</Card>
			))}
		</div>
	);
}

function InquiryThread({
	inquiryId,
	isClosed,
	onAnswered,
}: {
	inquiryId: string;
	isClosed: boolean;
	onAnswered: () => Promise<void>;
}) {
	const [reply, setReply] = useState("");

	const threadQuery = useQuery(
		orpc.bambi.support.getInquiry.queryOptions({ input: { inquiryId } })
	);

	const replyMutation = useMutation(
		orpc.bambi.support.createInquiryMessage.mutationOptions({
			onError: (error) => toast.error(error.message),
			onSuccess: async () => {
				toast.success("답변을 보냈어요.");
				setReply("");
				await onAnswered();
			},
		})
	);

	if (threadQuery.isPending) {
		return <Skeleton className="h-24 w-full" />;
	}

	return (
		<div className="flex min-w-0 flex-col gap-3">
			<Separator />
			{(threadQuery.data?.messages ?? []).map((message) => (
				<div className="flex min-w-0 flex-col gap-1" key={message.id}>
					<div className="flex flex-wrap items-center gap-2">
						<Badge variant={message.isStaff ? "default" : "outline"}>
							{message.isStaff ? "운영자" : "회원"}
						</Badge>
						<span className="text-muted-foreground text-xs">
							{formatDateTime(message.createdAt)}
						</span>
					</div>
					<p className="m-0 whitespace-pre-wrap text-sm">{message.body}</p>
				</div>
			))}

			{isClosed ? (
				<p className="m-0 text-muted-foreground text-sm">
					종료된 문의라 답변을 남길 수 없어요.
				</p>
			) : (
				<>
					<Textarea
						className="min-h-24"
						onChange={(event) => setReply(event.target.value)}
						placeholder="답변을 입력하세요"
						value={reply}
					/>
					<Button
						className="self-start"
						disabled={reply.trim().length === 0 || replyMutation.isPending}
						onClick={() =>
							replyMutation.mutate({ body: reply.trim(), inquiryId })
						}
						size="sm"
					>
						답변 보내기
					</Button>
				</>
			)}
		</div>
	);
}

function FaqManager() {
	const invalidate = useInvalidateSupport();
	const [category, setCategory] = useState<SupportCategory>("account");
	const [question, setQuestion] = useState("");
	const [answer, setAnswer] = useState("");

	// 운영자 목록은 비공개 초안까지 본다. 감추면 다시 공개로 되돌릴 진입점이 사라진다.
	const faqQuery = useQuery(
		orpc.bambi.support.listFaq.queryOptions({
			input: { includeUnpublished: true },
		})
	);
	const items = faqQuery.data?.items ?? [];

	const createFaq = useMutation(
		orpc.bambi.support.createFaq.mutationOptions({
			onError: (error) => toast.error(error.message),
			onSuccess: async () => {
				toast.success("FAQ를 등록했어요.");
				setQuestion("");
				setAnswer("");
				await invalidate();
			},
		})
	);

	const setPublished = useMutation(
		orpc.bambi.support.setFaqPublished.mutationOptions({
			onError: (error) => toast.error(error.message),
			onSuccess: async () => {
				toast.success("공개 상태를 바꿨어요.");
				await invalidate();
			},
		})
	);

	const removeFaq = useMutation(
		orpc.bambi.support.removeFaq.mutationOptions({
			onError: (error) => toast.error(error.message),
			onSuccess: async () => {
				toast.success("FAQ를 삭제했어요.");
				await invalidate();
			},
		})
	);

	return (
		<div className="flex flex-col gap-4 pt-4">
			<Card>
				<CardHeader>
					<CardTitle>새 FAQ 등록</CardTitle>
				</CardHeader>
				<CardContent className="flex min-w-0 flex-col gap-3">
					<Label>카테고리</Label>
					<ToggleGroup
						aria-label="FAQ 카테고리"
						className="w-full flex-wrap"
						onValueChange={(value) => setCategory(value.at(-1) ?? category)}
						value={[category]}
					>
						{SUPPORT_CATEGORIES.map((key) => (
							<ToggleGroupItem key={key} value={key}>
								{SUPPORT_CATEGORY_LABELS[key]}
							</ToggleGroupItem>
						))}
					</ToggleGroup>
					<Label htmlFor="faq-question">질문</Label>
					<Input
						id="faq-question"
						maxLength={300}
						onChange={(event) => setQuestion(event.target.value)}
						placeholder="자주 묻는 질문을 입력하세요"
						value={question}
					/>
					<Label htmlFor="faq-answer">답변</Label>
					<Textarea
						className="min-h-24"
						id="faq-answer"
						onChange={(event) => setAnswer(event.target.value)}
						placeholder="답변을 입력하세요"
						value={answer}
					/>
					<Button
						className="self-start"
						disabled={
							question.trim().length < FAQ_QUESTION_MIN ||
							answer.trim().length === 0 ||
							createFaq.isPending
						}
						onClick={() =>
							createFaq.mutate({
								answer: answer.trim(),
								category,
								question: question.trim(),
							})
						}
					>
						FAQ 등록
					</Button>
				</CardContent>
			</Card>

			{faqQuery.isPending ? <ListSkeleton /> : null}

			{!faqQuery.isPending && items.length === 0 ? (
				<EmptyState
					description="위에서 첫 FAQ를 등록하면 고객센터에 바로 노출돼요."
					title="등록된 FAQ가 없어요"
				/>
			) : null}

			{items.map((item) => (
				<Card key={item.id}>
					<CardHeader className="flex min-w-0 flex-col gap-2">
						<div className="flex flex-wrap items-center gap-2">
							<Badge variant="secondary">
								{SUPPORT_CATEGORY_LABELS[item.category]}
							</Badge>
							{item.isPublished ? null : (
								<Badge variant="warning">비공개</Badge>
							)}
						</div>
						<CardTitle>{item.question}</CardTitle>
					</CardHeader>
					<CardContent className="flex min-w-0 flex-col gap-3">
						<p className="m-0 whitespace-pre-wrap text-muted-foreground text-sm">
							{item.answer}
						</p>
						<div className="flex flex-wrap items-center gap-3">
							<Label
								className="flex items-center gap-2"
								htmlFor={`faq-published-${item.id}`}
							>
								<Switch
									checked={item.isPublished}
									disabled={setPublished.isPending}
									id={`faq-published-${item.id}`}
									onCheckedChange={(checked) =>
										setPublished.mutate({
											faqId: item.id,
											isPublished: checked,
										})
									}
								/>
								{item.isPublished ? "공개 중" : "숨김"}
							</Label>
							<Button
								disabled={removeFaq.isPending}
								onClick={() => removeFaq.mutate({ faqId: item.id })}
								size="sm"
								variant="destructive"
							>
								삭제
							</Button>
						</div>
					</CardContent>
				</Card>
			))}
		</div>
	);
}
