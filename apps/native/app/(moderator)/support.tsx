import type { AppRouterClient } from "@bambi-app/api/routers/index";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
	Button,
	Input,
	Surface,
	Switch,
	TextArea,
	TextField,
	useToast,
} from "heroui-native";
import { useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";
import {
	BambiHeader,
	BambiScreen,
	Pill,
	StateCard,
} from "@/src/components/bambi-screen";
import { MessageBody } from "@/src/components/message-body";
import { ContentDocumentEditor } from "@/src/components/moderation/content-document-editor";
import { FilterChips } from "@/src/components/moderation/filter-chips";
import {
	directMessageBodyToText,
	parseDirectMessageBody,
} from "@/src/lib/me-messages";
import { orpc } from "@/src/lib/orpc";

type Tab = "faq" | "inquiries";
type Inquiry = Awaited<
	ReturnType<AppRouterClient["bambi"]["support"]["listInquiriesByAdmin"]>
>["items"][number];
const TABS = [
	{ label: "문의 답변", value: "inquiries" },
	{ label: "FAQ 관리", value: "faq" },
] as const;
const CATEGORY: Record<string, string> = {
	account: "계정·로그인",
	design: "디자인 제작",
	etc: "기타",
	job_post: "공고·지원",
	payment: "결제·광고",
	report: "신고·제재",
};
const STATUS: Record<string, string> = {
	answered: "답변완료",
	closed: "종료",
	open: "접수됨",
};

function InquiryThread({
	inquiry,
	onChanged,
}: {
	inquiry: Inquiry;
	onChanged: () => Promise<void>;
}) {
	const [reply, setReply] = useState("");
	const { toast } = useToast();
	const query = useQuery(
		orpc.bambi.support.getInquiry.queryOptions({
			input: { inquiryId: inquiry.id },
		})
	);
	const send = useMutation(
		orpc.bambi.support.createInquiryMessage.mutationOptions()
	);
	const close = useMutation(orpc.bambi.support.closeInquiry.mutationOptions());
	const sendReply = async () => {
		await send.mutateAsync({ body: reply.trim(), inquiryId: inquiry.id });
		setReply("");
		await onChanged();
		toast.show({ label: "답변을 보냈어요." });
	};
	const closeInquiry = async () => {
		await close.mutateAsync({ inquiryId: inquiry.id });
		await onChanged();
		toast.show({ label: "문의를 종료했어요." });
	};
	if (query.isPending) {
		return <Text className="text-muted text-sm">대화를 불러오고 있어요.</Text>;
	}
	if (!query.data) {
		return (
			<Text className="text-danger text-sm">문의를 불러오지 못했어요.</Text>
		);
	}
	return (
		<View className="gap-3 border-border border-t pt-3">
			<MessageBody body={query.data.inquiry.body} />
			{query.data.messages.map((message) => (
				<View className="gap-1 rounded-lg bg-background p-3" key={message.id}>
					<Text className="font-semibold text-foreground text-xs">
						{message.authorName}
						{message.isStaff ? " · 운영자" : ""}
					</Text>
					<Text className="text-foreground text-sm leading-5" selectable>
						{message.body}
					</Text>
				</View>
			))}
			{inquiry.inquiryStatus === "closed" ? (
				<Text className="text-muted text-sm">종료된 문의예요.</Text>
			) : (
				<>
					<TextField>
						<TextArea
							maxLength={5000}
							onChangeText={setReply}
							placeholder="답변을 입력해 주세요."
							value={reply}
						/>
					</TextField>
					<Button
						isDisabled={!reply.trim() || send.isPending}
						onPress={() =>
							sendReply().catch((error) =>
								toast.show({ label: error.message, variant: "danger" })
							)
						}
					>
						<Button.Label>답변 보내기</Button.Label>
					</Button>
				</>
			)}
			{inquiry.inquiryStatus === "answered" ? (
				<Button
					isDisabled={close.isPending}
					onPress={() =>
						closeInquiry().catch((error) =>
							toast.show({ label: error.message, variant: "danger" })
						)
					}
					variant="secondary"
				>
					<Button.Label>문의 종료</Button.Label>
				</Button>
			) : null}
		</View>
	);
}

function Inquiries() {
	const [page, setPage] = useState(1);
	const [open, setOpen] = useState<string | null>(null);
	const client = useQueryClient();
	const query = useQuery(
		orpc.bambi.support.listInquiriesByAdmin.queryOptions({ input: { page } })
	);
	const refresh = async () => {
		await client.invalidateQueries({ queryKey: orpc.bambi.support.key() });
	};
	if (query.isError) {
		return (
			<StateCard
				action={
					<Button onPress={() => query.refetch()} size="sm">
						<Button.Label>다시 시도</Button.Label>
					</Button>
				}
				description="네트워크 연결을 확인해 주세요."
				title="문의를 불러오지 못했어요"
			/>
		);
	}
	if (query.isSuccess && query.data.items.length === 0) {
		return (
			<StateCard
				description="새 문의가 들어오면 여기에서 답변할 수 있어요."
				title="접수된 문의가 없어요"
			/>
		);
	}
	return (
		<View className="gap-3">
			{query.data?.items.map((item) => (
				<Surface
					className="gap-3 rounded-lg p-4"
					key={item.id}
					variant="secondary"
				>
					<View className="flex-row flex-wrap gap-2">
						<Pill>{CATEGORY[item.category] ?? "기타"}</Pill>
						<Pill tone={item.inquiryStatus === "open" ? "warning" : "neutral"}>
							{STATUS[item.inquiryStatus] ?? "상태 확인 필요"}
						</Pill>
					</View>
					<Text className="font-bold text-foreground">{item.title}</Text>
					<Button
						onPress={() =>
							setOpen((current) => (current === item.id ? null : item.id))
						}
						size="sm"
						variant="secondary"
					>
						<Button.Label>
							{open === item.id ? "접기" : "대화 열기"}
						</Button.Label>
					</Button>
					{open === item.id ? (
						<InquiryThread inquiry={item} onChanged={refresh} />
					) : null}
				</Surface>
			))}
			<View className="flex-row justify-between">
				<Button
					isDisabled={page <= 1}
					onPress={() => {
						setPage(page - 1);
						setOpen(null);
					}}
					size="sm"
					variant="secondary"
				>
					<Button.Label>이전</Button.Label>
				</Button>
				<Text className="text-muted">{page}</Text>
				<Button
					isDisabled={
						!query.data || page * query.data.pageSize >= query.data.totalCount
					}
					onPress={() => {
						setPage(page + 1);
						setOpen(null);
					}}
					size="sm"
					variant="secondary"
				>
					<Button.Label>다음</Button.Label>
				</Button>
			</View>
		</View>
	);
}

function FaqManager() {
	const [uploading, setUploading] = useState(false);
	const [editingId, setEditingId] = useState<string | null>(null);
	const [question, setQuestion] = useState("");
	const [answer, setAnswer] = useState({ json: "", text: "" });
	const [editorKey, setEditorKey] = useState(0);
	const [category, setCategory] = useState<Inquiry["category"]>("etc");
	const client = useQueryClient();
	const { toast } = useToast();
	const query = useQuery(
		orpc.bambi.support.listFaq.queryOptions({
			input: { includeUnpublished: true },
		})
	);
	const create = useMutation(orpc.bambi.support.createFaq.mutationOptions());
	const publish = useMutation(
		orpc.bambi.support.setFaqPublished.mutationOptions()
	);
	const remove = useMutation(orpc.bambi.support.removeFaq.mutationOptions());
	const refresh = async () => {
		await client.invalidateQueries({ queryKey: orpc.bambi.support.key() });
	};
	const createFaq = async () => {
		await create.mutateAsync({
			answer: answer.json,
			category,
			question: question.trim(),
			sortOrder: query.data?.items.length ?? 0,
		});
		setQuestion("");
		setAnswer({ json: "", text: "" });
		setEditorKey((value) => value + 1);
		await refresh();
		toast.show({ label: "FAQ를 등록했어요." });
	};
	const deleteFaq = (id: string, title: string) =>
		Alert.alert("FAQ를 삭제할까요?", `${title} 항목이 즉시 삭제돼요.`, [
			{ style: "cancel", text: "취소" },
			{
				style: "destructive",
				text: "삭제",
				onPress: async () => {
					try {
						await remove.mutateAsync({ faqId: id });
						await refresh();
					} catch (error) {
						toast.show({
							label:
								error instanceof Error
									? error.message
									: "FAQ를 삭제하지 못했어요.",
							variant: "danger",
						});
					}
				},
			},
		]);
	return (
		<View className="gap-3">
			<TextField>
				<Input
					onChangeText={setQuestion}
					placeholder="FAQ 질문"
					value={question}
				/>
			</TextField>
			<ContentDocumentEditor
				allowUpload
				isDisabled={create.isPending}
				key={editorKey}
				onBusyChange={setUploading}
				onChange={setAnswer}
			/>
			<View className="flex-row flex-wrap gap-2">
				{(
					["account", "design", "etc", "job_post", "payment", "report"] as const
				).map((value) => (
					<Pressable
						className={`rounded-full px-3 py-2 ${category === value ? "bg-accent" : "bg-surface-secondary"}`}
						key={value}
						onPress={() => setCategory(value)}
					>
						<Text
							className={
								category === value
									? "text-accent-foreground"
									: "text-foreground"
							}
						>
							{CATEGORY[value]}
						</Text>
					</Pressable>
				))}
			</View>
			<Button
				isDisabled={
					question.trim().length < 2 ||
					!(
						answer.text.trim() ||
						parseDirectMessageBody(answer.json)?.some(
							(block) => block.type === "image"
						)
					) ||
					create.isPending ||
					uploading
				}
				onPress={() =>
					createFaq().catch((error) =>
						toast.show({ label: error.message, variant: "danger" })
					)
				}
			>
				<Button.Label>FAQ 추가</Button.Label>
			</Button>
			{query.data?.items.map((item) => (
				<Surface
					className="gap-2 rounded-lg p-4"
					key={item.id}
					variant="secondary"
				>
					<View className="flex-row items-center gap-2">
						<Pill>{CATEGORY[item.category] ?? "기타"}</Pill>
						<Switch
							isDisabled={publish.isPending}
							isSelected={item.isPublished}
							onSelectedChange={async (value) => {
								try {
									await publish.mutateAsync({
										faqId: item.id,
										isPublished: value,
									});
									await refresh();
								} catch (error) {
									toast.show({
										label:
											error instanceof Error
												? error.message
												: "게시 상태를 바꾸지 못했어요.",
										variant: "danger",
									});
								}
							}}
						/>
					</View>
					<Text className="font-bold text-foreground">{item.question}</Text>
					<MessageBody body={item.answer} />
					{editingId === item.id ? (
						<FaqEdit
							item={item}
							onCancel={() => setEditingId(null)}
							onSaved={async () => {
								await refresh();
								setEditingId(null);
							}}
						/>
					) : (
						<Button
							onPress={() => setEditingId(item.id)}
							size="sm"
							variant="secondary"
						>
							<Button.Label>수정</Button.Label>
						</Button>
					)}
					<Button
						onPress={() => deleteFaq(item.id, item.question)}
						size="sm"
						variant="danger-soft"
					>
						<Button.Label>삭제</Button.Label>
					</Button>
				</Surface>
			))}
		</View>
	);
}

function FaqEdit({
	item,
	onCancel,
	onSaved,
}: {
	item: Awaited<
		ReturnType<AppRouterClient["bambi"]["support"]["listFaq"]>
	>["items"][number];
	onCancel: () => void;
	onSaved: () => Promise<void>;
}) {
	const [uploading, setUploading] = useState(false);
	const [question, setQuestion] = useState(item.question);
	const [category, setCategory] = useState(item.category);
	const [answer, setAnswer] = useState({
		json: item.answer,
		text: directMessageBodyToText(item.answer),
	});
	const update = useMutation(orpc.bambi.support.updateFaq.mutationOptions());
	const { toast } = useToast();
	return (
		<View className="gap-3">
			<TextField>
				<Input
					accessibilityLabel="FAQ 질문"
					onChangeText={setQuestion}
					value={question}
				/>
			</TextField>
			<View className="flex-row flex-wrap gap-2">
				{(
					["account", "design", "etc", "job_post", "payment", "report"] as const
				).map((value) => (
					<Button
						key={value}
						onPress={() => setCategory(value)}
						size="sm"
						variant={category === value ? "primary" : "secondary"}
					>
						<Button.Label>{CATEGORY[value]}</Button.Label>
					</Button>
				))}
			</View>
			<ContentDocumentEditor
				allowUpload
				isDisabled={update.isPending}
				onBusyChange={setUploading}
				onChange={setAnswer}
				value={item.answer}
			/>
			<Button
				isDisabled={
					update.isPending ||
					uploading ||
					question.trim().length < 2 ||
					!(
						answer.text.trim() ||
						parseDirectMessageBody(answer.json)?.some(
							(block) => block.type === "image"
						)
					)
				}
				onPress={async () => {
					try {
						await update.mutateAsync({
							faqId: item.id,
							question: question.trim(),
							category,
							answer: answer.json,
							sortOrder: item.sortOrder,
						});
						await onSaved();
						toast.show({ label: "FAQ를 수정했어요." });
					} catch (error) {
						toast.show({
							label:
								error instanceof Error ? error.message : "수정하지 못했어요.",
							variant: "danger",
						});
					}
				}}
			>
				<Button.Label>수정 저장</Button.Label>
			</Button>
			<Button
				isDisabled={update.isPending}
				onPress={onCancel}
				variant="secondary"
			>
				<Button.Label>취소</Button.Label>
			</Button>
		</View>
	);
}

export default function ModeratorSupportScreen() {
	const [tab, setTab] = useState<Tab>("inquiries");
	return (
		<BambiScreen>
			<BambiHeader
				description="1:1 문의 답변과 FAQ를 관리합니다."
				title="고객센터 관리"
			/>
			<FilterChips onChange={setTab} options={TABS} value={tab} />
			{tab === "inquiries" ? <Inquiries /> : <FaqManager />}
		</BambiScreen>
	);
}
