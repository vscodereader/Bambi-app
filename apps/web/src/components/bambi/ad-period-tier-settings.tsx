"use client";

// 운영자 누적 광고일수 등급 관리 — 공고 카드 "N회 N일" 배지의 등급 아이콘·구간을 코드
// 배포 없이 추가·수정·삭제한다. 등급이 하나도 없으면 화면이 기본 5등급 상수로 폴백한다.
// 광고 상품 관리 페이지 하단에 접이식 섹션(Accordion)으로 얹는다.

import type { AppRouterClient } from "@bambi-app/api/routers/index";
import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from "@bambi-app/ui/components/accordion";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@bambi-app/ui/components/alert-dialog";
import { Badge } from "@bambi-app/ui/components/badge";
import { Button } from "@bambi-app/ui/components/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogTitle,
} from "@bambi-app/ui/components/dialog";
import { Input } from "@bambi-app/ui/components/input";
import { Label } from "@bambi-app/ui/components/label";
import { Skeleton } from "@bambi-app/ui/components/skeleton";
import {
	ToggleGroup,
	ToggleGroupItem,
} from "@bambi-app/ui/components/toggle-group";
import { cn } from "@bambi-app/ui/lib/utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { AdPeriodTierIcon } from "@/components/bambi/ad-period-tier-icon";
import {
	AD_PERIOD_TIER_COLOR_PRESETS,
	AD_PERIOD_TIER_ICON_LABELS,
	type AdPeriodTier,
	formatAdPeriodTierRange,
} from "@/lib/bambi/ad-period";
import { jobMediaPublicUrl } from "@/lib/bambi/api-job-mapper";
import { uploadFileToSignedUrl } from "@/lib/bambi-job-form";
import { orpc } from "@/utils/orpc";

type TierRow = Awaited<
	ReturnType<AppRouterClient["bambi"]["adPeriodTiers"]["list"]>
>[number];
type TierIcon = AdPeriodTier["icon"];

const LABEL_MAX = 20;
const DAYS_MAX = 100_000;
const ICONS: TierIcon[] = ["medal", "crown"];
const HANGUL_CHAR = /[가-힣]/;

// 서버 정책(bambi-ad-period-tiers.ts)과 같은 값. 왕복 전에 여기서 먼저 걸러 준다.
// 공용 미디어 정책과 달리 GIF를 받는 자리다 — 운영자만 올릴 수 있어서 허용된다.
const ICON_MIME_TYPES = new Set([
	"image/gif",
	"image/jpeg",
	"image/png",
	"image/webp",
]);
const ICON_MAX_BYTES = 2 * 1024 * 1024;

// orpc 입력 검증 실패 메시지는 영어라 그대로 노출하면 안 된다. 서버가 던진 한국어 문구만
// 그대로 띄우고, 그 외(검증 실패·빈 메시지)는 한국어 폴백으로 덮는다(등급 관리와 동일 관례).
const localized = (message: string | undefined, fallback: string): string =>
	message && HANGUL_CHAR.test(message) ? message : fallback;

// null(상한 없음)은 빈칸으로 다룬다.
const toDaysInput = (value: null | number): string =>
	value == null ? "" : String(value);

interface TierFormValues {
	colorClass: string;
	icon: TierIcon;
	iconImageUrl: null | string;
	label: string;
	maxDays: null | number;
	minDays: number;
}

// 추가·수정 공용 폼. 내부 상태로 입력을 들고, 유효할 때만 onSubmit을 호출한다. 상한(최대
// 일수)은 비우면 null(상한 없음)로 보낸다. onCancel이 있으면 수정 다이얼로그용 취소 버튼을 낸다.
function AdPeriodTierForm({
	idPrefix,
	initial,
	isPending,
	onCancel,
	onSubmit,
	submitLabel,
}: {
	idPrefix: string;
	initial?: TierRow;
	isPending: boolean;
	onCancel?: () => void;
	onSubmit: (values: TierFormValues) => void;
	submitLabel: string;
}) {
	const [label, setLabel] = useState(initial?.label ?? "");
	const [icon, setIcon] = useState<TierIcon>(initial?.icon ?? "medal");
	const [colorClass, setColorClass] = useState(
		initial?.colorClass ?? AD_PERIOD_TIER_COLOR_PRESETS[0].className
	);
	const [minDays, setMinDays] = useState(
		initial ? String(initial.minDays) : ""
	);
	const [maxDays, setMaxDays] = useState(toDaysInput(initial?.maxDays ?? null));
	const [iconImageUrl, setIconImageUrl] = useState<null | string>(
		initial?.iconImageUrl ?? null
	);
	const [isUploading, setIsUploading] = useState(false);
	const createIconUpload = useMutation(
		orpc.bambi.adPeriodTiers.createIconUpload.mutationOptions()
	);

	// 포인트몰 아이템 이미지와 같은 절차: 클라 사전검증 → 업로드 인텐트 → 서명 URL PUT →
	// 공개 URL을 폼 값으로 든다. 저장하지 않고 닫으면 객체만 남고 참조는 생기지 않는다.
	const handleIconFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
		const file = event.target.files?.[0];
		// 같은 파일을 다시 고를 때도 change가 뜨도록 값을 비운다(실패 후 재시도 경로).
		event.target.value = "";
		if (!file) {
			return;
		}
		if (!ICON_MIME_TYPES.has(file.type)) {
			toast.error("GIF, PNG, WebP, JPG 이미지만 올릴 수 있어요.");
			return;
		}
		if (file.size > ICON_MAX_BYTES) {
			toast.error("아이콘은 2MB 이하만 올릴 수 있어요.");
			return;
		}

		setIsUploading(true);
		try {
			const intent = await createIconUpload.mutateAsync({
				byteSize: file.size,
				fileName: file.name,
				mimeType: file.type,
			});
			await uploadFileToSignedUrl({ file, uploadIntent: intent });
			setIconImageUrl(jobMediaPublicUrl(intent.storageKey));
		} catch (error) {
			toast.error(
				localized(
					error instanceof Error ? error.message : undefined,
					"아이콘을 올리지 못했어요."
				)
			);
		} finally {
			setIsUploading(false);
		}
	};

	const parsedMin = Number(minDays);
	const trimmedMax = maxDays.trim();
	const parsedMax = Number(trimmedMax);
	const maxIsValid =
		trimmedMax === "" ||
		(Number.isInteger(parsedMax) && parsedMax >= 0 && parsedMax <= DAYS_MAX);
	// 상한이 있으면 최소 ≤ 최대여야 한다(서버 refine과 같은 판정을 왕복 전에 막는다).
	const rangeIsValid =
		trimmedMax === "" || (maxIsValid && parsedMin <= parsedMax);
	const canSubmit =
		label.trim().length > 0 &&
		Number.isInteger(parsedMin) &&
		parsedMin >= 0 &&
		parsedMin <= DAYS_MAX &&
		maxIsValid &&
		rangeIsValid &&
		!(isPending || isUploading);

	const submit = () =>
		onSubmit({
			colorClass,
			icon,
			iconImageUrl,
			label: label.trim(),
			maxDays: trimmedMax === "" ? null : parsedMax,
			minDays: parsedMin,
		});

	return (
		<div className="flex flex-col gap-3">
			<div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
				<div className="flex flex-col gap-1.5">
					<Label htmlFor={`${idPrefix}-label`}>등급명</Label>
					<Input
						className="sm:w-40"
						id={`${idPrefix}-label`}
						maxLength={LABEL_MAX}
						onChange={(event) => setLabel(event.target.value)}
						placeholder="예: 브론즈"
						value={label}
					/>
				</div>
				<div className="flex flex-col gap-1.5">
					<Label htmlFor={`${idPrefix}-min`}>최소 누적일수</Label>
					<Input
						className="sm:w-36"
						id={`${idPrefix}-min`}
						inputMode="numeric"
						max={DAYS_MAX}
						min={0}
						onChange={(event) => setMinDays(event.target.value)}
						placeholder="예: 0"
						type="number"
						value={minDays}
					/>
				</div>
				<div className="flex flex-col gap-1.5">
					<Label htmlFor={`${idPrefix}-max`}>최대 누적일수</Label>
					<Input
						className="sm:w-36"
						id={`${idPrefix}-max`}
						inputMode="numeric"
						max={DAYS_MAX}
						min={0}
						onChange={(event) => setMaxDays(event.target.value)}
						placeholder="비우면 상한 없음"
						type="number"
						value={maxDays}
					/>
				</div>
			</div>
			<div className="flex flex-col gap-1.5">
				<Label>아이콘</Label>
				<ToggleGroup
					aria-label="등급 아이콘"
					onValueChange={(value) => {
						const next = value.at(-1);
						if (next === "medal" || next === "crown") {
							setIcon(next);
						}
					}}
					value={[icon]}
				>
					{ICONS.map((option) => (
						<ToggleGroupItem key={option} value={option}>
							<AdPeriodTierIcon icon={option} />
							{AD_PERIOD_TIER_ICON_LABELS[option]}
						</ToggleGroupItem>
					))}
				</ToggleGroup>
			</div>
			<div className="flex flex-col gap-1.5">
				<Label htmlFor={`${idPrefix}-icon-image`}>아이콘 이미지</Label>
				<p className="m-0 text-muted-foreground text-xs">
					GIF·PNG·WebP·JPG 2MB 이하. 올리면 위 프리셋 대신 이 이미지가 배지에
					표시됩니다. 배지에서 16px로 작게 그려지니 단순한 그림이 잘 보입니다.
					그림 주변 투명 여백이 위아래로 비대칭이면 배지에서 아이콘이 치우쳐
					보이니, 여백을 딱 맞게 자르거나 상하 대칭으로 맞춰 올려 주세요.
				</p>
				{iconImageUrl ? (
					<div className="flex items-center gap-3">
						{/* 실제 배지 크기(16px)와 확대본을 함께 보여 준다 — 작게 줄였을 때
						    알아볼 수 있는지가 이 자리에서 유일하게 중요한 판단이다. */}
						<span className="flex items-center gap-2 rounded-md border border-border px-3 py-2">
							<AdPeriodTierIcon icon={icon} iconImageUrl={iconImageUrl} />
							<AdPeriodTierIcon
								className="size-10"
								icon={icon}
								iconImageUrl={iconImageUrl}
							/>
						</span>
						<Button
							onClick={() => setIconImageUrl(null)}
							size="sm"
							type="button"
							variant="outline"
						>
							이미지 제거
						</Button>
					</div>
				) : null}
				<Input
					accept="image/gif,image/png,image/webp,image/jpeg"
					disabled={isUploading}
					id={`${idPrefix}-icon-image`}
					onChange={handleIconFile}
					type="file"
				/>
				{isUploading ? (
					<span className="text-muted-foreground text-xs">올리는 중…</span>
				) : null}
			</div>
			<div className="flex flex-col gap-1.5">
				<Label>아이콘 색</Label>
				<ToggleGroup
					aria-label="아이콘 색"
					className="max-w-full flex-wrap"
					onValueChange={(value) => {
						const next = value.at(-1);
						if (next) {
							setColorClass(next);
						}
					}}
					value={[colorClass]}
				>
					{AD_PERIOD_TIER_COLOR_PRESETS.map((preset) => (
						<ToggleGroupItem
							aria-label={preset.label}
							key={preset.className}
							value={preset.className}
						>
							{/* 이미지 아이콘을 써도 색은 배지 글자에 그대로 적용되므로, 색 견본은
							    이미지 대신 항상 프리셋 글리프로 그려 색이 잘 보이게 한다. */}
							<AdPeriodTierIcon className={preset.className} icon={icon} />
							{preset.label}
						</ToggleGroupItem>
					))}
				</ToggleGroup>
			</div>
			<div className={cn(onCancel ? "grid grid-cols-2 gap-2" : "flex")}>
				{onCancel ? (
					<Button onClick={onCancel} type="button" variant="outline">
						취소
					</Button>
				) : null}
				<Button
					disabled={!canSubmit}
					onClick={submit}
					type="button"
					variant="default"
				>
					{isPending ? "저장 중" : submitLabel}
				</Button>
			</div>
		</div>
	);
}

export function AdPeriodTierSettings() {
	const queryClient = useQueryClient();
	const [editing, setEditing] = useState<TierRow | null>(null);
	const [deleting, setDeleting] = useState<TierRow | null>(null);
	// 추가 성공 후 인라인 폼을 초기화하려면 리마운트해야 한다(폼이 내부 상태를 소유).
	const [createFormKey, setCreateFormKey] = useState(0);

	const listQuery = useQuery(orpc.bambi.adPeriodTiers.list.queryOptions());
	const invalidate = () =>
		queryClient.invalidateQueries({
			queryKey: orpc.bambi.adPeriodTiers.key(),
		});

	const createMutation = useMutation(
		orpc.bambi.adPeriodTiers.create.mutationOptions({
			onError: (error) =>
				toast.error(localized(error.message, "등급을 추가하지 못했어요.")),
			onSuccess: async () => {
				toast.success("등급을 추가했어요.");
				setCreateFormKey((key) => key + 1);
				await invalidate();
			},
		})
	);
	const updateMutation = useMutation(
		orpc.bambi.adPeriodTiers.update.mutationOptions({
			onError: (error) =>
				toast.error(localized(error.message, "등급을 수정하지 못했어요.")),
			onSuccess: async () => {
				toast.success("등급을 수정했어요.");
				setEditing(null);
				await invalidate();
			},
		})
	);
	const removeMutation = useMutation(
		orpc.bambi.adPeriodTiers.remove.mutationOptions({
			onError: (error) =>
				toast.error(localized(error.message, "등급을 삭제하지 못했어요.")),
			onSuccess: async () => {
				toast.success("등급을 삭제했어요.");
				setDeleting(null);
				await invalidate();
			},
		})
	);

	const tiers = listQuery.data ?? [];

	return (
		<Accordion>
			<AccordionItem
				className="rounded-lg border border-border px-4"
				value="ad-period-tiers"
			>
				<AccordionTrigger className="font-bold text-base">
					누적 광고일수 등급
				</AccordionTrigger>
				<AccordionContent className="flex flex-col gap-4">
					<p className="m-0 text-muted-foreground text-sm">
						공고 카드의 “N회 N일” 배지가 누적 광고일수에 따라 다는 등급
						아이콘·구간을 정합니다. 등급이 하나도 없으면 기본
						5등급(브론즈~다이아)으로 표시됩니다. 최대 누적일수를 비우면 상한
						없는 최상위 등급입니다.
					</p>

					<div className="flex flex-col gap-2 rounded-lg border border-border p-4">
						<span className="font-medium text-sm">등급 추가</span>
						<AdPeriodTierForm
							idPrefix="ad-period-tier-new"
							isPending={createMutation.isPending}
							key={createFormKey}
							onSubmit={(values) => createMutation.mutate(values)}
							submitLabel="등급 추가"
						/>
					</div>

					{listQuery.isPending ? (
						<div className="flex flex-col gap-2">
							<Skeleton className="h-12 w-full" />
							<Skeleton className="h-12 w-full" />
						</div>
					) : null}

					{listQuery.isError ? (
						<p className="m-0 text-muted-foreground text-sm">
							등급을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.
						</p>
					) : null}

					{listQuery.isSuccess && tiers.length === 0 ? (
						<p className="m-0 text-muted-foreground text-sm">
							등록된 등급이 없어요. 기본 5등급으로 표시됩니다.
						</p>
					) : null}

					{tiers.length > 0 ? (
						<ul className="m-0 flex flex-col gap-2 p-0">
							{tiers.map((tier) => (
								<li
									className="flex flex-wrap items-center gap-3 rounded-lg border border-border p-3"
									key={tier.id}
								>
									<span className="font-bold">{tier.label}</span>
									{/* 카드 배지와 동일하게 아이콘 색을 입혀 결과를 미리 본다. */}
									<Badge
										className={cn("gap-1", tier.colorClass)}
										variant="outline"
									>
										<AdPeriodTierIcon
											icon={tier.icon}
											iconImageUrl={tier.iconImageUrl}
										/>
										{formatAdPeriodTierRange(tier)}
									</Badge>
									<div className="ml-auto flex gap-2">
										<Button
											onClick={() => setEditing(tier)}
											size="sm"
											type="button"
											variant="outline"
										>
											수정
										</Button>
										<Button
											onClick={() => setDeleting(tier)}
											size="sm"
											type="button"
											variant="destructive"
										>
											삭제
										</Button>
									</div>
								</li>
							))}
						</ul>
					) : null}
				</AccordionContent>
			</AccordionItem>

			{/* 수정 폼은 목록 밖에 하나만 두고 대상만 갈아끼운다(등급 관리와 같은 관례). */}
			<Dialog
				onOpenChange={(open) => {
					if (!open) {
						setEditing(null);
					}
				}}
				open={editing !== null}
			>
				<DialogContent>
					<div className="flex flex-col gap-2">
						<DialogTitle>등급 수정</DialogTitle>
						<DialogDescription>
							등급명·구간·아이콘·색을 바꿉니다.
						</DialogDescription>
					</div>
					{editing ? (
						<AdPeriodTierForm
							idPrefix="ad-period-tier-edit"
							initial={editing}
							isPending={updateMutation.isPending}
							key={editing.id}
							onCancel={() => setEditing(null)}
							onSubmit={(values) =>
								updateMutation.mutate({ ...values, id: editing.id })
							}
							submitLabel="저장"
						/>
					) : null}
				</DialogContent>
			</Dialog>

			{/* 삭제는 되돌릴 수 없어 확인 단계를 한 번 둔다. */}
			<AlertDialog
				onOpenChange={(open) => {
					if (!open) {
						setDeleting(null);
					}
				}}
				open={deleting !== null}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>
							{deleting?.label} 등급을 삭제할까요?
						</AlertDialogTitle>
						<AlertDialogDescription>
							되돌릴 수 없습니다. 등급이 모두 없어지면 카드 배지는 기본
							5등급으로 표시됩니다.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>취소</AlertDialogCancel>
						<AlertDialogAction
							disabled={removeMutation.isPending}
							onClick={() => {
								if (deleting) {
									removeMutation.mutate({ id: deleting.id });
								}
							}}
							variant="destructive"
						>
							삭제
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</Accordion>
	);
}
