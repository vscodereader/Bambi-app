import { env } from "@bambi-app/env/native";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { cn, Surface, useThemeColor } from "heroui-native";
import { Image, Text, View } from "react-native";

import { Pill } from "@/src/components/bambi-screen";
import {
	adPeriodTier,
	formatAdPeriod,
	NATIVE_AD_PERIOD_TIERS,
	type NativeAdPeriodTier,
	type NativeJobSectionKey,
	type NativeSeekerJob,
	resolveJobCoverUri,
} from "@/src/lib/bambi-native";
import { orpc } from "@/src/lib/orpc";

// 웹 VisualJobCard의 톤 언어 이식 — 배경 틴트 없이 테두리 색만으로 유료 섹션을 구분한다
// (스페셜=coral, 급구=amber, 추천=blue). 섹션 헤더 액센트 바와 같은 축이라 새 색을 짓지 않는다.
const jobCardBorderClassNames = {
	organic: "border-border",
	recommended: "border-link/40",
	special: "border-accent/40",
	urgent: "border-warning/60",
} as const;

// 급여 단위 배지 톤도 웹과 동일 — 유료 섹션은 danger, 전체 공고는 중립.
const jobPayUnitTones = {
	organic: "neutral",
	recommended: "danger",
	special: "danger",
	urgent: "danger",
} as const;

// 공개 버킷 base URL. 순수 공고 커버는 storageKey만 내려오므로 이 값과 합쳐 URL을 만든다.
// 미설정(개발)이면 커버를 못 만들어 카드가 업소명 타일로 폴백한다.
const GCS_PUBLIC_BASE_URL = env.EXPO_PUBLIC_GCS_PUBLIC_BASE_URL;

// 커버 이미지가 없는 공고는 업소명 앞 두 글자 타일로 폴백한다. 크기는 커버 썸네일과 같은
// h-14 w-30 — 정사각형(size-14)이면 커버 있는 카드와 제목 시작 위치가 어긋나 목록이 들쭉날쭉했다.
function JobCompanyTile({ name }: { name: string }) {
	return (
		<View className="h-14 w-30 shrink-0 items-center justify-center rounded-md bg-accent/10">
			<Text className="font-bold text-accent-soft-foreground text-sm dark:text-accent">
				{Array.from(name).slice(0, 2).join("")}
			</Text>
		</View>
	);
}

// 웹 VisualJobCard와 같은 커버 규격(h-14 w-30, object-fill). 수집 공고는 base64 data URI,
// 순수 공고는 공개 버킷 URL이다(resolveJobCoverUri가 출처를 가른다). 업소명이 옆에 텍스트로
// 있어 커버는 장식 이미지다 — 부모 카드가 접근성 트리에서 이미 가린다.
function JobCoverThumb({ uri }: { uri: string }) {
	return (
		<Image
			className="h-14 w-30 shrink-0 rounded-md border border-border"
			resizeMode="stretch"
			source={{ uri }}
		/>
	);
}

// 웹 useAdPeriodTiers 이식. 운영자 설정 등급을 읽어 등급 배지에 공급하고, 행이 없거나
// 로딩 중이면 상수 폴백으로 렌더한다. orpc react-query 캐시가 카드마다의 중복 요청을 하나로
// 합친다(웹처럼 같은 queryKey를 공유). 상수와 달리 운영자 행은 icon 프리셋 대신 iconImageUrl을
// 가질 수 있다 — 색(colorClass)은 native가 소비하지 않으므로 매핑에서 뺀다.
function useAdPeriodTiers(): readonly NativeAdPeriodTier[] {
	const query = useQuery(orpc.bambi.adPeriodTiers.list.queryOptions());
	const rows = query.data;

	if (!rows || rows.length === 0) {
		return NATIVE_AD_PERIOD_TIERS;
	}

	return rows.map((row) => ({
		icon: row.icon,
		iconImageUrl: row.iconImageUrl,
		label: row.label,
		maxDays: row.maxDays,
		minDays: row.minDays,
	}));
}

// 웹 JobAdPeriodBadge 이식 — 급여 행 오른쪽 끝의 누적 광고 배지(등급 아이콘 + "N회 N일").
// adPeriod가 없으면 카드가 렌더하지 않으므로 값이 있다고 가정한다. 색은 웹의 amber/slate
// 팔레트를 native heroui 토큰으로 옮긴다: 상위(왕관) 티어는 브랜드 accent, 그 외(메달)는
// warning. 텍스트는 밝은 표면 대비를 위해 라이트에서 -soft-foreground를 쓰고 다크에서 원색으로
// 되돌린다(Pill과 같은 규칙). Ionicons에 crown 글리프가 없어 왕관은 trophy(최상위 수상)로
// 대체한다. 운영자가 올린 아이콘(iconImageUrl, GIF 등)이 있으면 프리셋 대신 그 이미지를 그린다.
function JobAdPeriodBadge({
	adPeriod,
}: {
	adPeriod: NonNullable<NativeSeekerJob["adPeriod"]>;
}) {
	const tiers = useAdPeriodTiers();
	const tier = adPeriodTier(adPeriod.totalDays, tiers);
	const isTopTier = tier.icon === "crown";
	const accentColor = useThemeColor("accent");
	const warningColor = useThemeColor("warning");

	// 급여 텍스트는 shrink로 밀리므로 배지는 ml-auto로 급여 행 오른쪽 끝에 붙인다(새 행을
	// 만들지 않아 카드 높이는 그대로다). 카드 전체가 접근성 단일 노드라(부모가 descendants를
	// 숨긴다) 이 배지의 의미는 카드 accessibilityLabel이 대신 전달한다.
	return (
		<View className="ml-auto flex-row items-center gap-1">
			{tier.iconImageUrl ? (
				<Image
					className="size-5"
					resizeMode="contain"
					source={{ uri: tier.iconImageUrl }}
				/>
			) : (
				<Ionicons
					color={isTopTier ? accentColor : warningColor}
					name={isTopTier ? "trophy" : "medal"}
					size={16}
				/>
			)}
			<Text
				className={cn(
					"font-semibold text-sm",
					isTopTier
						? "text-accent-soft-foreground dark:text-accent"
						: "text-warning-soft-foreground dark:text-warning"
				)}
				numberOfLines={1}
			>
				{formatAdPeriod(adPeriod)}
			</Text>
		</View>
	);
}

function JobCardBody({
	job,
	sectionKey,
}: {
	job: NativeSeekerJob;
	sectionKey: NativeJobSectionKey;
}) {
	const mutedColor = useThemeColor("muted");
	const employerName = job.employerDisplayName ?? "밤비알바 구인자";
	const coverUri = resolveJobCoverUri(job, GCS_PUBLIC_BASE_URL);

	return (
		<View className="gap-3">
			<View className="flex-row items-center gap-3">
				{coverUri ? (
					<JobCoverThumb uri={coverUri} />
				) : (
					<JobCompanyTile name={employerName} />
				)}
				<View className="flex-1 gap-1">
					<Text
						className="font-bold text-base text-foreground leading-snug"
						numberOfLines={2}
					>
						{job.title}
					</Text>
					<View className="flex-row items-center gap-1">
						<Ionicons color={mutedColor} name="location-outline" size={12} />
						<Text className="flex-1 text-muted text-xs" numberOfLines={1}>
							{employerName} · {job.region} · {job.workSchedule ?? "일정 협의"}
						</Text>
					</View>
				</View>
			</View>
			{/* 급여가 카드 앵커 — 웹처럼 단위는 배지로 떼고 금액만 코럴로 강조한다.
			    코럴 원색은 흰 카드 위 대비가 모자라 Pill과 같은 규칙(라이트=soft-foreground,
			    다크=원색)을 쓴다. */}
			<View className="flex-row items-center gap-2">
				{job.payAmount !== null && job.payUnit ? (
					<Pill tone={jobPayUnitTones[sectionKey]}>{job.payUnit}</Pill>
				) : null}
				<Text
					className="shrink font-bold text-accent-soft-foreground text-base dark:text-accent"
					numberOfLines={1}
				>
					{job.payAmount === null
						? "급여 협의"
						: `${job.payAmount.toLocaleString("ko-KR")}원`}
				</Text>
				{/* 당일면접·인증완료 Pill을 걷어낸 자리 — 유료 카드엔 누적 광고 등급 배지가
				    들어간다(웹 VisualJobCard와 같은 축). adPeriod가 없는 공고(전체·수집)는
				    아무것도 그리지 않아 카드 시각이 그대로다. */}
				{job.adPeriod ? <JobAdPeriodBadge adPeriod={job.adPeriod} /> : null}
			</View>
		</View>
	);
}

// 구직자 목록의 공고 카드 한 장. 목록(JobRow)은 이걸 Link/Pressable로 감싸고, 공고 작성
// 폼의 "목록 노출 미리보기"는 감싸지 않고 그대로 그린다 — 두 곳이 같은 카드를 보게 하려고
// 카드 자체는 링크·터치를 모르게 두었다. 내부 Text는 접근성 트리에서 숨긴다: 카드 의미는
// 감싸는 쪽의 accessibilityLabel(목록) 또는 미리보기 라벨이 대신 전달한다.
export function JobListCard({
	job,
	sectionKey,
}: {
	job: NativeSeekerJob;
	sectionKey: NativeJobSectionKey;
}) {
	// 기본 Surface(흰 카드)+톤 테두리 = 웹 카드의 border bg-card 조합. 목록 배경이
	// bg-background(흰색)라 secondary 회색 대신 테두리로 카드 경계를 세운다.
	return (
		<Surface
			className={cn(
				"rounded-2xl border p-4",
				jobCardBorderClassNames[sectionKey]
			)}
		>
			<View importantForAccessibility="no-hide-descendants">
				<JobCardBody job={job} sectionKey={sectionKey} />
			</View>
		</Surface>
	);
}
