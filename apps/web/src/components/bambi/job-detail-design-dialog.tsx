"use client";

import type { AppRouterClient } from "@bambi-app/api/routers/index";
import { Button } from "@bambi-app/ui/components/button";
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogTitle,
} from "@bambi-app/ui/components/dialog";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { JobDetailImageSlots } from "@/components/bambi/job-post-media-uploader";
import { jobMediaPublicUrl } from "@/lib/bambi/api-job-mapper";
import type { JobDetailDesignStatusKey } from "@/lib/bambi/exposure";
import {
	emptyJobFormMedia,
	type JobFormMedia,
	uploadFileToSignedUrl,
} from "@/lib/bambi-job-form";
import { orpc } from "@/utils/orpc";

// 저장 프로시저가 받는 상세 이미지 한 장. 직접 손으로 옮기면 optional(height·width)이
// 어긋나도 호출 직전까지 타입이 안 잡혀서 라우터 입력에서 그대로 끌어 쓴다.
type DesignMediaItem = Parameters<
	AppRouterClient["bambi"]["moderation"]["setJobPostDesignMedia"]
>[0]["detail"][number];

// 운영자가 완성본 상세이미지를 올리고 제작 완료로 넘기는 창. 시안 교환은 스코프 밖이라
// 여기서는 "최종 결과물 등록 + 상태 토글"만 한다.
export function JobDetailDesignDialog({
	jobPostId,
	onOpenChange,
	open,
	status,
}: {
	jobPostId: string;
	onOpenChange: (open: boolean) => void;
	open: boolean;
	status: JobDetailDesignStatusKey;
}) {
	const queryClient = useQueryClient();
	const [media, setMedia] = useState<JobFormMedia>(emptyJobFormMedia);
	const [isSaving, setIsSaving] = useState(false);
	const jobQuery = useQuery({
		...orpc.bambi.moderation.getJobPostForAdmin.queryOptions({
			input: { jobPostId },
		}),
		enabled: open,
	});
	const createUpload = useMutation(
		orpc.bambi.moderation.createJobPostDesignMediaUpload.mutationOptions()
	);
	const setDesignMedia = useMutation(
		orpc.bambi.moderation.setJobPostDesignMedia.mutationOptions()
	);
	const setDesignStatus = useMutation(
		orpc.bambi.moderation.setJobPostDesignStatus.mutationOptions()
	);

	// 저장된 이미지는 공개 버킷 URL로 미리보기를 만든다(운영자 공고 수정 화면과 동일 경로).
	useEffect(() => {
		if (!jobQuery.data) {
			return;
		}

		setMedia({
			...emptyJobFormMedia,
			detail: jobQuery.data.media.detail.map((item) => ({
				altText: item.altText,
				byteSize: item.byteSize,
				fileName: item.fileName,
				height: item.height ?? undefined,
				mimeType: item.mimeType,
				previewUrl: jobMediaPublicUrl(item.storageKey),
				storageKey: item.storageKey,
				width: item.width ?? undefined,
			})),
		});
	}, [jobQuery.data]);

	const invalidate = async () => {
		await Promise.all([
			queryClient.invalidateQueries({
				queryKey: orpc.bambi.moderation.listJobsForPayment.key(),
			}),
			queryClient.invalidateQueries({
				queryKey: orpc.bambi.moderation.getJobPostForAdmin.queryKey({
					input: { jobPostId },
				}),
			}),
		]);
	};

	const handleSave = async () => {
		setIsSaving(true);

		try {
			const detail: DesignMediaItem[] = [];

			for (const item of media.detail) {
				// 이미 저장된 이미지는 키를 그대로 재사용한다(다시 올리면 고아 객체가 쌓인다).
				if (item.storageKey) {
					detail.push({
						altText: item.altText,
						byteSize: item.byteSize,
						fileName: item.fileName,
						height: item.height,
						mimeType: item.mimeType,
						storageKey: item.storageKey,
						width: item.width,
					});
					continue;
				}

				if (!item.file) {
					throw new Error("이미지 파일을 다시 선택해 주세요.");
				}

				const uploadIntent = await createUpload.mutateAsync({
					byteSize: item.file.size,
					fileName: item.file.name,
					jobPostId,
					mimeType: item.file.type,
				});

				await uploadFileToSignedUrl({ file: item.file, uploadIntent });

				detail.push({
					altText: item.altText,
					byteSize: uploadIntent.byteSize,
					fileName: uploadIntent.fileName,
					height: item.height,
					mimeType: uploadIntent.mimeType,
					storageKey: uploadIntent.storageKey,
					width: item.width,
				});
			}

			await setDesignMedia.mutateAsync({ detail, jobPostId });
			await invalidate();
			toast.success("상세 이미지를 저장했어요.");
		} catch (error) {
			toast.error(
				error instanceof Error
					? error.message
					: "상세 이미지를 저장하지 못했어요."
			);
		} finally {
			setIsSaving(false);
		}
	};

	const handleToggleStatus = () => {
		setDesignStatus.mutate(
			{
				jobPostId,
				status: status === "completed" ? "requested" : "completed",
			},
			{
				onError: (error) => toast.error(error.message),
				onSuccess: async () => {
					await invalidate();
					toast.success("제작 상태를 변경했어요.");
				},
			}
		);
	};

	return (
		<Dialog onOpenChange={onOpenChange} open={open}>
			<DialogContent className="max-h-[85vh] w-auto max-w-[92vw] md:max-w-2xl">
				<div className="flex flex-col gap-4">
					<div className="flex flex-col gap-1">
						<DialogTitle className="text-base">디자인 제작 관리</DialogTitle>
						<DialogDescription>
							제작한 상세이미지를 최대 5장까지 등록하고, 완료되면 상태를 제작
							완료로 바꿔 주세요.
						</DialogDescription>
					</div>

					<JobDetailImageSlots media={media} onChange={setMedia} />

					<div className="flex flex-wrap items-center justify-end gap-2">
						<DialogClose render={<Button variant="ghost" />}>닫기</DialogClose>
						<Button
							disabled={setDesignStatus.isPending || isSaving}
							onClick={handleToggleStatus}
							variant="outline"
						>
							{status === "completed"
								? "제작 대기로 되돌리기"
								: "제작 완료 처리"}
						</Button>
						{/* 프리필 전(로딩·실패)에는 저장을 막는다 — 저장은 detail 전량 교체라
						    빈 목록으로 누르면 기존 상세이미지가 GCS에서 실제로 지워진다. */}
						<Button
							disabled={isSaving || !jobQuery.isSuccess}
							onClick={handleSave}
						>
							상세 이미지 저장
						</Button>
					</div>
				</div>
			</DialogContent>
		</Dialog>
	);
}
