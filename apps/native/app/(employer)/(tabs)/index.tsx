import type { AppRouterClient } from "@bambi-app/api/routers/index";
import { useMutation, useQuery } from "@tanstack/react-query";
import { type Href, Link, router } from "expo-router";
import { Button, Dialog, Surface } from "heroui-native";
import { useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";

import {
	BambiHeader,
	BambiScreen,
	ErrorState,
	formatPay,
	LoadingState,
	Pill,
	StateCard,
} from "@/src/components/bambi-screen";
import { verificationStatusLabels } from "@/src/lib/bambi-native";
import { getEmployerGateNotice } from "@/src/lib/employer/business";
import {
	countJobStatuses,
	type DeleteRefundPreview,
	getDeleteRefundDescription,
	getJobDisplayStatus,
	getJobStatusNote,
} from "@/src/lib/employer/job-status";
import { orpc, queryClient } from "@/src/lib/orpc";

const PLACEHOLDER_ID = "00000000-0000-0000-0000-000000000000";
const BUSINESS_HREF = "/(employer)/me/business" as Href;
const NEW_HREF = "/(employer)/new" as Href;

type EmployerJob = Awaited<
	ReturnType<AppRouterClient["bambi"]["jobs"]["listMine"]>
>[number];

function StatTile({ label, value }: { label: string; value: number }) {
	return (
		<View className="flex-1 gap-1">
			<Text className="text-muted text-xs">{label}</Text>
			<Text className="font-extrabold text-foreground text-lg" selectable>
				{value}
			</Text>
		</View>
	);
}

function JobCard({
	job,
	onDelete,
}: {
	job: EmployerJob;
	onDelete: (id: string) => void;
}) {
	const display = getJobDisplayStatus(job);
	const note = getJobStatusNote(job);

	return (
		<Surface className="gap-2 rounded-lg p-4" variant="secondary">
			<View className="flex-row flex-wrap items-center gap-2">
				<Pill tone={display.tone}>{display.label}</Pill>
				<Pill>{job.region}</Pill>
			</View>
			<Text className="font-bold text-foreground text-lg" selectable>
				{job.title}
			</Text>
			<Text className="text-muted text-sm" selectable>
				{job.industryCategory} · {formatPay(job.payAmount, job.payUnit)}
			</Text>
			{note ? (
				<Text className="text-muted text-xs" selectable>
					{note}
				</Text>
			) : null}
			<View className="flex-row gap-2 pt-1">
				<Button
					onPress={() =>
						router.push({
							params: { id: job.id },
							pathname: "/(employer)/jobs/[id]/edit",
						} as unknown as Href)
					}
					size="sm"
					variant="secondary"
				>
					<Button.Label>수정</Button.Label>
				</Button>
				<Button
					onPress={() => onDelete(job.id)}
					size="sm"
					variant="danger-soft"
				>
					<Button.Label>삭제</Button.Label>
				</Button>
			</View>
		</Surface>
	);
}

function DeleteJobDialog({
	isDeleting,
	isOpen,
	isRefundLoading,
	onCancel,
	onConfirm,
	preview,
	title,
}: {
	isDeleting: boolean;
	isOpen: boolean;
	isRefundLoading: boolean;
	onCancel: () => void;
	onConfirm: () => void;
	preview: DeleteRefundPreview | undefined;
	title: string;
}) {
	const description = isRefundLoading
		? "환급 정보를 확인하고 있어요."
		: getDeleteRefundDescription(preview);

	return (
		<Dialog
			isOpen={isOpen}
			onOpenChange={(open) => {
				if (!open) {
					onCancel();
				}
			}}
		>
			<Dialog.Portal>
				<Dialog.Overlay />
				<Dialog.Content>
					<Dialog.Title>{`“${title}” 공고를 삭제할까요?`}</Dialog.Title>
					<Dialog.Description>{description}</Dialog.Description>
					<View className="flex-row justify-end gap-2 pt-2">
						<Pressable
							className="rounded-lg border border-border bg-background px-4 py-2 active:opacity-75"
							onPress={onCancel}
						>
							<Text className="font-semibold text-foreground">취소</Text>
						</Pressable>
						<Button
							isDisabled={isDeleting || isRefundLoading}
							onPress={onConfirm}
							variant="danger"
						>
							<Button.Label>{isDeleting ? "삭제 중" : "삭제"}</Button.Label>
						</Button>
					</View>
				</Dialog.Content>
			</Dialog.Portal>
		</Dialog>
	);
}

export default function EmployerJobsScreen() {
	const mineQuery = useQuery(orpc.bambi.onboarding.getMine.queryOptions());
	const jobsQuery = useQuery(orpc.bambi.jobs.listMine.queryOptions());
	const [deletingId, setDeletingId] = useState<null | string>(null);

	const refundQuery = useQuery({
		...orpc.bambi.jobs.getDeletePointRefundPreview.queryOptions({
			input: { id: deletingId ?? PLACEHOLDER_ID },
		}),
		enabled: deletingId !== null,
	});
	const preview = refundQuery.data as DeleteRefundPreview | undefined;

	const deleteMutation = useMutation(
		orpc.bambi.jobs.delete.mutationOptions({
			onError: (error) => {
				Alert.alert(
					"삭제하지 못했어요",
					error.message ||
						"공고를 삭제하지 못했습니다. 삭제 권한을 확인한 뒤 다시 시도해 주세요."
				);
			},
			onSuccess: async () => {
				setDeletingId(null);
				await queryClient.invalidateQueries({
					queryKey: orpc.bambi.jobs.listMine.queryKey(),
				});
				Alert.alert("삭제했어요", "공고가 삭제되었습니다.");
			},
		})
	);

	if (mineQuery.isLoading || jobsQuery.isLoading) {
		return <LoadingState label="공고를 불러오고 있습니다." />;
	}

	if (mineQuery.isError || jobsQuery.isError) {
		return (
			<ErrorState
				onRetry={() => {
					mineQuery.refetch();
					jobsQuery.refetch();
				}}
			/>
		);
	}

	const organizationProfile = mineQuery.data?.employerOrganizationProfiles[0];
	const verificationStatus = organizationProfile?.verificationStatus ?? "none";
	const gate = getEmployerGateNotice(verificationStatus, "공고를 등록");
	const jobs = jobsQuery.data ?? [];
	const counts = countJobStatuses(jobs);
	const jobToDelete = jobs.find((job) => job.id === deletingId) ?? null;

	return (
		<BambiScreen>
			<BambiHeader
				action={
					<Link asChild href={NEW_HREF}>
						<Button size="sm">
							<Button.Label>공고 등록</Button.Label>
						</Button>
					</Link>
				}
				description="내 조직의 공고 상태를 확인하고 관리합니다."
				title="공고관리"
			/>

			{gate ? (
				<StateCard
					action={
						gate.actionLabel ? (
							<Link asChild href={BUSINESS_HREF}>
								<Button size="sm">
									<Button.Label>{gate.actionLabel}</Button.Label>
								</Button>
							</Link>
						) : undefined
					}
					description={gate.description}
					title={gate.title}
				/>
			) : null}

			{organizationProfile ? (
				<Surface
					className="flex-row items-center justify-between gap-2 rounded-lg p-4"
					variant="secondary"
				>
					<Text className="font-semibold text-foreground" selectable>
						{organizationProfile.displayName}
					</Text>
					<Pill
						tone={verificationStatus === "verified" ? "success" : "neutral"}
					>
						{verificationStatusLabels[
							verificationStatus as keyof typeof verificationStatusLabels
						] ?? verificationStatus}
					</Pill>
				</Surface>
			) : null}

			{jobs.length > 0 ? (
				<Surface className="flex-row gap-3 rounded-lg p-4" variant="secondary">
					<StatTile label="게시" value={counts.published} />
					<StatTile label="검수 대기" value={counts.pendingReview} />
					<StatTile label="반려" value={counts.rejected} />
				</Surface>
			) : null}

			{jobs.length === 0 ? (
				<StateCard
					action={
						<Link asChild href={NEW_HREF}>
							<Button>
								<Button.Label>새 공고 등록</Button.Label>
							</Button>
						</Link>
					}
					description="조직 프로필을 선택해 첫 공고를 등록해 보세요."
					title="등록한 공고가 없어요"
				/>
			) : (
				<View className="gap-3">
					{jobs.map((job) => (
						<JobCard job={job} key={job.id} onDelete={setDeletingId} />
					))}
				</View>
			)}

			<DeleteJobDialog
				isDeleting={deleteMutation.isPending}
				isOpen={deletingId !== null}
				isRefundLoading={refundQuery.isLoading}
				onCancel={() => setDeletingId(null)}
				onConfirm={() => {
					if (!deletingId) {
						return;
					}
					deleteMutation.mutate({
						expectedForfeitedAmount: preview?.forfeitedAmount ?? 0,
						expectedRefundAmount: preview?.refundAmount ?? 0,
						id: deletingId,
					});
				}}
				preview={preview}
				title={jobToDelete?.title ?? ""}
			/>
		</BambiScreen>
	);
}
