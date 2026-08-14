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
import { revokeMediaItemPreview } from "@/lib/bambi/job-media-item";
import {
	emptyJobFormMedia,
	type JobFormMedia,
	type JobFormMediaItem,
	uploadFileToSignedUrl,
} from "@/lib/bambi-job-form";
import { orpc } from "@/utils/orpc";

// 저장 프로시저가 받는 상세 이미지 한 장. 직접 손으로 옮기면 optional(height·width)이
// 어긋나도 호출 직전까지 타입이 안 잡혀서 라우터 입력에서 그대로 끌어 쓴다.
type DesignMediaItem = Parameters<
	AppRouterClient["bambi"]["moderation"]["setJobPostDesignMedia"]
>[0]["detail"][number];

// 이미 저장된 상세 이미지 한 장(서버 조회분·방금 저장한 입력분 공통 모양).
interface SavedDesignMediaItem {
	altText?: null | string;
	byteSize: number;
	fileName: string;
	height?: null | number;
	mimeType: string;
	storageKey: string;
	width?: null | number;
}

// 저장된 상세 이미지 한 장을 폼 상태로. 미리보기는 공개 버킷 URL을 그대로 쓴다(운영자 공고
// 수정 화면과 동일 경로).
const toDesignFormItem = (item: SavedDesignMediaItem): JobFormMediaItem => ({
	altText: item.altText ?? "",
	byteSize: item.byteSize,
	fileName: item.fileName,
	height: item.height ?? undefined,
	mimeType: item.mimeType,
	previewUrl: jobMediaPublicUrl(item.storageKey),
	storageKey: item.storageKey,
	width: item.width ?? undefined,
});

/**
 * 서버 프리필을 화면 상태에 얹는다. **아직 저장하지 않은 선택(file)이 하나라도 있으면
 * 화면 상태를 그대로 둔다** — getJobPostForAdmin 응답에는 Date 컬럼이 있어 react-query의
 * structural sharing이 걸리지 않아 재조회(무효화·창 포커스 복귀)마다 새 참조가 오는데,
 * 그때마다 덮으면 운영자가 고른 파일이 경고 없이 사라진다(그 뒤 저장하면 서버 상태
 * 그대로가 저장되고 성공 토스트까지 뜬다).
 */
export const mergeDesignDetailPrefill = (
	current: JobFormMediaItem[],
	saved: SavedDesignMediaItem[]
): JobFormMediaItem[] =>
	current.some((item) => item.file) ? current : saved.map(toDesignFormItem);

// 운영자가 완성본 상세이미지를 올리고 제작 완료로 넘기는 창. 시안 교환은 스코프 밖이라
// 여기서는 "최종 결과물 등록 + 상태 토글"만 한다.
export function JobDetailDesignDialog({
	jobPostId,
	onOpenChange,
	open,
}: {
	jobPostId: string;
	onOpenChange: (open: boolean) => void;
	open: boolean;
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

	// 조회분으로 프리필한다. 재조회마다 새 참조가 오므로 병합 규칙(mergeDesignDetailPrefill)이
	// 미저장 선택을 지켜 준다 — 이전 상태는 setMedia 콜백으로 읽어 deps를 늘리지 않는다.
	const savedDetail = jobQuery.data?.media.detail;
	// 제작 상태의 단일 원천도 조회분이다. 목록 행에서 받아 오면 토글 뒤 목록이 갱신될 때까지
	// 버튼 문구가 옛 값으로 남는다. null = 미신청이거나 아직 로딩 중 → 토글을 막는다.
	const designStatus = jobQuery.data?.detailDesignStatus ?? null;

	useEffect(() => {
		if (!savedDetail) {
			return;
		}

		setMedia((prev) => ({
			...prev,
			detail: mergeDesignDetailPrefill(prev.detail, savedDetail),
		}));
	}, [savedDetail]);

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
			// 업로드가 끝난 blob 미리보기를 놓아주고, 방금 저장한 키로 화면 상태를 확정한다.
			// file이 남아 있으면 프리필 가드가 계속 걸려 서버 상태가 화면에 못 오고, 다음
			// 저장이 같은 파일을 또 올려 고아 객체가 쌓인다.
			for (const item of media.detail) {
				revokeMediaItemPreview(item);
			}
			setMedia((prev) => ({ ...prev, detail: detail.map(toDesignFormItem) }));
			await invalidate();
			toast.success(
				designStatus === "completed"
					? "상세 이미지를 저장했어요."
					: "상세 이미지를 저장했어요. 제작이 끝났으면 '제작 완료 처리'도 눌러 주세요."
			);
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
		if (!designStatus) {
			return;
		}

		setDesignStatus.mutate(
			{
				jobPostId,
				status: designStatus === "completed" ? "requested" : "completed",
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
			<DialogContent className="max-h-[90vh] w-[calc(100vw-2rem)] max-w-4xl overflow-y-auto">
				<div className="flex flex-col gap-4">
					<div className="flex flex-col gap-1">
						<DialogTitle className="text-base">디자인 제작 관리</DialogTitle>
						<DialogDescription>
							제작한 상세이미지를 최대 5장까지 등록하고, 완료되면 상태를 제작
							완료로 바꿔 주세요.
						</DialogDescription>
					</div>

					<JobDetailImageSlots media={media} onChange={setMedia} />

					{/* 프리필 전(로딩·실패)에는 저장·토글을 막는다 — 저장은 detail 전량 교체라
					    빈 목록으로 누르면 기존 상세이미지가 GCS에서 실제로 지워진다. */}
					{jobQuery.isSuccess ? null : (
						<p className="text-muted-foreground text-xs">
							{jobQuery.isError
								? "공고 정보를 불러오지 못해 저장할 수 없어요. 창을 닫고 다시 열어 주세요."
								: "공고 정보를 불러오는 중이에요. 잠시 후 저장할 수 있어요."}
						</p>
					)}

					<div className="flex flex-wrap items-center justify-end gap-2">
						<DialogClose render={<Button variant="ghost" />}>닫기</DialogClose>
						<Button
							disabled={!designStatus || setDesignStatus.isPending || isSaving}
							onClick={handleToggleStatus}
							variant="outline"
						>
							{designStatus === "completed"
								? "제작 대기로 되돌리기"
								: "제작 완료 처리"}
						</Button>
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
