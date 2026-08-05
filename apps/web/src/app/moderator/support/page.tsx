"use client";

// 운영자 고객센터 — 1:1 문의 답변 큐와 FAQ 관리를 탭 2개로 묶는다.
// 답변을 보내면 서버가 isStaff/inquiryStatus를 갱신하므로 화면에서 상태를 만지지 않는다.

import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from "@bambi-app/ui/components/accordion";
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
import { CommunityPostEditor } from "@/components/bambi/community-editor";
import { PostBodyViewer } from "@/components/bambi/community-post-detail-parts";
import { EmptyState } from "@/components/bambi/empty-state";
import {
	INQUIRY_STATUS_LABELS,
	type InquiryStatus,
	SUPPORT_CATEGORIES,
	SUPPORT_CATEGORY_LABELS,
	type SupportCategory,
} from "@/lib/bambi/support";
import { formatDateTime } from "@/lib/bambi-format";
import { orpc } from "@/utils/orpc";

const FAQ_QUESTION_MIN = 2;

export default function ModeratorSupportPage() {
	return (
		<div className="mx-auto flex w-full flex-col gap-4 px-5 py-6 md:px-6">
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
								inquiryStatus={item.inquiryStatus}
								onChanged={invalidate}
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
	inquiryStatus,
	onChanged,
}: {
	inquiryId: string;
	inquiryStatus: InquiryStatus;
	onChanged: () => Promise<void>;
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
				await onChanged();
			},
		})
	);

	// 종료는 운영자만 한다. 서버가 answered 이후에만 받으므로 버튼도 그때만 띄운다.
	const closeMutation = useMutation(
		orpc.bambi.support.closeInquiry.mutationOptions({
			onError: (error) => toast.error(error.message),
			onSuccess: async () => {
				toast.success("문의를 종료했어요.");
				await onChanged();
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

			{inquiryStatus === "closed" ? (
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
					<div className="flex flex-wrap gap-2">
						<Button
							disabled={reply.trim().length === 0 || replyMutation.isPending}
							onClick={() =>
								replyMutation.mutate({ body: reply.trim(), inquiryId })
							}
							size="sm"
						>
							답변 보내기
						</Button>
						{inquiryStatus === "answered" ? (
							<Button
								disabled={closeMutation.isPending}
								onClick={() => closeMutation.mutate({ inquiryId })}
								size="sm"
								variant="outline"
							>
								문의 종료
							</Button>
						) : null}
					</div>
				</>
			)}
		</div>
	);
}

function FaqManager() {
	const invalidate = useInvalidateSupport();
	const [category, setCategory] = useState<SupportCategory>("account");
	const [question, setQuestion] = useState("");
	// answer는 제출용 Tiptap JSON 문자열이라 빈 문서도 40자쯤 된다 — 비어있음 판정에
	// 쓰면 등록 버튼이 항상 열린다. 판정은 에디터가 같이 주는 text·hasImage로만 한다
	// (이미지만 넣은 답변도 유효하므로 텍스트 길이 단독 게이트는 쓰지 않는다).
	const [answer, setAnswer] = useState("");
	const [answerText, setAnswerText] = useState("");
	const [answerHasImage, setAnswerHasImage] = useState(false);
	// 에디터는 마운트 후 비제어라 등록 성공 시 state만 비워서는 본문이 남는다. key를 올려
	// 강제 리마운트시켜 빈 문서로 되돌린다.
	const [editorKey, setEditorKey] = useState(0);

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
				setAnswerText("");
				setAnswerHasImage(false);
				setEditorKey((previous) => previous + 1);
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
					<Label>답변</Label>
					<CommunityPostEditor
						key={editorKey}
						onChange={(payload) => {
							setAnswer(payload.json);
							setAnswerText(payload.text);
							setAnswerHasImage(payload.hasImage);
						}}
						value={answer}
					/>
					<Button
						className="self-start"
						disabled={
							question.trim().length < FAQ_QUESTION_MIN ||
							(answerText.trim().length === 0 && !answerHasImage) ||
							createFaq.isPending
						}
						onClick={() =>
							createFaq.mutate({
								answer,
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

			{/* 답변이 리치 텍스트가 되면서 카드마다 세로가 길어져 목록을 훑기 어려워졌다.
			    고객센터 공개 목록(support/faq-list)과 같은 아코디언으로 접어, 기본은 질문만
			    보이고 필요한 항목만 펼치게 한다. 카테고리·비공개 배지는 접힌 상태에서도
			    보여야 목록에서 상태를 판단할 수 있으므로 트리거 밖(위)에 둔다. */}
			{items.length > 0 ? (
				<Accordion className="flex flex-col gap-3">
					{items.map((item) => (
						<AccordionItem
							className="rounded-xl border px-4 pb-1"
							key={item.id}
							value={item.id}
						>
							<div className="flex flex-wrap items-center gap-2 pt-3">
								<Badge variant="secondary">
									{SUPPORT_CATEGORY_LABELS[item.category]}
								</Badge>
								{item.isPublished ? null : (
									<Badge variant="warning">비공개</Badge>
								)}
							</div>
							{/* 질문 자체가 펼침 트리거다. 공개·삭제 조작은 트리거 안에 넣으면
							    버튼이 중첩돼 접근성이 깨지므로 펼친 내용 쪽에 둔다. */}
							<AccordionTrigger className="font-bold text-base">
								{item.question}
							</AccordionTrigger>
							<AccordionContent className="flex min-w-0 flex-col gap-3">
								{/* 답변은 Tiptap JSON이라 뷰어로 렌더한다. JSON이 아닌 기존 평문 행은
								    뷰어가 whitespace-pre-wrap <p> 폴백으로 그대로 보여준다. */}
								<PostBodyViewer body={item.answer} />
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
							</AccordionContent>
						</AccordionItem>
					))}
				</Accordion>
			) : null}
		</div>
	);
}
