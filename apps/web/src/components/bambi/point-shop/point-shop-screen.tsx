"use client";

// 밤비 — 포인트몰 공개 화면. 목록은 누구나 보고 구매만 로그인 회원이 한다
// (게이트는 resolve-gate의 공개 경로, 자격 판정은 서버 pointShop.purchase가 최종).
// 잔액은 헤더 칩(PointBalanceChip)에만 두고 여기서는 구매 다이얼로그 안에서만 보여준다.

import type { AppRouter } from "@bambi-app/api/routers/index";
import { Alert, AlertDescription } from "@bambi-app/ui/components/alert";
import { Badge } from "@bambi-app/ui/components/badge";
import { Button } from "@bambi-app/ui/components/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogTitle,
} from "@bambi-app/ui/components/dialog";
import { Skeleton } from "@bambi-app/ui/components/skeleton";
import { cn } from "@bambi-app/ui/lib/utils";
import type { InferRouterOutputs } from "@orpc/server";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { GiftIcon, Info, TriangleAlert } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { useBambiAuth } from "@/components/bambi/auth-client-provider";
import { EmptyState } from "@/components/bambi/empty-state";
import { PhoneVerifyDialog } from "@/components/bambi/phone-verify-dialog";
import { PremiumAdBannerSection } from "@/components/bambi/premium-ad-banner-section";
import { useAdBannerJobs } from "@/lib/bambi/api-jobs";
import type { BambiGenderValue, MockPhoneVerifyInput } from "@/lib/bambi/guest";
import { pointShopBenefitTypeLabel } from "@/lib/bambi/point-shop-labels";
import { orpc } from "@/utils/orpc";

// 서버 응답과의 드리프트를 막으려고 oRPC 추론 출력에서 아이템 타입을 파생한다.
type PointShopItem =
	InferRouterOutputs<AppRouter>["bambi"]["pointShop"]["listItems"][number];

// 보유·사용형(끌올·연장) — 구매 후 보유함에서 공고에 쓰는 유형. 다이얼로그 고지 분기용.
const OWNED_BENEFIT_TYPES = new Set([
	"ad_extend",
	"boost_auto_period",
	"boost_manual_count",
	"boost_manual_period",
]);
const isOwnedBenefit = (benefitType: string): boolean =>
	OWNED_BENEFIT_TYPES.has(benefitType);

// 자격 안내 문구용 역할 이름. audience는 all/employer/job_seeker 뿐이라 이 둘로 갈린다.
const audienceRoleLabel = (audience: string): string =>
	audience === "employer" ? "구인 회원" : "구직 회원";

// 공고 카드 그리드(lg 3 · xl 4)와 같은 데스크톱 열 규칙. 다만 카드가 정사각이라
// 모바일은 1열이면 한 칸이 화면을 통째로 먹어 2열로 둔다.
const ITEM_GRID_CLASS = "grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-4";
// 로딩 자리표시 키. index로 키를 만들지 않으려고 상수 배열로 둔다.
const SKELETON_KEYS = ["ps-1", "ps-2", "ps-3", "ps-4"] as const;

// 스켈레톤은 한 행만 채운다 — 열 수가 breakpoint마다 달라 여분 칸을 그 폭에서만 감춘다
// (visual-job-exposure-sections의 자리표시 규칙과 동일, 열 수만 모바일 2로 바뀐다).
const skeletonVisibilityClass = (index: number): string => {
	if (index < 2) {
		return "block";
	}
	if (index === 2) {
		return "hidden lg:block";
	}
	return "hidden xl:block";
};

// xl 4열 기준 카드 폭(약 259px)에 맞춘 힌트. 실제 폭은 그리드가 정한다.
const ITEM_IMAGE_SIZES =
	"(min-width: 1280px) 259px, (min-width: 1024px) 33vw, 50vw";

const pointText = (points: number): string =>
	`${points.toLocaleString("ko-KR")}P`;

const HANGUL_CHAR = /[가-힣]/;

// orpc 입력 검증 실패 메시지는 영어라 그대로 띄우면 안 된다(UNAUTHORIZED·zod 영어 등).
// 서버가 명시적으로 던진 한국어 문구(한글 포함)만 살리고 나머지는 한국어 폴백으로 덮는다
// (운영자 포인트몰 관리 화면의 localizedShopError와 같은 관례).
const localizedPurchaseError = (message: string | undefined): string =>
	message && HANGUL_CHAR.test(message)
		? message
		: "구매하지 못했어요. 잠시 후 다시 시도해 주세요.";

function ItemCard({
	item,
	onOpen,
}: {
	item: PointShopItem;
	onOpen: (item: PointShopItem) => void;
}) {
	return (
		<button
			className="flex aspect-square w-full cursor-pointer flex-col overflow-hidden rounded-xl border border-border bg-card p-0 text-left transition-colors hover:border-coral-300"
			onClick={() => onOpen(item)}
			type="button"
		>
			{/* 이미지 칸이 카드 대부분을 차지하고 이름 줄만 아래에 붙는다. min-h-0이 없으면
			    flex-1 칸이 이미지 원본 높이만큼 버텨 정사각 비율이 깨진다. */}
			<span className="relative block min-h-0 w-full flex-1 bg-secondary">
				{item.imageUrl ? (
					// 운영자가 올리는 이미지는 배너형 등 비정사각이 많아 cover로 자르면 문구가
					// 잘린다 — contain으로 전체를 보여주고 남는 여백은 bg-secondary가 받친다.
					<Image
						alt=""
						className="object-contain"
						fill
						sizes={ITEM_IMAGE_SIZES}
						src={item.imageUrl}
						unoptimized
					/>
				) : (
					<span className="flex size-full items-center justify-center text-coral-300">
						<GiftIcon className="size-10" />
					</span>
				)}
				{/* 품절은 파생 상태(재고 0). 이미지를 딤 처리하고 가운데 "품절" 스탬프를 얹어
				    진열대에서 한눈에 빠진 상품처럼 읽히게 한다. 클릭은 막지 않는다(다이얼로그가
				    품절 안내). 딤을 가격표 앞에 둬 우상단 가격은 또렷이 남긴다. */}
				{item.soldOut ? (
					<span className="absolute inset-0 flex items-center justify-center bg-background/60">
						<Badge className="h-7 px-3 font-extrabold text-sm" variant="dark">
							품절
						</Badge>
					</span>
				) : null}
				{/* 가격표처럼 이미지 우상단에 얹는다 — 카드가 상품 진열대처럼 읽힌다. */}
				<Badge className="absolute top-2 right-2 h-7 px-3 font-extrabold text-sm">
					{pointText(item.pricePoints)}
				</Badge>
			</span>
			<span className="flex w-full shrink-0 items-center border-border border-t px-3 py-2.5">
				<span className="truncate font-extrabold text-sm">{item.name}</span>
			</span>
		</button>
	);
}

type PurchaseActionMode = "audience" | "buy" | "identity" | "soldout";

// 유형별 이행 고지(구매 전 사전 고지). 끌올·연장은 사용기한·환불 정책, 쿠폰은 발송 경로,
// 수동 지급은 지급완료 전 취소 가능을 알린다 — 항상 한 줄 고지가 붙는다.
function BenefitFulfillmentNotice({ item }: { item: PointShopItem }) {
	if (isOwnedBenefit(item.benefitType)) {
		return (
			<Alert variant="brand">
				<Info />
				<AlertDescription>
					{item.usageLimitDays === null
						? "구매 후 보유함에서 기한 없이 사용할 수 있어요. "
						: `구매 후 ${item.usageLimitDays}일 이내에 보유함에서 사용해야 하며, 기한이 지나면 소멸돼요(환불 불가). `}
					사용 후에는 취소·환불이 불가하고, 사용 전에는 취소·환불할 수 있어요.
				</AlertDescription>
			</Alert>
		);
	}
	if (item.benefitType === "coupon") {
		return (
			<Alert variant="brand">
				<Info />
				<AlertDescription>
					본인인증 시 등록된 휴대폰 번호로 발송돼요. 지급완료 전에는 취소·환불할
					수 있어요.
				</AlertDescription>
			</Alert>
		);
	}
	return (
		<Alert variant="brand">
			<Info />
			<AlertDescription>
				운영자가 확인한 뒤 순서대로 지급해요. 지급완료 전에는 취소·환불할 수
				있어요.
			</AlertDescription>
		</Alert>
	);
}

// 구매를 막는 사유 경고(품절·자격·본인인증). 표시일 뿐 서버 purchase가 최종 판정한다.
function PurchaseBlockNotice({
	actionMode,
	audience,
}: {
	actionMode: PurchaseActionMode;
	audience: string;
}) {
	if (actionMode === "soldout") {
		return (
			<Alert variant="warning">
				<TriangleAlert />
				<AlertDescription>지금은 품절된 아이템이에요.</AlertDescription>
			</Alert>
		);
	}
	if (actionMode === "audience") {
		return (
			<Alert variant="warning">
				<TriangleAlert />
				<AlertDescription>
					{audience === "all" ? "구인 회원" : audienceRoleLabel(audience)} 전용
					혜택이에요.
				</AlertDescription>
			</Alert>
		);
	}
	if (actionMode === "identity") {
		return (
			<Alert variant="warning">
				<TriangleAlert />
				<AlertDescription>
					본인인증을 완료하면 구매할 수 있어요.
				</AlertDescription>
			</Alert>
		);
	}
	return null;
}

function PurchaseDialogBody({
	balance,
	defaultGender,
	isPending,
	isPhoneVerified,
	item,
	onCancel,
	onConfirm,
	onMockVerified,
	onVerified,
	role,
}: {
	// 잔액을 아직 못 받았으면(로딩·조회 실패) null. 잔액 검증의 정본은 서버(purchase가 계정
	// 락 안에서 재검증)이고 여기 표시는 UX 보조일 뿐이라, null이면 부족 안내를 숨기고 구매
	// 버튼은 열어 둔다 — 미확보 상태를 0P로 오판해 막지 않는다.
	balance: null | number;
	defaultGender: BambiGenderValue | null;
	isPending: boolean;
	isPhoneVerified: boolean;
	item: PointShopItem;
	onCancel: () => void;
	onConfirm: () => void;
	onMockVerified: (input: MockPhoneVerifyInput) => Promise<void>;
	onVerified: (identityVerificationId: string) => Promise<void>;
	role: null | string;
}) {
	const { audience, benefitType } = item;
	const isCoupon = benefitType === "coupon";
	const ownsAfterPurchase = isOwnedBenefit(benefitType);
	const showBenefitTag = benefitType !== "none";
	const shortfall = balance === null ? 0 : item.pricePoints - balance;

	// 표시 계층의 힌트일 뿐 — 정본은 서버 purchase다. 자격·본인인증은 아이템 열람은
	// 허용하되 구매 버튼만 대체한다(자격 안내·인증 유도). 우선순위: 품절 > 자격 > 본인인증.
	// 혜택형(끌올·연장)은 공고를 가진 구인 주체 전용 — audience=all이라도 구직 회원은
	// 사용할 수 없어 구매를 막는다(서버 resolvePurchase와 동일, dead-end 구매 방지).
	const employerOnlyBenefit = ownsAfterPurchase;
	const audienceBlocked =
		(audience !== "all" && role !== null && audience !== role) ||
		(employerOnlyBenefit && role === "job_seeker");
	const identityGate = isCoupon && !isPhoneVerified;
	const resolveActionMode = (): PurchaseActionMode => {
		if (item.soldOut) {
			return "soldout";
		}
		if (audienceBlocked) {
			return "audience";
		}
		if (identityGate) {
			return "identity";
		}
		return "buy";
	};
	const actionMode = resolveActionMode();

	return (
		<>
			<div className="flex flex-col gap-3">
				<div className="relative aspect-[4/3] w-full overflow-hidden rounded-lg bg-secondary">
					{item.imageUrl ? (
						<Image
							alt=""
							className="object-contain"
							fill
							sizes="420px"
							src={item.imageUrl}
							unoptimized
						/>
					) : (
						<span className="flex size-full items-center justify-center text-coral-300">
							<GiftIcon className="size-10" />
						</span>
					)}
				</div>
				<div className="flex flex-col gap-1.5">
					<div className="flex flex-wrap items-center gap-2">
						<DialogTitle>{item.name}</DialogTitle>
						{showBenefitTag ? (
							<Badge variant="secondary">
								{pointShopBenefitTypeLabel(benefitType)}
							</Badge>
						) : null}
					</div>
					<DialogDescription>
						{item.description ?? "운영자가 확인한 뒤 순서대로 지급해요."}
					</DialogDescription>
				</div>
			</div>
			<dl className="m-0 flex flex-col gap-2 rounded-lg bg-secondary px-4 py-3 text-sm">
				<div className="flex items-center justify-between gap-3">
					<dt className="m-0 text-muted-foreground">필요 포인트</dt>
					<dd className="m-0 font-extrabold">{pointText(item.pricePoints)}</dd>
				</div>
				{balance === null ? null : (
					<div className="flex items-center justify-between gap-3">
						<dt className="m-0 text-muted-foreground">내 포인트</dt>
						<dd className="m-0 font-extrabold">{pointText(balance)}</dd>
					</div>
				)}
			</dl>
			{shortfall > 0 ? (
				<p className="m-0 font-bold text-destructive text-sm">
					{`포인트가 ${pointText(shortfall)} 부족해요.`}
				</p>
			) : null}
			{/* 유형별 이행 고지(항상 1건). 끌올·연장 사용기한·환불 정책, 쿠폰 발송, 수동 지급. */}
			<BenefitFulfillmentNotice item={item} />
			{/* 구매를 막는 사유 안내(자격·본인인증·품절). 표시일 뿐 서버가 최종 판정한다. */}
			<PurchaseBlockNotice actionMode={actionMode} audience={audience} />
			{actionMode === "identity" ? (
				<PhoneVerifyDialog
					defaultGender={defaultGender}
					description="본인인증으로 계정에 휴대폰 번호를 등록해요."
					onMockVerified={onMockVerified}
					onVerified={onVerified}
					title="휴대폰 본인인증"
					triggerLabel="본인인증 하기"
				/>
			) : null}
			<div className="flex justify-end gap-2">
				<Button onClick={onCancel} type="button" variant="outline">
					닫기
				</Button>
				{actionMode === "buy" || actionMode === "soldout" ? (
					<Button
						disabled={item.soldOut || shortfall > 0 || isPending}
						onClick={onConfirm}
						type="button"
					>
						{isPending ? "구매 중…" : "구매하기"}
					</Button>
				) : null}
			</div>
		</>
	);
}

export function PointShopScreen() {
	const router = useRouter();
	const queryClient = useQueryClient();
	const adBanners = useAdBannerJobs();
	const { isAuthenticated, isPending: isAuthPending } = useBambiAuth();
	const [selected, setSelected] = useState<null | PointShopItem>(null);

	const itemsQuery = useQuery(orpc.bambi.pointShop.listItems.queryOptions());
	const balanceQuery = useQuery({
		...orpc.bambi.pointShop.getMyBalance.queryOptions(),
		enabled: isAuthenticated,
	});
	// 쿠폰형 본인인증 게이트·자격 안내에 쓸 프로필(역할·본인인증·성별). auth-provider의
	// getMine과 같은 키라 캐시를 공유한다.
	const mineQuery = useQuery({
		...orpc.bambi.onboarding.getMine.queryOptions(),
		enabled: isAuthenticated,
	});
	const profile = mineQuery.data?.bambiProfile ?? null;
	const role = profile?.role ?? null;
	const isPhoneVerified = Boolean(profile?.isPhoneVerified);
	const defaultGender = (profile?.gender ?? null) as BambiGenderValue | null;

	const purchase = useMutation(
		orpc.bambi.pointShop.purchase.mutationOptions({
			onError: (error) => toast.error(localizedPurchaseError(error.message)),
			onSuccess: async () => {
				setSelected(null);
				toast.success(
					"구매했어요. 내 정보 → 포인트 내역에서 확인할 수 있어요."
				);
				// 잔액 칩·목록·구매 내역이 한 번에 따라오도록 포인트몰 쿼리를 통째로 무효화한다.
				await queryClient.invalidateQueries({
					queryKey: orpc.bambi.pointShop.key(),
				});
			},
		})
	);

	// 쿠폰형 본인인증 게이트에서 바로 인증하도록 계정 설정과 같은 인증 유도 패턴을 재사용한다.
	// 성공하면 getMine을 무효화해 isPhoneVerified가 갱신되고 다이얼로그가 구매 버튼으로 바뀐다.
	const verifyPhone = useMutation(
		orpc.bambi.onboarding.verifyMyPhone.mutationOptions({
			onSuccess: async () => {
				toast.success("휴대폰 인증을 완료했어요.");
				await queryClient.invalidateQueries({
					queryKey: orpc.bambi.onboarding.getMine.key(),
				});
			},
		})
	);
	const verifyPhoneMock = useMutation(
		orpc.bambi.onboarding.verifyMyPhoneMock.mutationOptions({
			onSuccess: async () => {
				toast.success("휴대폰 인증을 완료했어요.");
				await queryClient.invalidateQueries({
					queryKey: orpc.bambi.onboarding.getMine.key(),
				});
			},
		})
	);
	const handleVerified = async (identityVerificationId: string) => {
		await verifyPhone.mutateAsync({ identityVerificationId });
	};
	const handleMockVerified = async (input: MockPhoneVerifyInput) => {
		await verifyPhoneMock.mutateAsync({
			birthDate: input.birth,
			gender: input.gender,
			phoneNumber: input.phone,
			realName: input.name,
		});
	};

	const handleOpen = (item: PointShopItem) => {
		// 세션 판정 전(하이드레이션 직후)에는 비로그인으로 보여, 눌러도 아무것도 하지 않는다 —
		// 여기서 바로 보내면 로그인한 사용자가 인증 화면으로 튕긴다.
		if (isAuthPending) {
			return;
		}
		if (isAuthenticated) {
			setSelected(item);
			return;
		}
		router.push("/seeker?auth=login");
	};

	return (
		<div className="flex w-full flex-col gap-6 py-6">
			<PremiumAdBannerSection
				isLoading={adBanners.isLoading}
				items={adBanners.premiumBanner}
				promotionSurface="point_shop_center"
			/>

			<section className="flex flex-col gap-3">
				<div className="flex flex-col gap-1">
					<h2 className="m-0 font-extrabold text-lg">포인트 아이템</h2>
					<p className="m-0 text-muted-foreground text-sm">
						출석·글쓰기로 모은 포인트로 교환해요. 신청하면 운영자가 확인 후
						지급해요.
					</p>
				</div>

				{itemsQuery.isPending ? (
					<div className={ITEM_GRID_CLASS}>
						{SKELETON_KEYS.map((key, index) => (
							<Skeleton
								className={cn(
									"aspect-square w-full rounded-xl",
									skeletonVisibilityClass(index)
								)}
								key={key}
							/>
						))}
					</div>
				) : null}

				{itemsQuery.isError ? (
					<EmptyState
						action={
							<Button onClick={() => itemsQuery.refetch()} type="button">
								다시 시도
							</Button>
						}
						description="아이템을 불러오지 못했어요. 잠시 후 다시 시도해 주세요."
						title="불러오기 실패"
					/>
				) : null}

				{itemsQuery.data?.length === 0 ? (
					<EmptyState
						description="새 아이템이 등록되면 이곳에 바로 보여요."
						title="준비 중인 아이템이 없어요"
					/>
				) : null}

				{itemsQuery.data && itemsQuery.data.length > 0 ? (
					<div className={ITEM_GRID_CLASS}>
						{itemsQuery.data.map((item) => (
							<ItemCard item={item} key={item.id} onOpen={handleOpen} />
						))}
					</div>
				) : null}
			</section>

			{/* 다이얼로그는 목록 밖에 하나만 두고 대상만 갈아끼운다(운영자 출석 화면과 같은 관례). */}
			<Dialog
				onOpenChange={(open) => {
					if (!open) {
						setSelected(null);
					}
				}}
				open={selected !== null}
			>
				<DialogContent>
					{selected ? (
						<PurchaseDialogBody
							balance={balanceQuery.data?.pointBalance ?? null}
							defaultGender={defaultGender}
							isPending={purchase.isPending}
							isPhoneVerified={isPhoneVerified}
							item={selected}
							onCancel={() => setSelected(null)}
							onConfirm={() => purchase.mutate({ itemId: selected.id })}
							onMockVerified={handleMockVerified}
							onVerified={handleVerified}
							role={role}
						/>
					) : null}
				</DialogContent>
			</Dialog>
		</div>
	);
}
