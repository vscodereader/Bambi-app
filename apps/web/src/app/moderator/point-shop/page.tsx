"use client";

// 운영자 포인트몰 관리 — 판매 아이템 CRUD와 회원 주문 처리를 탭 하나에 모은다. 주문은
// 운영자가 손으로 이행하므로 상태는 처리 대기 → 지급 완료 | 취소·환불 한 방향뿐이고,
// 취소하면 서버(cancelOrder)가 차감했던 포인트를 원장에 되돌려 넣는다. 화면은 판정을 다시
// 들지 않고 서버가 준 status를 그대로 보여준다.

import type { AppRouterClient } from "@bambi-app/api/routers/index";
import { POINT_SHOP_BENEFIT_TYPES } from "@bambi-app/api/services/bambi-point-shop";
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
import { Checkbox } from "@bambi-app/ui/components/checkbox";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogTitle,
} from "@bambi-app/ui/components/dialog";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@bambi-app/ui/components/dropdown-menu";
import { Input } from "@bambi-app/ui/components/input";
import { Label } from "@bambi-app/ui/components/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@bambi-app/ui/components/select";
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
import { ImageOffIcon, MoreHorizontalIcon, XIcon } from "lucide-react";
import Image from "next/image";
import { useState } from "react";
import { toast } from "sonner";
import { type DataColumn, DataTable } from "@/components/bambi/data-table";
import { EmptyState } from "@/components/bambi/empty-state";
import { CatalogSettings } from "@/components/bambi/point-shop/catalog-settings";
import { PointShopProductImage } from "@/components/bambi/point-shop/product-image";
import { jobMediaPublicUrl } from "@/lib/bambi/api-job-mapper";
import {
	pointShopAudienceLabel,
	pointShopBenefitTypeLabel,
	pointShopOrderStatusLabel,
} from "@/lib/bambi/point-shop-labels";
import { formatDateTime } from "@/lib/bambi-format";
import { uploadFileToSignedUrl } from "@/lib/bambi-job-form";
import { orpc } from "@/utils/orpc";

type ItemRow = Awaited<
	ReturnType<AppRouterClient["bambi"]["pointShop"]["adminListItems"]>
>[number];
type OrderRow = Awaited<
	ReturnType<AppRouterClient["bambi"]["pointShop"]["adminListOrders"]>
>[number];
type ProductTypeRow = Awaited<
	ReturnType<AppRouterClient["bambi"]["pointShop"]["adminListProductTypes"]>
>[number];

// 혜택 유형·구매 대상 값은 서버 응답에서 좁혀온다(enum 원값은 라벨 맵으로만 화면에 낸다).
type BenefitType = ItemRow["benefitType"];
type Audience = ItemRow["audience"];
const AUDIENCE_OPTIONS: Audience[] = ["all", "employer", "job_seeker"];

const USABLE_BENEFIT_TYPES = new Set<BenefitType>([
	"boost_manual_period",
	"boost_manual_count",
	"boost_auto_period",
	"ad_extend",
]);

// 사이드바 폼 Select은 입력과 높이를 맞춘다(team-form 관례).
const SELECT_TRIGGER_CLASSNAME = "w-full text-sm data-[size=default]:h-9";

// 빈 문자열은 미설정(null), 그 외엔 1 이상 정수만 유효값으로 든다.
const parseOptionalCount = (value: string): null | number => {
	const trimmed = value.trim();
	if (trimmed === "") {
		return null;
	}
	const parsed = Number(trimmed);
	return Number.isInteger(parsed) && parsed >= 1 ? parsed : null;
};

const isBlankOrPositiveInt = (value: string): boolean => {
	const trimmed = value.trim();
	if (trimmed === "") {
		return true;
	}
	const parsed = Number(trimmed);
	return Number.isInteger(parsed) && parsed >= 1;
};

const isPositiveInt = (value: string): boolean =>
	value.trim() !== "" && isBlankOrPositiveInt(value);

// 혜택 관련 폼 상태는 문자열 초안으로 모아 둔다(입력 원문 유지 → 제출 시 정수/ null로 변환).
interface BenefitDraft {
	audience: Audience;
	benefitType: BenefitType;
	boostCount: string;
	boostsPerDay: string;
	durationDays: string;
	extendDays: string;
	stockQuantity: string;
	unlimitedStock: boolean;
	usageLimitDays: string;
}

const numberDraft = (value: null | number): string =>
	value == null ? "" : String(value);

const initialBenefitDraft = (item: ItemRow | null): BenefitDraft => ({
	audience: item?.audience ?? "all",
	benefitType: item?.benefitType ?? "none",
	boostCount: numberDraft(item?.boostCount ?? null),
	boostsPerDay: numberDraft(item?.boostsPerDay ?? null),
	durationDays: numberDraft(item?.durationDays ?? null),
	extendDays: numberDraft(item?.extendDays ?? null),
	stockQuantity: item?.stockQuantity == null ? "" : String(item.stockQuantity),
	unlimitedStock: item !== null && item.stockQuantity === null,
	usageLimitDays: numberDraft(item?.usageLimitDays ?? null),
});

const isPeriodBenefitType = (benefitType: BenefitType): boolean =>
	benefitType === "boost_manual_period" || benefitType === "boost_auto_period";

// 유형별 필수 스펙이 채워졌는지 + 구직 단독 대상 금지(서버 validateItemBenefitSpec와 같은 규칙).
const isBenefitDraftValid = (draft: BenefitDraft): boolean => {
	const isPeriod = isPeriodBenefitType(draft.benefitType);
	const isUsable = USABLE_BENEFIT_TYPES.has(draft.benefitType);
	if (isUsable && draft.audience === "job_seeker") {
		return false;
	}
	if (
		isPeriod &&
		!(isPositiveInt(draft.boostsPerDay) && isPositiveInt(draft.durationDays))
	) {
		return false;
	}
	if (
		draft.benefitType === "boost_manual_count" &&
		!isPositiveInt(draft.boostCount)
	) {
		return false;
	}
	if (draft.benefitType === "ad_extend" && !isPositiveInt(draft.extendDays)) {
		return false;
	}
	if (
		!draft.unlimitedStock &&
		draft.stockQuantity.trim() !== "" &&
		(!Number.isInteger(Number(draft.stockQuantity)) ||
			Number(draft.stockQuantity) < 0)
	) {
		return false;
	}
	return !(isUsable && !isBlankOrPositiveInt(draft.usageLimitDays));
};

// 초안 → 저장 페이로드의 혜택 컬럼. 비해당 스펙은 null로 접는다(서버가 비-null을 거부).
const benefitDraftToPayload = (draft: BenefitDraft) => {
	const isPeriod = isPeriodBenefitType(draft.benefitType);
	const isUsable = USABLE_BENEFIT_TYPES.has(draft.benefitType);
	let stockQuantity: null | number = null;
	if (!draft.unlimitedStock) {
		stockQuantity =
			draft.stockQuantity.trim() === "" ? 0 : Number(draft.stockQuantity);
	}
	return {
		audience: draft.audience,
		benefitType: draft.benefitType,
		boostCount:
			draft.benefitType === "boost_manual_count"
				? parseOptionalCount(draft.boostCount)
				: null,
		boostsPerDay: isPeriod ? parseOptionalCount(draft.boostsPerDay) : null,
		durationDays: isPeriod ? parseOptionalCount(draft.durationDays) : null,
		extendDays:
			draft.benefitType === "ad_extend"
				? parseOptionalCount(draft.extendDays)
				: null,
		stockQuantity,
		usageLimitDays: isUsable ? parseOptionalCount(draft.usageLimitDays) : null,
	};
};

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
	"outline" | "secondary" | "success" | "warning"
> = {
	canceled: "secondary",
	completed: "success",
	owned: "outline",
	pending: "warning",
	used: "secondary",
};

// 전체는 필터 해제(입력에서 status 생략)를 뜻하는 화면 전용 값이고, 나머지는 DB 원값 그대로다.
const ORDER_FILTERS = [
	"pending",
	"owned",
	"completed",
	"used",
	"canceled",
	"all",
] as const;
type OrderFilter = (typeof ORDER_FILTERS)[number];

const orderFilterLabel = (filter: OrderFilter): string =>
	filter === "all" ? "전체" : pointShopOrderStatusLabel(filter);

// 보유(owned) 건 만료 판정 — usableUntil 경과 시 서버가 취소를 거부하므로 취소 버튼도 감춘다.
const isOrderExpired = (usableUntil: Date | string | null): boolean =>
	usableUntil !== null && new Date(usableUntil).getTime() <= Date.now();

const formatItemPrice = (pricePoints: null | number): string =>
	pricePoints === null
		? "가격 미정"
		: `${pricePoints.toLocaleString("ko-KR")}P`;

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

// 아이템 행 우측 조치 메뉴(주문 탭 OrderRowActions와 같은 운영자 content 관리 패턴).
// 수정·삭제 핸들러는 그대로 두고 트리거만 인라인 버튼에서 드롭다운으로 옮긴다.
function ItemRowActions({
	onDelete,
	onEdit,
}: {
	onDelete: () => void;
	onEdit: () => void;
}) {
	return (
		<DropdownMenu>
			<DropdownMenuTrigger
				render={
					<Button aria-label="관리 메뉴" size="icon-sm" variant="ghost">
						<MoreHorizontalIcon />
					</Button>
				}
			/>
			<DropdownMenuContent align="end" className="w-32">
				<DropdownMenuItem onClick={onEdit}>수정</DropdownMenuItem>
				<DropdownMenuItem onClick={onDelete} variant="destructive">
					삭제
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
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
			id: "benefitType",
			header: "유형",
			cell: (row) => (
				<Badge variant="secondary">
					{pointShopBenefitTypeLabel(row.benefitType)}
				</Badge>
			),
		},
		{
			id: "pricePoints",
			header: "가격",
			sortValue: (row) => row.pricePoints ?? Number.POSITIVE_INFINITY,
			cell: (row) => (
				<span className="tabular-nums">{formatItemPrice(row.pricePoints)}</span>
			),
		},
		{
			id: "stockQuantity",
			header: "재고",
			sortValue: (row) => row.stockQuantity ?? Number.POSITIVE_INFINITY,
			cell: (row) => {
				if (row.stockQuantity === null) {
					return <span className="text-muted-foreground text-xs">무제한</span>;
				}
				if (row.stockQuantity <= 0) {
					return <Badge variant="secondary">품절</Badge>;
				}
				return <span className="tabular-nums">{row.stockQuantity}</span>;
			},
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
				<ItemRowActions
					onDelete={() => onDelete(row)}
					onEdit={() => onEdit(row)}
				/>
			),
		},
	];
}

// 주문 행 우측 조치 메뉴(운영자 content 관리의 RowActions 패턴). 수동·쿠폰 처리 대기엔
// 지급 완료+취소, 끌올·연장 보유(owned)엔 취소만 붙는다(지급 개념이 없어 onComplete 생략).
// 실제 확정은 상위 OrdersTab의 AlertDialog가 받는다.
function OrderRowActions({
	onCancel,
	onComplete,
}: {
	onCancel: () => void;
	onComplete?: () => void;
}) {
	return (
		<DropdownMenu>
			<DropdownMenuTrigger
				render={
					<Button aria-label="관리 메뉴" size="icon-sm" variant="ghost">
						<MoreHorizontalIcon />
					</Button>
				}
			/>
			<DropdownMenuContent align="end" className="w-32">
				{onComplete ? (
					<DropdownMenuItem onClick={onComplete}>지급 완료</DropdownMenuItem>
				) : null}
				<DropdownMenuItem onClick={onCancel} variant="destructive">
					취소·환불
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
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
			id: "benefitType",
			header: "유형",
			cell: (row) => (
				<Badge variant="secondary">
					{pointShopBenefitTypeLabel(row.benefitType)}
				</Badge>
			),
		},
		{
			id: "buyerPhone",
			header: "발송 번호",
			cell: (row) => {
				// 쿠폰형만 발송 대상 번호가 의미가 있다 — 운영자가 이 번호로 외부 발송한다.
				if (row.benefitType !== "coupon") {
					return <span className="text-muted-foreground text-xs">—</span>;
				}
				return (
					<span className="text-xs tabular-nums">
						{row.buyerPhone ?? "미등록"}
					</span>
				);
			},
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
				// 수동·쿠폰 대기(pending)는 지급 완료+취소, 끌올·연장 보유(owned)는 취소만.
				// 나머지 상태(완료·사용·취소)는 남은 조치가 없다.
				if (row.status === "pending") {
					return (
						<OrderRowActions
							onCancel={() => onCancel(row)}
							onComplete={() => onComplete(row)}
						/>
					);
				}
				// 만료(usableUntil 경과)된 보유 건은 서버가 취소를 거부하므로(§4) 버튼을
				// 감춘다 — 회원 보유함 카드와 대칭(만료 시 조치 없음).
				if (row.status === "owned" && !isOrderExpired(row.usableUntil)) {
					return <OrderRowActions onCancel={() => onCancel(row)} />;
				}
				return <span className="text-muted-foreground text-xs">처리 완료</span>;
			},
		},
	];
}

interface ItemFormValues {
	audience: Audience;
	benefitType: BenefitType;
	boostCount: null | number;
	boostsPerDay: null | number;
	categoryId: string;
	description: null | string;
	durationDays: null | number;
	extendDays: null | number;
	imageUrl: null | string;
	isActive: boolean;
	name: string;
	pricePoints: null | number;
	productTypeId: null | string;
	sortOrder: number;
	stockQuantity: null | number;
	usageLimitDays: null | number;
}

// 혜택 유형·스펙·대상·사용기한·재고를 한데 모은 조각. 유형에 따라 스펙 필드가 조건 노출된다.
function ItemBenefitFields({
	draft,
	onChange,
}: {
	draft: BenefitDraft;
	onChange: (patch: Partial<BenefitDraft>) => void;
}) {
	const isPeriod = isPeriodBenefitType(draft.benefitType);
	const isUsable = USABLE_BENEFIT_TYPES.has(draft.benefitType);
	const audienceConflict = isUsable && draft.audience === "job_seeker";
	return (
		<>
			<div className="flex flex-col gap-2">
				<Label htmlFor="point-shop-item-benefit-type">구매 후 실행 동작</Label>
				<Select
					items={POINT_SHOP_BENEFIT_TYPES.map((value) => ({
						label: pointShopBenefitTypeLabel(value),
						value,
					}))}
					onValueChange={(value) =>
						value && onChange({ benefitType: value as BenefitType })
					}
					value={draft.benefitType}
				>
					<SelectTrigger id="point-shop-item-benefit-type">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						{POINT_SHOP_BENEFIT_TYPES.map((value) => (
							<SelectItem key={value} value={value}>
								{pointShopBenefitTypeLabel(value)}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</div>
			{isPeriod ? (
				<div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
					<div className="flex flex-col gap-2">
						<Label htmlFor="point-shop-item-boosts-per-day">
							하루 끌올 횟수
						</Label>
						<Input
							id="point-shop-item-boosts-per-day"
							inputMode="numeric"
							min={1}
							onChange={(event) =>
								onChange({ boostsPerDay: event.target.value })
							}
							placeholder="예: 3"
							type="number"
							value={draft.boostsPerDay}
						/>
					</div>
					<div className="flex flex-col gap-2">
						<Label htmlFor="point-shop-item-duration-days">기간(일)</Label>
						<Input
							id="point-shop-item-duration-days"
							inputMode="numeric"
							min={1}
							onChange={(event) =>
								onChange({ durationDays: event.target.value })
							}
							placeholder="예: 7"
							type="number"
							value={draft.durationDays}
						/>
					</div>
				</div>
			) : null}
			{draft.benefitType === "boost_manual_count" ? (
				<div className="flex flex-col gap-2">
					<Label htmlFor="point-shop-item-boost-count">끌올 횟수</Label>
					<Input
						id="point-shop-item-boost-count"
						inputMode="numeric"
						min={1}
						onChange={(event) => onChange({ boostCount: event.target.value })}
						placeholder="예: 10"
						type="number"
						value={draft.boostCount}
					/>
				</div>
			) : null}
			{draft.benefitType === "ad_extend" ? (
				<div className="flex flex-col gap-2">
					<Label htmlFor="point-shop-item-extend-days">연장 기간(일)</Label>
					<Input
						id="point-shop-item-extend-days"
						inputMode="numeric"
						min={1}
						onChange={(event) => onChange({ extendDays: event.target.value })}
						placeholder="예: 7"
						type="number"
						value={draft.extendDays}
					/>
				</div>
			) : null}
			<div className="flex flex-col gap-2">
				<Label htmlFor="point-shop-item-audience">구매 대상</Label>
				<Select
					disabled={draft.benefitType === "attendance_restore_ticket"}
					items={AUDIENCE_OPTIONS.map((value) => ({
						label: pointShopAudienceLabel(value),
						value,
					}))}
					onValueChange={(value) => {
						if (value) {
							onChange({ audience: value as Audience });
						}
					}}
					value={draft.audience}
				>
					<SelectTrigger
						className={SELECT_TRIGGER_CLASSNAME}
						id="point-shop-item-audience"
					>
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						{AUDIENCE_OPTIONS.map((value) => (
							<SelectItem key={value} value={value}>
								{pointShopAudienceLabel(value)}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
				{audienceConflict ? (
					<p className="m-0 text-destructive text-xs">
						끌어올리기·광고 연장 혜택은 공고가 있는 회원만 쓸 수 있어 구직 회원
						전용으로 둘 수 없어요.
					</p>
				) : null}
			</div>
			<div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
				{isUsable ? (
					<div className="flex flex-col gap-2">
						<Label htmlFor="point-shop-item-usage-limit">사용기한(일)</Label>
						<Input
							id="point-shop-item-usage-limit"
							inputMode="numeric"
							min={1}
							onChange={(event) =>
								onChange({ usageLimitDays: event.target.value })
							}
							placeholder="비우면 무기한"
							type="number"
							value={draft.usageLimitDays}
						/>
						<p className="m-0 text-muted-foreground text-xs">
							구매 후 이 기간까지 공고에 사용할 수 있어요. 비우면 무기한입니다.
						</p>
					</div>
				) : null}
				<div className="flex flex-col gap-2">
					<Label htmlFor="point-shop-item-stock">재고</Label>
					<Input
						disabled={draft.unlimitedStock}
						id="point-shop-item-stock"
						inputMode="numeric"
						min={0}
						onChange={(event) =>
							onChange({ stockQuantity: event.target.value })
						}
						placeholder="비우면 0"
						type="number"
						value={draft.stockQuantity}
					/>
					<label
						className="flex items-center gap-2 text-sm"
						htmlFor="point-shop-item-unlimited-stock"
					>
						<Checkbox
							checked={draft.unlimitedStock}
							id="point-shop-item-unlimited-stock"
							onCheckedChange={(checked) =>
								onChange({ unlimitedStock: checked === true })
							}
						/>
						<span>무제한</span>
					</label>
				</div>
			</div>
		</>
	);
}

const isItemFormSubmittable = (args: {
	benefit: BenefitDraft;
	categoryId: string;
	isActive: boolean;
	isBusy: boolean;
	isDirty: boolean;
	name: string;
	pricePoints: null | number;
	sortOrder: number;
}): boolean => {
	if (args.isBusy || !args.isDirty || !args.name.trim() || !args.categoryId) {
		return false;
	}
	if (
		args.pricePoints !== null &&
		(!Number.isInteger(args.pricePoints) ||
			args.pricePoints < 0 ||
			args.pricePoints > PRICE_MAX)
	) {
		return false;
	}
	if (
		!Number.isInteger(args.sortOrder) ||
		args.sortOrder < 0 ||
		args.sortOrder > SORT_ORDER_MAX
	) {
		return false;
	}
	return (
		!args.isActive ||
		(args.pricePoints !== null && isBenefitDraftValid(args.benefit))
	);
};

// 추가·수정 공용 폼. 대상마다 새로 마운트돼(key) 초기값이 따라온다.
function ItemForm({
	categories,
	isPending,
	item,
	onClose,
	onSubmit,
	productTypes,
}: {
	categories: Array<{ id: string; name: string }>;
	isPending: boolean;
	item: ItemRow | null;
	onClose: () => void;
	onSubmit: (values: ItemFormValues) => void;
	productTypes: ProductTypeRow[];
}) {
	const [name, setName] = useState(item?.name ?? "");
	const [categoryId, setCategoryId] = useState(
		item?.categoryId ?? categories[0]?.id ?? ""
	);
	const [description, setDescription] = useState(item?.description ?? "");
	const [productTypeId, setProductTypeId] = useState<null | string>(
		item?.productTypeId ?? null
	);
	const [benefit, setBenefit] = useState<BenefitDraft>(() =>
		initialBenefitDraft(item)
	);
	const updateBenefit = (patch: Partial<BenefitDraft>) =>
		setBenefit((prev) => ({ ...prev, ...patch }));
	const [pricePoints, setPricePoints] = useState(
		item?.pricePoints == null ? "" : String(item.pricePoints)
	);
	const [sortOrder, setSortOrder] = useState(String(item?.sortOrder ?? 0));
	const [isActive, setIsActive] = useState(item?.isActive ?? false);
	const [imageUrl, setImageUrl] = useState<null | string>(
		item?.imageUrl ?? null
	);
	const [isUploading, setIsUploading] = useState(false);
	const createMediaUpload = useMutation(
		orpc.bambi.community.createMediaUpload.mutationOptions()
	);

	const parsedPrice =
		pricePoints.trim() === "" ? null : Number(pricePoints.trim());
	const parsedSortOrder = Number(sortOrder);
	const benefitPayload = benefitDraftToPayload(benefit);
	const isDirty =
		item === null ||
		name.trim() !== item.name ||
		(description.trim() || null) !== item.description ||
		categoryId !== item.categoryId ||
		productTypeId !== item.productTypeId ||
		imageUrl !== item.imageUrl ||
		isActive !== item.isActive ||
		parsedPrice !== item.pricePoints ||
		parsedSortOrder !== item.sortOrder ||
		benefitPayload.audience !== item.audience ||
		benefitPayload.benefitType !== item.benefitType ||
		benefitPayload.boostCount !== item.boostCount ||
		benefitPayload.boostsPerDay !== item.boostsPerDay ||
		benefitPayload.durationDays !== item.durationDays ||
		benefitPayload.extendDays !== item.extendDays ||
		benefitPayload.stockQuantity !== item.stockQuantity ||
		benefitPayload.usageLimitDays !== item.usageLimitDays;
	const canSubmit = isItemFormSubmittable({
		benefit,
		categoryId,
		isActive,
		isBusy: isPending || isUploading,
		isDirty,
		name,
		pricePoints: parsedPrice,
		sortOrder: parsedSortOrder,
	});

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
			<div className="flex flex-col gap-2">
				<Label htmlFor="point-shop-item-category">노출 카테고리</Label>
				<Select
					items={categories.map((category) => ({
						label: category.name,
						value: category.id,
					}))}
					onValueChange={(value) => value && setCategoryId(value)}
					value={categoryId}
				>
					<SelectTrigger id="point-shop-item-category">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						{categories.map((category) => (
							<SelectItem key={category.id} value={category.id}>
								{category.name}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</div>
			<div className="flex flex-col gap-2">
				<Label htmlFor="point-shop-item-dynamic-type">상품 유형</Label>
				<Select
					items={productTypes.map((type) => ({
						label: type.name,
						value: type.id,
					}))}
					onValueChange={setProductTypeId}
					value={productTypeId}
				>
					<SelectTrigger id="point-shop-item-dynamic-type">
						<SelectValue placeholder="상품 유형 선택" />
					</SelectTrigger>
					<SelectContent>
						{productTypes.map((type) => (
							<SelectItem key={type.id} value={type.id}>
								{type.name}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</div>
			<ItemBenefitFields draft={benefit} onChange={updateBenefit} />
			<div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
				<div className="flex flex-col gap-2">
					<Label htmlFor="point-shop-item-price">가격(포인트)</Label>
					<Input
						id="point-shop-item-price"
						inputMode="numeric"
						max={PRICE_MAX}
						min={0}
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
						<div className="size-20 overflow-hidden rounded-lg">
							<PointShopProductImage
								imageUrl={imageUrl}
								name={name || "상품"}
								sizes="5rem"
							/>
						</div>
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
							...benefitPayload,
							categoryId,
							description: description.trim() || null,
							imageUrl,
							isActive,
							name: name.trim(),
							pricePoints: parsedPrice,
							productTypeId,
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
	const layoutQuery = useQuery(
		orpc.bambi.pointShop.adminGetCatalogLayout.queryOptions()
	);
	const productTypesQuery = useQuery(
		orpc.bambi.pointShop.adminListProductTypes.queryOptions()
	);
	const productTypes = productTypesQuery.data ?? [];
	const categories = (layoutQuery.data?.categories ?? []).filter(
		(category) => category.kind === "standard"
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
	const activeMutation = useMutation(
		orpc.bambi.pointShop.adminSetItemActive.mutationOptions({
			onError: (error) =>
				toast.error(
					localizedShopError(error.message, "공개 상태를 바꾸지 못했어요.")
				),
			onSuccess: invalidate,
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
				<Button
					disabled={categories.length === 0}
					onClick={() => setFormTarget("new")}
					type="button"
				>
					포인트 상품 추가
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
				<Accordion
					className="rounded-xl border border-border"
					data-column-count={columns.length}
				>
					{listQuery.data.map((item) => (
						<AccordionItem key={item.id} value={item.id}>
							<AccordionTrigger className="px-4 hover:no-underline">
								<span className="flex items-center gap-3 text-left">
									<ItemThumbnail item={item} />
									<span className="flex flex-col gap-1">
										<strong>{item.name}</strong>
										<span className="text-muted-foreground text-xs">
											{formatItemPrice(item.pricePoints)} ·{" "}
											{item.isActive ? "공개" : "비공개"}
										</span>
									</span>
								</span>
							</AccordionTrigger>
							<AccordionContent className="px-4 pb-4">
								<div className="grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
									<div className="flex aspect-square items-center justify-center overflow-hidden rounded-xl border border-border bg-muted/30">
										<PointShopProductImage
											imageUrl={item.imageUrl}
											name={item.name}
										/>
									</div>
									<div className="flex flex-col gap-2 text-sm">
										<p className="m-0">
											<strong>분류</strong> ·{" "}
											{categories.find(
												(category) => category.id === item.categoryId
											)?.name ?? "분류 확인 필요"}
										</p>
										<p className="m-0">
											<strong>이름</strong> · {item.name}
										</p>
										<p className="m-0">
											<strong>가격</strong> ·{" "}
											{formatItemPrice(item.pricePoints)}
										</p>
										<div className="flex items-center justify-between gap-3 rounded-lg border border-border p-3">
											<span>
												<strong>공개</strong> · 가격이 0P여도 공개 상태면
												사용자에게 보여요.
											</span>
											<Switch
												checked={item.isActive}
												onCheckedChange={(isActive) =>
													activeMutation.mutate({ id: item.id, isActive })
												}
											/>
										</div>
										<div className="mt-auto flex flex-wrap justify-end gap-2">
											<Button onClick={() => setFormTarget(item)} size="sm">
												수정
											</Button>
											<Button
												onClick={() => setDeleting(item)}
												size="sm"
												variant="destructive"
											>
												삭제
											</Button>
										</div>
									</div>
								</div>
							</AccordionContent>
						</AccordionItem>
					))}
				</Accordion>
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
							categories={categories}
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
							productTypes={productTypes}
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
							바로 돌려줍니다. 사유는 구매자의 포인트 내역 화면 구매 내역 카드에
							그대로 보입니다.
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
					<TabsTrigger value="catalog">포인트몰 설정</TabsTrigger>
					<TabsTrigger value="orders">주문 관리</TabsTrigger>
				</TabsList>
				<TabsContent value="items">
					<ItemsTab />
				</TabsContent>
				<TabsContent value="catalog">
					<CatalogSettings />
				</TabsContent>
				<TabsContent value="orders">
					<OrdersTab />
				</TabsContent>
			</Tabs>
		</div>
	);
}
