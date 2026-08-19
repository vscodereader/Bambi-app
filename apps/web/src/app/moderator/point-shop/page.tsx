"use client";

// 운영자 포인트몰 관리 — 판매 아이템 CRUD와 회원 주문 처리를 탭 하나에 모은다. 주문은
// 운영자가 손으로 이행하므로 상태는 처리 대기 → 지급 완료 | 취소·환불 한 방향뿐이고,
// 취소하면 서버(cancelOrder)가 차감했던 포인트를 원장에 되돌려 넣는다. 화면은 판정을 다시
// 들지 않고 서버가 준 status를 그대로 보여준다.

import type { AppRouterClient } from "@bambi-app/api/routers/index";
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
import { ImageOffIcon, XIcon } from "lucide-react";
import Image from "next/image";
import { useState } from "react";
import { toast } from "sonner";
import { type DataColumn, DataTable } from "@/components/bambi/data-table";
import { EmptyState } from "@/components/bambi/empty-state";
import { jobMediaPublicUrl } from "@/lib/bambi/api-job-mapper";
import { pointShopOrderStatusLabel } from "@/lib/bambi/point-shop-labels";
import { formatDateTime } from "@/lib/bambi-format";
import { uploadFileToSignedUrl } from "@/lib/bambi-job-form";
import { orpc } from "@/utils/orpc";

type ItemRow = Awaited<
	ReturnType<AppRouterClient["bambi"]["pointShop"]["adminListItems"]>
>[number];
type OrderRow = Awaited<
	ReturnType<AppRouterClient["bambi"]["pointShop"]["adminListOrders"]>
>[number];

// 서버(point-shop.ts itemInput)와 같은 한계 — 왕복 전에 막는다.
const NAME_MAX = 60;
const DESCRIPTION_MAX = 500;
const PRICE_MAX = 10_000_000;
const SORT_ORDER_MAX = 100_000;
const MEMO_MAX = 300;
// 이미지 정책은 수다방 인텐트가 쓰는 공고 규칙과 같은 값(JPG·PNG·WebP, 10MB).
const IMAGE_MAX_BYTES = 10 * 1024 * 1024;
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

const HANGUL_CHAR = /[가-힣]/;

// orpc 입력 검증 실패 메시지는 영어라 그대로 띄우면 안 된다. 서버가 명시적으로 던진 한국어
// 문구(한글 포함)만 살리고 나머지는 한국어 폴백으로 덮는다(등급 관리와 같은 관례).
function localizedShopError(
	message: string | undefined,
	fallback: string
): string {
	return message && HANGUL_CHAR.test(message) ? message : fallback;
}

const ORDER_STATUS_BADGE_VARIANT: Record<
	string,
	"secondary" | "success" | "warning"
> = {
	canceled: "secondary",
	completed: "success",
	pending: "warning",
};

// 전체는 필터 해제(입력에서 status 생략)를 뜻하는 화면 전용 값이고, 나머지는 DB 원값 그대로다.
const ORDER_FILTERS = ["pending", "completed", "canceled", "all"] as const;
type OrderFilter = (typeof ORDER_FILTERS)[number];

const orderFilterLabel = (filter: OrderFilter): string =>
	filter === "all" ? "전체" : pointShopOrderStatusLabel(filter);

function ItemThumbnail({ item }: { item: ItemRow }) {
	if (!item.imageUrl) {
		return (
			<div className="flex size-10 items-center justify-center rounded-md bg-muted text-muted-foreground">
				<ImageOffIcon className="size-4" />
			</div>
		);
	}

	return (
		<Image
			alt={item.name}
			className="size-10 rounded-md object-cover"
			height={40}
			src={item.imageUrl}
			unoptimized
			width={40}
		/>
	);
}

function getItemColumns({
	onDelete,
	onEdit,
}: {
	onDelete: (row: ItemRow) => void;
	onEdit: (row: ItemRow) => void;
}): DataColumn<ItemRow>[] {
	return [
		{
			id: "image",
			header: "이미지",
			headerClassName: "w-16",
			cell: (row) => <ItemThumbnail item={row} />,
		},
		{
			id: "name",
			header: "아이템",
			sortValue: (row) => row.name,
			cell: (row) => (
				<div className="flex flex-col gap-0.5">
					<span className="font-bold">{row.name}</span>
					{row.description ? (
						<span className="line-clamp-1 text-muted-foreground text-xs">
							{row.description}
						</span>
					) : null}
				</div>
			),
		},
		{
			id: "pricePoints",
			header: "가격",
			sortValue: (row) => row.pricePoints,
			cell: (row) => (
				<span className="tabular-nums">
					{row.pricePoints.toLocaleString("ko-KR")}P
				</span>
			),
		},
		{
			id: "isActive",
			header: "노출",
			cell: (row) => (
				<Badge variant={row.isActive ? "success" : "secondary"}>
					{row.isActive ? "노출" : "숨김"}
				</Badge>
			),
		},
		{
			id: "sortOrder",
			header: "정렬",
			sortValue: (row) => row.sortOrder,
			cell: (row) => (
				<span className="text-muted-foreground tabular-nums">
					{row.sortOrder}
				</span>
			),
		},
		{
			id: "actions",
			header: "관리",
			headerClassName: "text-right",
			cellClassName: "text-right",
			cell: (row) => (
				<div className="flex justify-end gap-2">
					<Button
						onClick={() => onEdit(row)}
						size="sm"
						type="button"
						variant="outline"
					>
						수정
					</Button>
					<Button
						onClick={() => onDelete(row)}
						size="sm"
						type="button"
						variant="destructive"
					>
						삭제
					</Button>
				</div>
			),
		},
	];
}

function getOrderColumns({
	onCancel,
	onComplete,
}: {
	onCancel: (row: OrderRow) => void;
	onComplete: (row: OrderRow) => void;
}): DataColumn<OrderRow>[] {
	return [
		{
			id: "createdAt",
			header: "주문일",
			sortValue: (row) => new Date(row.createdAt).getTime(),
			cell: (row) => (
				<div className="flex flex-col gap-0.5">
					<span className="whitespace-nowrap">
						{formatDateTime(row.createdAt)}
					</span>
					{row.processedAt ? (
						<span className="whitespace-nowrap text-muted-foreground text-xs">
							처리 {formatDateTime(row.processedAt)}
						</span>
					) : null}
				</div>
			),
		},
		{
			id: "buyer",
			header: "구매자",
			sortValue: (row) => row.buyerName ?? "",
			cell: (row) => (
				<div className="flex flex-col gap-0.5">
					<span className="font-bold">{row.buyerName ?? "탈퇴한 회원"}</span>
					<span className="text-muted-foreground text-xs">
						{row.buyerEmail ?? "—"}
					</span>
				</div>
			),
		},
		{
			id: "itemName",
			header: "아이템",
			sortValue: (row) => row.itemName,
			cell: (row) => row.itemName,
		},
		{
			id: "pricePoints",
			header: "차감 포인트",
			sortValue: (row) => row.pricePoints,
			cell: (row) => (
				<span className="tabular-nums">
					{row.pricePoints.toLocaleString("ko-KR")}P
				</span>
			),
		},
		{
			id: "status",
			header: "상태",
			cell: (row) => (
				<Badge variant={ORDER_STATUS_BADGE_VARIANT[row.status] ?? "outline"}>
					{pointShopOrderStatusLabel(row.status)}
				</Badge>
			),
		},
		{
			id: "operatorMemo",
			header: "메모",
			cell: (row) => (
				<span className="text-muted-foreground text-xs">
					{row.operatorMemo ?? "—"}
				</span>
			),
		},
		{
			id: "actions",
			header: "관리",
			headerClassName: "text-right",
			cellClassName: "text-right",
			cell: (row) => {
				if (row.status !== "pending") {
					return (
						<span className="text-muted-foreground text-xs">처리 완료</span>
					);
				}

				return (
					<div className="flex justify-end gap-2">
						<Button
							onClick={() => onComplete(row)}
							size="sm"
							type="button"
							variant="outline"
						>
							지급 완료
						</Button>
						<Button
							onClick={() => onCancel(row)}
							size="sm"
							type="button"
							variant="destructive"
						>
							취소·환불
						</Button>
					</div>
				);
			},
		},
	];
}

interface ItemFormValues {
	description: null | string;
	imageUrl: null | string;
	isActive: boolean;
	name: string;
	pricePoints: number;
	sortOrder: number;
}

// 추가·수정 공용 폼. 대상마다 새로 마운트돼(key) 초기값이 따라온다.
function ItemForm({
	isPending,
	item,
	onClose,
	onSubmit,
}: {
	isPending: boolean;
	item: ItemRow | null;
	onClose: () => void;
	onSubmit: (values: ItemFormValues) => void;
}) {
	const [name, setName] = useState(item?.name ?? "");
	const [description, setDescription] = useState(item?.description ?? "");
	const [pricePoints, setPricePoints] = useState(
		item ? String(item.pricePoints) : ""
	);
	const [sortOrder, setSortOrder] = useState(String(item?.sortOrder ?? 0));
	const [isActive, setIsActive] = useState(item?.isActive ?? true);
	const [imageUrl, setImageUrl] = useState<null | string>(
		item?.imageUrl ?? null
	);
	const [isUploading, setIsUploading] = useState(false);
	const createMediaUpload = useMutation(
		orpc.bambi.community.createMediaUpload.mutationOptions()
	);

	const parsedPrice = Number(pricePoints);
	const parsedSortOrder = Number(sortOrder);
	const canSubmit =
		name.trim().length > 0 &&
		Number.isInteger(parsedPrice) &&
		parsedPrice >= 1 &&
		parsedPrice <= PRICE_MAX &&
		Number.isInteger(parsedSortOrder) &&
		parsedSortOrder >= 0 &&
		parsedSortOrder <= SORT_ORDER_MAX &&
		!(isPending || isUploading);

	// 수다방 본문 이미지와 같은 절차: 클라 사전검증 → 업로드 인텐트 → 서명 URL PUT →
	// 공개 URL을 폼 값으로 든다. 저장 전에 취소해도 객체만 남고 참조는 생기지 않는다.
	const handleImageChange = async (
		event: React.ChangeEvent<HTMLInputElement>
	) => {
		const file = event.target.files?.[0];
		// 같은 파일을 다시 고를 때도 change가 뜨도록 값을 비운다(실패 후 재시도 경로).
		event.target.value = "";
		if (!file) {
			return;
		}
		if (!IMAGE_TYPES.has(file.type)) {
			toast.error("JPG, PNG, WebP 이미지만 등록할 수 있어요.");
			return;
		}
		if (file.size > IMAGE_MAX_BYTES) {
			toast.error("이미지는 10MB 이하만 등록할 수 있어요.");
			return;
		}

		setIsUploading(true);
		try {
			const intent = await createMediaUpload.mutateAsync({
				byteSize: file.size,
				fileName: file.name,
				mimeType: file.type,
			});
			await uploadFileToSignedUrl({ file, uploadIntent: intent });
			setImageUrl(jobMediaPublicUrl(intent.storageKey));
		} catch (error) {
			toast.error(
				localizedShopError(
					error instanceof Error ? error.message : undefined,
					"이미지를 올리지 못했어요."
				)
			);
		} finally {
			setIsUploading(false);
		}
	};

	return (
		<>
			<div className="flex flex-col gap-2">
				<DialogTitle>{item ? "아이템 수정" : "아이템 추가"}</DialogTitle>
				<DialogDescription>
					포인트몰 목록에 보이는 이름·가격·이미지를 정합니다.
				</DialogDescription>
			</div>
			<div className="flex flex-col gap-2">
				<Label htmlFor="point-shop-item-name">아이템명</Label>
				<Input
					id="point-shop-item-name"
					maxLength={NAME_MAX}
					onChange={(event) => setName(event.target.value)}
					placeholder="예: 스타벅스 아메리카노 기프티콘"
					value={name}
				/>
			</div>
			<div className="flex flex-col gap-2">
				<Label htmlFor="point-shop-item-description">설명</Label>
				<Textarea
					id="point-shop-item-description"
					maxLength={DESCRIPTION_MAX}
					onChange={(event) => setDescription(event.target.value)}
					placeholder="구매자에게 보여줄 안내를 적어 주세요."
					value={description}
				/>
			</div>
			<div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
				<div className="flex flex-col gap-2">
					<Label htmlFor="point-shop-item-price">가격(포인트)</Label>
					<Input
						id="point-shop-item-price"
						inputMode="numeric"
						max={PRICE_MAX}
						min={1}
						onChange={(event) => setPricePoints(event.target.value)}
						placeholder="예: 5000"
						type="number"
						value={pricePoints}
					/>
				</div>
				<div className="flex flex-col gap-2">
					<Label htmlFor="point-shop-item-sort">정렬값</Label>
					<Input
						id="point-shop-item-sort"
						inputMode="numeric"
						max={SORT_ORDER_MAX}
						min={0}
						onChange={(event) => setSortOrder(event.target.value)}
						type="number"
						value={sortOrder}
					/>
					<p className="m-0 text-muted-foreground text-xs">
						작을수록 목록 앞에 놓입니다.
					</p>
				</div>
			</div>
			<div className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2">
				<Label htmlFor="point-shop-item-active">포인트몰에 노출</Label>
				<Switch
					checked={isActive}
					id="point-shop-item-active"
					onCheckedChange={setIsActive}
				/>
			</div>
			<div className="flex flex-col gap-2">
				<Label htmlFor="point-shop-item-image">이미지</Label>
				{imageUrl ? (
					<div className="flex items-center gap-3">
						<Image
							alt="아이템 이미지 미리보기"
							className="size-20 rounded-lg object-cover"
							height={80}
							src={imageUrl}
							unoptimized
							width={80}
						/>
						<Button
							onClick={() => setImageUrl(null)}
							size="sm"
							type="button"
							variant="ghost"
						>
							<XIcon data-icon="inline-start" />
							이미지 제거
						</Button>
					</div>
				) : (
					<div className="flex min-h-16 items-center justify-center rounded-lg border border-border border-dashed bg-muted/30 p-3 text-muted-foreground text-xs">
						{isUploading ? "올리는 중" : "등록된 이미지 없음"}
					</div>
				)}
				<Input
					accept="image/jpeg,image/png,image/webp"
					disabled={isUploading}
					id="point-shop-item-image"
					onChange={handleImageChange}
					type="file"
				/>
				<p className="m-0 text-muted-foreground text-xs">
					JPG·PNG·WebP, 10MB 이하. 정사각형 이미지가 목록에서 가장 깔끔합니다.
				</p>
			</div>
			<div className="grid grid-cols-2 gap-2">
				<Button onClick={onClose} type="button" variant="outline">
					취소
				</Button>
				<Button
					disabled={!canSubmit}
					onClick={() =>
						onSubmit({
							description: description.trim() || null,
							imageUrl,
							isActive,
							name: name.trim(),
							pricePoints: parsedPrice,
							sortOrder: parsedSortOrder,
						})
					}
					type="button"
				>
					{isPending ? "저장 중" : "저장"}
				</Button>
			</div>
		</>
	);
}

function ItemsTab() {
	const queryClient = useQueryClient();
	// "new"는 빈 폼(추가), 행이면 그 아이템 수정.
	const [formTarget, setFormTarget] = useState<"new" | ItemRow | null>(null);
	const [deleting, setDeleting] = useState<ItemRow | null>(null);

	const listQuery = useQuery(
		orpc.bambi.pointShop.adminListItems.queryOptions()
	);

	const invalidate = async () => {
		await queryClient.invalidateQueries({
			queryKey: orpc.bambi.pointShop.key(),
		});
	};

	const createMutation = useMutation(
		orpc.bambi.pointShop.createItem.mutationOptions({
			onError: (error) =>
				toast.error(
					localizedShopError(error.message, "아이템을 추가하지 못했어요.")
				),
			onSuccess: async () => {
				toast.success("아이템을 추가했어요.");
				setFormTarget(null);
				await invalidate();
			},
		})
	);

	const updateMutation = useMutation(
		orpc.bambi.pointShop.updateItem.mutationOptions({
			onError: (error) =>
				toast.error(
					localizedShopError(error.message, "아이템을 수정하지 못했어요.")
				),
			onSuccess: async () => {
				toast.success("아이템을 수정했어요.");
				setFormTarget(null);
				await invalidate();
			},
		})
	);

	const removeMutation = useMutation(
		orpc.bambi.pointShop.removeItem.mutationOptions({
			onError: (error) =>
				toast.error(
					localizedShopError(error.message, "아이템을 삭제하지 못했어요.")
				),
			onSuccess: async () => {
				toast.success("아이템을 삭제했어요.");
				setDeleting(null);
				await invalidate();
			},
		})
	);

	const editingItem = formTarget === "new" ? null : formTarget;
	const columns = getItemColumns({
		onDelete: setDeleting,
		onEdit: setFormTarget,
	});

	return (
		<div className="flex flex-col gap-3">
			<div className="flex items-center justify-between gap-2">
				<p className="m-0 text-muted-foreground text-sm">
					숨김으로 두면 포인트몰 목록에서 사라지고 구매도 막힙니다.
				</p>
				<Button onClick={() => setFormTarget("new")} type="button">
					아이템 추가
				</Button>
			</div>

			{listQuery.isPending ? (
				<div className="flex flex-col gap-2">
					<Skeleton className="h-10 w-full" />
					<Skeleton className="h-10 w-full" />
					<Skeleton className="h-10 w-full" />
				</div>
			) : null}

			{listQuery.isError ? (
				<EmptyState
					description="목록을 불러오지 못했어요. 잠시 후 다시 시도해 주세요."
					title="불러오기 실패"
				/>
			) : null}

			{listQuery.isSuccess ? (
				<div className="overflow-x-auto rounded-xl border border-border">
					<DataTable
						columns={columns}
						data={listQuery.data}
						emptyMessage="등록된 아이템이 없어요."
						getRowKey={(row) => row.id}
					/>
				</div>
			) : null}

			<Dialog
				onOpenChange={(open) => {
					if (!open) {
						setFormTarget(null);
					}
				}}
				open={formTarget !== null}
			>
				<DialogContent>
					{formTarget ? (
						<ItemForm
							isPending={createMutation.isPending || updateMutation.isPending}
							item={editingItem}
							key={editingItem?.id ?? "new"}
							onClose={() => setFormTarget(null)}
							onSubmit={(values) => {
								if (editingItem) {
									updateMutation.mutate({ ...values, id: editingItem.id });
									return;
								}
								createMutation.mutate(values);
							}}
						/>
					) : null}
				</DialogContent>
			</Dialog>

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
							{deleting?.name} 아이템을 삭제할까요?
						</AlertDialogTitle>
						<AlertDialogDescription>
							되돌릴 수 없습니다. 이미 접수된 주문은 아이템명·차감 포인트를
							스냅샷으로 보존하므로 구매 내역과 환불 근거는 그대로 남습니다.
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
		</div>
	);
}

function OrdersTab() {
	const queryClient = useQueryClient();
	const [filter, setFilter] = useState<OrderFilter>("pending");
	const [completing, setCompleting] = useState<OrderRow | null>(null);
	const [canceling, setCanceling] = useState<OrderRow | null>(null);
	const [cancelMemo, setCancelMemo] = useState("");

	const listQuery = useQuery(
		orpc.bambi.pointShop.adminListOrders.queryOptions({
			input: filter === "all" ? {} : { status: filter },
		})
	);

	const invalidate = async () => {
		await queryClient.invalidateQueries({
			queryKey: orpc.bambi.pointShop.key(),
		});
	};

	const completeMutation = useMutation(
		orpc.bambi.pointShop.completeOrder.mutationOptions({
			onError: (error) =>
				toast.error(
					localizedShopError(error.message, "주문을 처리하지 못했어요.")
				),
			onSuccess: async () => {
				toast.success("지급 완료로 처리했어요.");
				setCompleting(null);
				await invalidate();
			},
		})
	);

	const cancelMutation = useMutation(
		orpc.bambi.pointShop.cancelOrder.mutationOptions({
			onError: (error) =>
				toast.error(
					localizedShopError(error.message, "주문을 취소하지 못했어요.")
				),
			onSuccess: async () => {
				toast.success("주문을 취소하고 포인트를 돌려줬어요.");
				setCanceling(null);
				setCancelMemo("");
				await invalidate();
			},
		})
	);

	const columns = getOrderColumns({
		onCancel: (row) => {
			setCancelMemo("");
			setCanceling(row);
		},
		onComplete: setCompleting,
	});

	return (
		<div className="flex flex-col gap-3">
			<ToggleGroup
				aria-label="주문 상태"
				className="max-w-full flex-wrap"
				onValueChange={(value) => {
					const next = value.at(-1);
					if (next) {
						setFilter(next as OrderFilter);
					}
				}}
				value={[filter]}
			>
				{ORDER_FILTERS.map((option) => (
					<ToggleGroupItem key={option} value={option}>
						{orderFilterLabel(option)}
					</ToggleGroupItem>
				))}
			</ToggleGroup>

			{listQuery.isPending ? (
				<div className="flex flex-col gap-2">
					<Skeleton className="h-10 w-full" />
					<Skeleton className="h-10 w-full" />
					<Skeleton className="h-10 w-full" />
				</div>
			) : null}

			{listQuery.isError ? (
				<EmptyState
					description="목록을 불러오지 못했어요. 잠시 후 다시 시도해 주세요."
					title="불러오기 실패"
				/>
			) : null}

			{listQuery.isSuccess ? (
				<div className="overflow-x-auto rounded-xl border border-border">
					<DataTable
						columns={columns}
						data={listQuery.data}
						emptyMessage="해당 상태의 주문이 없어요."
						getRowKey={(row) => row.id}
						pageSize={20}
					/>
				</div>
			) : null}

			<AlertDialog
				onOpenChange={(open) => {
					if (!open) {
						setCompleting(null);
					}
				}}
				open={completing !== null}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>지급 완료로 처리할까요?</AlertDialogTitle>
						<AlertDialogDescription>
							{completing?.buyerName ?? "회원"} 님의 {completing?.itemName}{" "}
							주문을 완료 처리합니다. 차감된 포인트는 그대로 두고 상태만 바뀌며,
							완료한 주문은 다시 취소할 수 없습니다.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>닫기</AlertDialogCancel>
						<AlertDialogAction
							disabled={completeMutation.isPending}
							onClick={() => {
								if (completing) {
									completeMutation.mutate({ orderId: completing.id });
								}
							}}
						>
							지급 완료
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>

			<AlertDialog
				onOpenChange={(open) => {
					if (!open) {
						setCanceling(null);
					}
				}}
				open={canceling !== null}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>주문을 취소하고 환불할까요?</AlertDialogTitle>
						<AlertDialogDescription>
							{canceling?.pricePoints.toLocaleString("ko-KR")}P를 구매자에게
							바로 돌려줍니다. 사유는 구매자의 포인트 구매 내역에 그대로
							보입니다.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<div className="flex flex-col gap-2">
						<Label htmlFor="point-shop-cancel-memo">취소 사유</Label>
						<Textarea
							id="point-shop-cancel-memo"
							maxLength={MEMO_MAX}
							onChange={(event) => setCancelMemo(event.target.value)}
							placeholder="예: 품절되어 취소 처리했어요."
							value={cancelMemo}
						/>
					</div>
					<AlertDialogFooter>
						<AlertDialogCancel>닫기</AlertDialogCancel>
						<AlertDialogAction
							disabled={cancelMutation.isPending}
							onClick={() => {
								if (canceling) {
									cancelMutation.mutate({
										memo: cancelMemo.trim() || undefined,
										orderId: canceling.id,
									});
								}
							}}
							variant="destructive"
						>
							취소·환불
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</div>
	);
}

export default function ModeratorPointShopPage() {
	return (
		<div className="mx-auto flex w-full flex-col gap-4 px-5 py-6 md:px-6">
			<div className="flex flex-col gap-1">
				<h1 className="m-0 font-extrabold text-2xl">포인트몰</h1>
				<p className="m-0 text-muted-foreground text-sm">
					회원이 적립 포인트로 살 수 있는 아이템을 관리하고, 접수된 주문을
					손으로 이행합니다. 구매 순간 포인트가 차감되므로 이행이 어려우면
					취소·환불로 돌려주세요. 포인트몰 구매·환불은 회원 등급 계산에 반영되지
					않습니다.
				</p>
			</div>

			<Tabs defaultValue="items">
				<TabsList className="max-w-full flex-wrap">
					<TabsTrigger value="items">아이템 관리</TabsTrigger>
					<TabsTrigger value="orders">주문 관리</TabsTrigger>
				</TabsList>
				<TabsContent value="items">
					<ItemsTab />
				</TabsContent>
				<TabsContent value="orders">
					<OrdersTab />
				</TabsContent>
			</Tabs>
		</div>
	);
}
