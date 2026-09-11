import type { AppRouterClient } from "@bambi-app/api/routers/index";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { openBrowserAsync } from "expo-web-browser";
import { Button, Input, Surface, TextField, useToast } from "heroui-native";
import { useState } from "react";
import { Alert, Text, View } from "react-native";
import {
	BambiHeader,
	BambiScreen,
	Pill,
	StateCard,
} from "@/src/components/bambi-screen";
import { FilterChips } from "@/src/components/moderation/filter-chips";
import { resolveWebUrl } from "@/src/lib/dev-web-url";
import { saveManagedFile } from "@/src/lib/managed-file";
import { orpc } from "@/src/lib/orpc";

type Employer = Awaited<
	ReturnType<AppRouterClient["bambi"]["moderation"]["listEmployers"]>
>[number];
type Filter = "all" | "none" | "pending" | "rejected" | "verified";
const PAGE_SIZE = 20;
const FILTERS = [
	{ label: "전체", value: "all" },
	{ label: "대기", value: "pending" },
	{ label: "승인", value: "verified" },
	{ label: "반려", value: "rejected" },
	{ label: "미제출", value: "none" },
] as const;
const LABELS: Record<string, string> = {
	changes_unsubmitted: "변경사항 미제출",
	none: "미제출",
	pending: "승인 대기",
	rejected: "반려",
	verified: "승인 완료",
};

const employerTone = (status: string): "danger" | "success" | "warning" => {
	if (status === "verified") {
		return "success";
	}
	if (status === "rejected") {
		return "danger";
	}
	return "warning";
};

function EmployerCard({
	employer,
	onChanged,
}: {
	employer: Employer;
	onChanged: () => Promise<void>;
}) {
	const [reason, setReason] = useState("");
	const viewDocument = useMutation(
		orpc.bambi.onboarding.createBusinessDocumentViewUrl.mutationOptions()
	);
	const documentUrl = async (documentId: string, download: boolean) => {
		const result = await viewDocument.mutateAsync({ documentId, download });
		const url = resolveWebUrl(result.url);
		if (!url) {
			throw new Error("서류를 열 수 있는 주소가 없습니다.");
		}
		return url;
	};
	const { toast } = useToast();
	const decide = useMutation(
		orpc.bambi.moderation.setEmployerVerificationStatus.mutationOptions()
	);
	const remove = useMutation(
		orpc.bambi.moderation.deleteBusinessDocument.mutationOptions()
	);
	const rejectReason = reason.trim();
	const approve = async () => {
		await decide.mutateAsync({
			organizationId: employer.organizationId,
			reason: "서류 확인 완료",
			status: "verified",
		});
		await onChanged();
		toast.show({ label: "업소를 승인했어요." });
	};
	const reject = async () => {
		await decide.mutateAsync({
			organizationId: employer.organizationId,
			reason: rejectReason,
			status: "rejected",
		});
		setReason("");
		await onChanged();
		toast.show({ label: "업소를 반려했어요." });
	};
	const deleteDocument = (id: string, name: string) =>
		Alert.alert(
			"이 서류를 삭제할까요?",
			"파일이 저장소에서 함께 제거되며 되돌릴 수 없어요. 업소 인증 상태는 바뀌지 않아요.",
			[
				{ style: "cancel", text: "취소" },
				{
					style: "destructive",
					text: "삭제",
					onPress: async () => {
						try {
							await remove.mutateAsync({ documentId: id });
							await onChanged();
							toast.show({ label: `${name} 서류를 삭제했어요.` });
						} catch (error) {
							toast.show({
								label:
									error instanceof Error
										? error.message
										: "서류를 삭제하지 못했어요.",
								variant: "danger",
							});
						}
					},
				},
			]
		);

	return (
		<Surface className="gap-3 rounded-lg p-4" variant="secondary">
			<View className="flex-row items-center justify-between gap-2">
				<Text className="flex-1 font-bold text-foreground text-lg">
					{employer.displayName}
				</Text>
				<Pill tone={employerTone(employer.verificationStatus)}>
					{LABELS[employer.verificationStatus] ?? "상태 확인 필요"}
				</Pill>
			</View>
			<Text className="text-muted text-sm">
				{employer.ownerEmail}
				{employer.businessRegistrationNumber
					? ` · 사업자 ${employer.businessRegistrationNumber}`
					: ""}
			</Text>
			<Text className="text-muted text-sm">
				대표자 {employer.representativeName ?? "미입력"} · 개업일자{" "}
				{employer.businessStartDate ?? "미입력"}
			</Text>
			<Pill tone={employer.biznumCheckedAt ? "success" : "warning"}>
				{employer.biznumCheckedAt ? "국세청 확인 완료" : "국세청 미확인"}
			</Pill>
			<View className="gap-2">
				<Text className="font-semibold text-foreground">
					사업자 인증 서류 {employer.businessDocuments.length}개
				</Text>
				{employer.businessDocuments.length === 0 ? (
					<Text className="text-muted text-sm">제출된 서류가 없습니다.</Text>
				) : (
					employer.businessDocuments.map((document) => (
						<Surface
							className="flex-row items-center gap-2 rounded-lg p-3"
							key={document.id}
						>
							<Button
								onPress={async () => {
									try {
										await openBrowserAsync(
											await documentUrl(document.id, false)
										);
									} catch (error) {
										toast.show({
											label:
												error instanceof Error
													? error.message
													: "서류를 열지 못했어요.",
											variant: "danger",
										});
									}
								}}
								size="sm"
								variant="tertiary"
							>
								<Button.Label>{document.fileName}</Button.Label>
							</Button>
							<Button
								onPress={async () => {
									const result = await saveManagedFile({
										url: await documentUrl(document.id, true).catch(
											(error: unknown): undefined => {
												toast.show({
													label:
														error instanceof Error
															? error.message
															: "서류 주소를 가져오지 못했어요.",
													variant: "danger",
												});
												return;
											}
										),
										fileName: document.fileName,
										mimeType: document.mimeType,
									});
									if (result.status === "saved") {
										toast.show({ label: "서류를 저장했어요." });
									}
									if (result.status === "failed") {
										toast.show({ label: result.message, variant: "danger" });
									}
								}}
								size="sm"
								variant="secondary"
							>
								<Button.Label>저장</Button.Label>
							</Button>
							<Text className="flex-1 text-muted text-xs">
								{document.category === "pdf" ? "PDF" : "이미지"}
							</Text>
							<Button
								isDisabled={remove.isPending}
								onPress={() => deleteDocument(document.id, document.fileName)}
								size="sm"
								variant="danger-soft"
							>
								<Button.Label>삭제</Button.Label>
							</Button>
						</Surface>
					))
				)}
			</View>
			{employer.verificationNote ? (
				<Text className="text-muted text-sm">
					반려 사유 · {employer.verificationNote}
				</Text>
			) : null}
			<TextField>
				<Input
					onChangeText={setReason}
					placeholder="반려 사유(2자 이상)"
					value={reason}
				/>
			</TextField>
			<View className="flex-row gap-2">
				<Button
					isDisabled={
						decide.isPending || employer.verificationStatus === "verified"
					}
					onPress={() =>
						approve().catch((error) =>
							toast.show({ label: error.message, variant: "danger" })
						)
					}
				>
					<Button.Label>승인</Button.Label>
				</Button>
				<Button
					isDisabled={decide.isPending || rejectReason.length < 2}
					onPress={() =>
						reject().catch((error) =>
							toast.show({ label: error.message, variant: "danger" })
						)
					}
					variant="danger"
				>
					<Button.Label>반려</Button.Label>
				</Button>
			</View>
		</Surface>
	);
}

export default function ModeratorEmployersScreen() {
	const [filter, setFilter] = useState<Filter>("pending");
	const [page, setPage] = useState(0);
	const client = useQueryClient();
	const query = useQuery(
		orpc.bambi.moderation.listEmployers.queryOptions({
			input: {
				limit: PAGE_SIZE,
				offset: page * PAGE_SIZE,
				status: filter === "all" ? undefined : filter,
			},
		})
	);
	const refresh = async () => {
		await client.invalidateQueries({
			queryKey: orpc.bambi.moderation.listEmployers.key(),
		});
	};
	const changeFilter = (next: Filter) => {
		setFilter(next);
		setPage(0);
	};
	return (
		<BambiScreen>
			<BambiHeader
				description="사업자 정보와 제출 서류를 검토하고 승인·반려합니다."
				title="업소 승인"
			/>
			<FilterChips onChange={changeFilter} options={FILTERS} value={filter} />
			{query.isError ? (
				<StateCard
					action={
						<Button onPress={() => query.refetch()} size="sm">
							<Button.Label>다시 시도</Button.Label>
						</Button>
					}
					description="네트워크 연결을 확인해 주세요."
					title="업소를 불러오지 못했어요"
				/>
			) : null}
			{query.isSuccess && query.data.length === 0 ? (
				<StateCard
					description="선택한 상태에 해당하는 업소가 없어요."
					title="표시할 업소가 없어요"
				/>
			) : null}
			{query.data?.map((employer) => (
				<EmployerCard
					employer={employer}
					key={employer.organizationId}
					onChanged={refresh}
				/>
			))}
			<View className="flex-row justify-between">
				<Button
					isDisabled={page === 0 || query.isFetching}
					onPress={() => setPage((value) => value - 1)}
					size="sm"
					variant="tertiary"
				>
					<Button.Label>이전</Button.Label>
				</Button>
				<Text className="text-muted text-sm">{page + 1} 페이지</Text>
				<Button
					isDisabled={(query.data?.length ?? 0) < PAGE_SIZE || query.isFetching}
					onPress={() => setPage((value) => value + 1)}
					size="sm"
					variant="tertiary"
				>
					<Button.Label>다음</Button.Label>
				</Button>
			</View>
		</BambiScreen>
	);
}
