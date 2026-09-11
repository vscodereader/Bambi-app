# native 내 정보(마이페이지) 허브 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** native 구직자 앱의 '내 정보' 탭(플레이스홀더)을 실데이터 허브로 완성한다 — 프로필 카드(세션+온보딩 프로필), 포인트·등급 요약(출석 체크 포함), heroui-native ListGroup 메뉴, 로그아웃.

**Architecture:** 화면은 `apps/native/app/(seeker)/(tabs)/me.tsx` 한 파일에 로컬 컴포넌트(ProfileCard·PointsSummaryCard·MeMenu)로 조립한다(탐색 탭 index.tsx와 같은 코드베이스 관행). 순수 표시 규칙 2개(역할 라벨·다음 등급 문구)만 `src/lib/bambi-native.ts`에 헬퍼+테스트로 둔다. 데이터는 기존 orpc 클라이언트(`orpc.bambi.onboarding.getMine`, `orpc.bambi.attendance.getMine/checkIn`)를 그대로 쓴다 — 서버·API 변경 없음, 마이그레이션 없음.

**Tech Stack:** Expo Router, heroui-native 1.0.4(ListGroup·Avatar·Skeleton·Surface·Button), @tanstack/react-query + orpc, better-auth expo 클라이언트.

**Spec:** 별도 스펙 문서 없음. 범위 합의(2026-09-01, 사용자 확정): **허브만 완성** — 하위 화면(신고 내역·글 관리·면접·차단·포인트 내역·쪽지함·계정 설정)은 이번에 만들지 않고, 메뉴에는 이미 존재하는 native 화면(알림 `/(seeker)/notifications`, 포인트몰 `/(seeker)/point-shop`)만 넣는다. 웹 기준 화면: `apps/web/src/components/bambi/my-page-shell.tsx`(ProfileCard·NAV_ITEMS)와 `apps/web/src/components/bambi/my-points-summary-card.tsx`(포인트 요약·출석).

## Global Constraints

- **작업 위치**: 워크트리 `C:\Users\user\projects\bambi-app\.claude\worktrees\native-mypage`(브랜치 `worktree-native-mypage`). 모든 명령은 워크트리 루트에서 실행한다.
- **빌드·실행 금지**: `expo start`·dev 서버 기동·에뮬레이터 실측 금지. 검증은 lint+타입체크+vitest까지만, 시각 확인은 사용자가 한다.
- **heroui-native는 native 문법만**: `heroui-native`에서 import, 컴파운드 컴포넌트(`ListGroup.Item`, `Avatar.Fallback`, `Button.Label`), 이벤트는 `onPress`. 웹 `@heroui/react` 패턴 금지. 설치본은 1.0.4이며 `ListGroup`·`Separator`·`Avatar`·`Skeleton` 모두 export 확인됨.
- **enum 원값 화면 노출 금지**: `bambiProfile.role` 원값(job_seeker 등)을 그대로 렌더하지 않는다 — Task 1의 `profileRoleLabel`만 경유.
- **임의 px 금지**: Tailwind 스케일 토큰만 사용(`p-4`, `gap-3`, `text-lg` …). `[Npx]` 임의값 금지.
- **primary 액션은 한 곳**: 이 화면에서 primary(기본 variant) Button은 "출석하기" 하나뿐. 로그아웃은 기존 `LogoutButton`(secondary) 재사용.
- **의존성 추가 금지**: 새 npm 패키지를 설치하지 않는다. 필요한 것은 전부 이미 설치돼 있다.
- **서버·DB 불변**: `packages/api`·`packages/db`를 수정하지 않는다.
- **커밋 메시지**: 한국어 `type: 제목` + 촘촘한 `- ` 블릿 본문(블릿 사이 빈 줄 없음). 여러 줄 메시지는 임시 파일에 쓰고 `git commit -F <파일>`(Bash 툴은 Git Bash이므로 PowerShell here-string 금지). 커밋 후 `git log -1 --format=%B`로 래퍼 문자 확인.
- **push·PR 금지**: 로컬 커밋까지만.

---

### Task 1: 표시 규칙 헬퍼 2종 (bambi-native.ts)

**Files:**
- Modify: `apps/native/src/lib/bambi-native.ts` (파일 끝에 추가)
- Test: `apps/native/src/lib/bambi-native.test.ts` (기존 파일 끝에 추가)

**Interfaces:**
- Consumes: 없음 (순수 함수)
- Produces: `profileRoleLabel(role: null | string | undefined): string`, `pointsToNextLabel(nextGrade: { minPoints: number; name: string } | null, pointsToNext: null | number): string` — Task 3·4의 me.tsx가 import한다.

- [ ] **Step 0: 워크트리 의존성 설치**

Run: `pnpm install` (워크트리 루트에서. 커밋 전 필수 — lefthook·lint가 워크트리 node_modules를 쓴다. `pnpm expo install`은 새 expo 의존성 추가용이므로 여기선 불필요)

- [ ] **Step 1: 실패하는 테스트 작성**

`apps/native/src/lib/bambi-native.test.ts` 파일 끝에 추가(상단 import 목록의 `groupDetailImageSlices` 등이 있는 `from "./bambi-native"` import에 `pointsToNextLabel, profileRoleLabel` 두 이름을 추가):

```ts
describe("profileRoleLabel", () => {
	it("등록된 역할은 한글 라벨로 바꾼다", () => {
		expect(profileRoleLabel("job_seeker")).toBe("구직자");
		expect(profileRoleLabel("employer")).toBe("구인자");
		expect(profileRoleLabel("admin")).toBe("관리자");
		expect(profileRoleLabel("legal_advisor")).toBe("법률자문가");
	});

	it("미등록·빈 역할은 구직자로 폴백한다", () => {
		expect(profileRoleLabel(null)).toBe("구직자");
		expect(profileRoleLabel(undefined)).toBe("구직자");
		expect(profileRoleLabel("unknown_role")).toBe("구직자");
	});
});

describe("pointsToNextLabel", () => {
	it("다음 등급이 있으면 남은 포인트를 천 단위 구분으로 보여준다", () => {
		expect(pointsToNextLabel({ minPoints: 5000, name: "골드" }, 1200)).toBe(
			"1,200P 남음"
		);
	});

	it("다음 등급이 없으면 최고 등급 문구를 보여준다", () => {
		expect(pointsToNextLabel(null, null)).toBe("최고 등급입니다");
	});
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `pnpm exec vitest run apps/native/src/lib/bambi-native.test.ts`
Expected: FAIL — `profileRoleLabel is not a function`(또는 export 없음 오류). 기존 테스트(groupDetailImageSlices 등)는 PASS 유지.

- [ ] **Step 3: 최소 구현**

`apps/native/src/lib/bambi-native.ts` 파일 끝에 추가:

```ts
// 역할 enum 원값을 화면에 내보내지 않는다 — 웹 my-page-shell의 ROLE_LABELS와 같은 표.
// 미등록 역할은 "구직자"로 폴백(법률자문 등 구직자 계정에 얹는 역할의 자연스러운 기본값).
const PROFILE_ROLE_LABELS: Record<string, string> = {
	admin: "관리자",
	employer: "구인자",
	job_seeker: "구직자",
	legal_advisor: "법률자문가",
};

export const profileRoleLabel = (role: null | string | undefined): string =>
	PROFILE_ROLE_LABELS[role ?? ""] ?? "구직자";

// 웹 MyPointsSummaryCard의 "다음 등급까지" 문구와 같은 규칙.
export const pointsToNextLabel = (
	nextGrade: { minPoints: number; name: string } | null,
	pointsToNext: null | number
): string =>
	nextGrade
		? `${(pointsToNext ?? 0).toLocaleString("ko-KR")}P 남음`
		: "최고 등급입니다";
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `pnpm exec vitest run apps/native/src/lib/bambi-native.test.ts`
Expected: PASS (기존 케이스 포함 전부)

- [ ] **Step 5: lint·타입체크**

Run: `pnpm exec ultracite check apps/native/src/lib/bambi-native.ts apps/native/src/lib/bambi-native.test.ts` (ultracite는 경로 인자가 없으면 0파일을 검사하므로 반드시 경로를 준다)
Run: `pnpm -F native check-types`
Expected: 둘 다 오류 없음

- [ ] **Step 6: 커밋**

커밋 메시지를 임시 파일에 쓰고 `git commit -F`로 커밋:

```
feat(native): 내 정보 허브용 역할 라벨·다음 등급 문구 헬퍼 추가
- profileRoleLabel: role enum 원값 노출 금지 규칙에 따라 한글 라벨 매핑, 미등록은 "구직자" 폴백
- pointsToNextLabel: 웹 MyPointsSummaryCard와 같은 "N,NNNP 남음"/"최고 등급입니다" 문구
- bambi-native.test.ts에 케이스 4건 추가
```

```bash
git add apps/native/src/lib/bambi-native.ts apps/native/src/lib/bambi-native.test.ts
git commit -F <임시파일>
git log -1 --format=%B
```

---

### Task 2: ProfileCard — 세션·프로필 연결

**Files:**
- Modify: `apps/native/app/(seeker)/(tabs)/me.tsx` (전면 재작성 1단계)

**Interfaces:**
- Consumes: `profileRoleLabel`(Task 1), `authClient.useSession()`(`@/lib/auth-client`), `orpc.bambi.onboarding.getMine`(출력: `{ bambiProfile: { role, isPhoneVerified, … } | null }`), `Pill`·`BambiHeader`·`BambiScreen`·`StateCard`(`@/src/components/bambi-screen`), `LogoutButton`
- Produces: `me.tsx` 내 로컬 컴포넌트 `function ProfileCard()` — Task 3·4가 같은 파일에서 화면 조립에 사용. 화면 순서는 헤더 → ProfileCard → (기존 StateCard 임시 유지) → LogoutButton.

- [ ] **Step 1: me.tsx를 다음 내용으로 재작성**

플레이스홀더 주석·StateCard 자리에 ProfileCard를 넣되, 포인트·메뉴가 아직 없으므로 StateCard는 문구만 남긴다(Task 4에서 제거). 전체 파일:

```tsx
import { useQuery } from "@tanstack/react-query";
import { Avatar, Skeleton, Surface } from "heroui-native";
import { Text, View } from "react-native";

import { authClient } from "@/lib/auth-client";
import {
	BambiHeader,
	BambiScreen,
	Pill,
	StateCard,
} from "@/src/components/bambi-screen";
import { LogoutButton } from "@/src/components/logout-button";
import { profileRoleLabel } from "@/src/lib/bambi-native";
import { orpc } from "@/src/lib/orpc";

// 프로필 아이덴티티 카드 — 표시명 정본은 세션 user.name(웹과 동일 규칙),
// 역할·본인인증 여부는 onboarding.getMine의 bambiProfile에서 온다.
function ProfileCard() {
	const session = authClient.useSession();
	const mineQuery = useQuery({
		...orpc.bambi.onboarding.getMine.queryOptions(),
		// enabled:false 구간에서 isLoading은 false지만 isPending은 true다(app/index.tsx와
		// 같은 함정) — (seeker) 그룹은 로그인 뒤에만 열리므로 스켈레톤이 계속 남지는 않는다.
		enabled: Boolean(session.data?.user),
	});
	const profile = mineQuery.data?.bambiProfile ?? null;
	const displayName = session.data?.user?.name?.trim() || "구직자 회원";
	const isPhoneVerified = Boolean(profile?.isPhoneVerified);

	if (session.isPending || mineQuery.isPending) {
		return <Skeleton className="h-20 rounded-lg" />;
	}

	return (
		<Surface
			className="flex-row items-center gap-3 rounded-lg p-4"
			variant="secondary"
		>
			<Avatar alt={`${displayName} 프로필 사진`} size="lg">
				{session.data?.user.image ? (
					<Avatar.Image source={{ uri: session.data.user.image }} />
				) : null}
				<Avatar.Fallback />
			</Avatar>
			<View className="min-w-0 flex-1 gap-1">
				<Text className="font-bold text-foreground text-lg" selectable>
					{displayName}
				</Text>
				<View className="flex-row flex-wrap items-center gap-2">
					<Text className="text-muted text-sm">
						{profileRoleLabel(profile?.role)}
					</Text>
					<Pill tone={isPhoneVerified ? "accent" : "neutral"}>
						{isPhoneVerified ? "인증완료" : "인증 필요"}
					</Pill>
				</View>
			</View>
		</Surface>
	);
}

export default function SeekerMeScreen() {
	return (
		<BambiScreen>
			<BambiHeader description="내 계정과 활동을 관리합니다." title="내 정보" />
			<ProfileCard />
			<StateCard
				description="포인트 요약과 메뉴를 준비하고 있어요."
				title="준비 중이에요"
			/>
			<View className="items-start">
				<LogoutButton />
			</View>
		</BambiScreen>
	);
}
```

- [ ] **Step 2: lint·타입체크**

Run: `pnpm exec ultracite check "apps/native/app/(seeker)/(tabs)/me.tsx"`
Run: `pnpm -F native check-types`
Expected: 오류 없음. 타입 오류가 나면 `bambiProfile` 필드명(`role`·`isPhoneVerified`)을 `packages/api/src/routers/bambi/onboarding.ts`의 getMine 반환에서 재확인하고 화면 쪽을 맞춘다(서버는 수정 금지).

- [ ] **Step 3: 기존 테스트 회귀 확인**

Run: `pnpm exec vitest run apps/native/src/lib/bambi-native.test.ts`
Expected: PASS

- [ ] **Step 4: 커밋**

```
feat(native): 내 정보 탭에 프로필 카드 연결
- 세션 user.name(정본)+onboarding.getMine으로 표시명·역할·본인인증 배지 렌더
- Avatar(이미지→기본 아이콘 폴백)+Surface secondary, 로딩은 Skeleton
- 역할 라벨은 profileRoleLabel 경유(enum 원값 노출 금지)
```

```bash
git add "apps/native/app/(seeker)/(tabs)/me.tsx"
git commit -F <임시파일>
git log -1 --format=%B
```

---

### Task 3: PointsSummaryCard — 포인트·등급 요약과 출석 체크

**Files:**
- Modify: `apps/native/app/(seeker)/(tabs)/me.tsx` (Task 2 결과에 추가)

**Interfaces:**
- Consumes: `pointsToNextLabel`(Task 1), `orpc.bambi.attendance.getMine`(입력 `{}`, 출력에 `checkedInToday: boolean`, `grade: { color; iconUrl; name } | null`, `nextGrade: { minPoints; name } | null`, `pointBalance: number`, `pointsToNext: number | null` 포함), `orpc.bambi.attendance.checkIn`(입력 `{}`, 출력에 `alreadyAttended: boolean`, `pointsAwarded: number` 포함), `queryClient`(`@/src/lib/orpc`)
- Produces: `me.tsx` 내 로컬 컴포넌트 `function PointsSummaryCard()` — Task 4의 최종 조립에서 ProfileCard 아래에 놓인다.

- [ ] **Step 1: me.tsx에 PointsSummaryCard 추가**

import 블록을 다음으로 갱신(추가분: `useMutation`, `Button`, `Alert`, `pointsToNextLabel`, `queryClient`):

```tsx
import { useMutation, useQuery } from "@tanstack/react-query";
import { Avatar, Button, Skeleton, Surface } from "heroui-native";
import { Alert, Text, View } from "react-native";

import { authClient } from "@/lib/auth-client";
import {
	BambiHeader,
	BambiScreen,
	Pill,
	StateCard,
} from "@/src/components/bambi-screen";
import { LogoutButton } from "@/src/components/logout-button";
import {
	pointsToNextLabel,
	profileRoleLabel,
} from "@/src/lib/bambi-native";
import { orpc, queryClient } from "@/src/lib/orpc";
```

ProfileCard 아래에 컴포넌트 추가:

```tsx
// 포인트·등급 요약 + 출석 체크 — 웹 MyPointsSummaryCard의 native 이식.
// 출석 상세 화면이 native에 아직 없어 카드 본문은 눌리지 않고 출석 버튼만 동작한다.
// (seeker) 그룹에는 job_seeker만 들어오므로(app/index.tsx 라우팅) 역할 게이트는 두지
// 않는다 — 서버(protectedProcedure+역할 검사)가 최종 방어선이고, 실패하면 아래
// StateCard 폴백으로 떨어진다.
function PointsSummaryCard() {
	const mineQuery = useQuery(
		orpc.bambi.attendance.getMine.queryOptions({ input: {} })
	);
	const checkIn = useMutation(
		orpc.bambi.attendance.checkIn.mutationOptions({
			onError: (error) => {
				Alert.alert(
					"출석하지 못했어요",
					error.message || "잠시 후 다시 시도해 주세요."
				);
			},
			onSuccess: async (result) => {
				Alert.alert(
					"출석 체크",
					result.alreadyAttended
						? "오늘은 이미 출석했어요."
						: `출석했어요. +${result.pointsAwarded} 포인트 적립!`
				);
				await queryClient.invalidateQueries({
					queryKey: orpc.bambi.attendance.getMine.key(),
				});
			},
		})
	);

	if (mineQuery.isPending) {
		return <Skeleton className="h-24 rounded-lg" />;
	}

	if (mineQuery.isError || !mineQuery.data) {
		return (
			<StateCard
				description="로그인 상태와 네트워크 연결을 확인해 주세요."
				title="포인트 정보를 불러오지 못했어요"
			/>
		);
	}

	const { checkedInToday, grade, nextGrade, pointBalance, pointsToNext } =
		mineQuery.data;

	return (
		<Surface className="gap-4 rounded-lg p-4" variant="secondary">
			<View className="flex-row gap-3">
				<View className="flex-1 gap-1">
					<Text className="text-muted text-xs">포인트</Text>
					<Text
						className="font-extrabold text-accent text-base"
						selectable
					>
						{pointBalance.toLocaleString("ko-KR")}P
					</Text>
				</View>
				<View className="flex-1 gap-1">
					<Text className="text-muted text-xs">등급</Text>
					{grade ? (
						<Pill tone="accent">{grade.name}</Pill>
					) : (
						<Pill tone="neutral">등급 없음</Pill>
					)}
				</View>
				<View className="flex-1 gap-1">
					<Text className="text-muted text-xs">다음 등급까지</Text>
					<Text className="text-foreground text-sm" selectable>
						{pointsToNextLabel(nextGrade, pointsToNext)}
					</Text>
				</View>
			</View>
			<Button
				isDisabled={checkedInToday || checkIn.isPending}
				onPress={() => checkIn.mutate({})}
				size="sm"
			>
				<Button.Label>
					{checkedInToday ? "출석 완료" : "출석하기"}
				</Button.Label>
			</Button>
		</Surface>
	);
}
```

`SeekerMeScreen`에서 `<ProfileCard />` 바로 아래에 `<PointsSummaryCard />`를 추가한다(StateCard "준비 중이에요"는 아직 유지 — 메뉴 자리).

- [ ] **Step 2: lint·타입체크**

Run: `pnpm exec ultracite check "apps/native/app/(seeker)/(tabs)/me.tsx"`
Run: `pnpm -F native check-types`
Expected: 오류 없음. `getMine.key()`·`mutationOptions` 시그니처가 타입 오류를 내면 웹 소비처 `apps/web/src/components/bambi/my-points-summary-card.tsx`와 동일 형태로 맞춘다.

- [ ] **Step 3: 커밋**

```
feat(native): 내 정보 탭에 포인트·등급 요약과 출석 체크 연결
- attendance.getMine으로 보유 포인트·등급·다음 등급까지 3열 요약(웹 MyPointsSummaryCard 이식)
- checkIn 뮤테이션+Alert 피드백, 성공 시 getMine 무효화·오늘 출석이면 버튼 비활성("출석 완료")
- 출석 상세 화면이 없어 카드 본문 내비게이션은 미연결, 실패 시 StateCard 폴백
- primary 버튼은 이 화면에서 출석하기 하나만
```

```bash
git add "apps/native/app/(seeker)/(tabs)/me.tsx"
git commit -F <임시파일>
git log -1 --format=%B
```

---

### Task 4: ListGroup 메뉴 + 최종 조립·검증

**Files:**
- Modify: `apps/native/app/(seeker)/(tabs)/me.tsx` (Task 3 결과에 추가, StateCard 플레이스홀더 제거)

**Interfaces:**
- Consumes: `ListGroup`·`Separator`·`useThemeColor`(heroui-native), `Ionicons`(`@expo/vector-icons`), `router`·`Href`(expo-router), 기존 native 라우트 `/(seeker)/notifications`·`/(seeker)/point-shop`
- Produces: 완성된 `SeekerMeScreen` — 헤더 → ProfileCard → PointsSummaryCard → MeMenu → LogoutButton.

- [ ] **Step 1: MeMenu 추가·최종 조립**

import 블록에 추가:

```tsx
import { Ionicons } from "@expo/vector-icons";
import { type Href, router } from "expo-router";
import {
	Avatar,
	Button,
	ListGroup,
	Separator,
	Skeleton,
	Surface,
	useThemeColor,
} from "heroui-native";
import { Fragment } from "react";
```

컴포넌트 추가(허브 범위 합의에 따라 native에 실제 화면이 있는 항목만 — 하위 화면이 생기면 이 배열에 행을 추가한다):

```tsx
// 허브 메뉴 — 이미 존재하는 native 화면만 넣는다(범위 합의: 하위 화면 신규 제작 없음).
// 웹 NAV_ITEMS의 나머지 항목(신고 내역·글 관리·면접·차단·포인트 내역·쪽지함·계정 설정)은
// native 화면이 생길 때 이 배열에 행을 추가하는 것으로 충분하다.
const MENU_ITEMS = [
	{
		description: "새 소식과 받은 알림을 확인해요.",
		href: "/(seeker)/notifications" as unknown as Href,
		icon: "notifications-outline" as const,
		label: "알림",
	},
	{
		description: "모은 포인트로 아이템을 구매해요.",
		href: "/(seeker)/point-shop" as unknown as Href,
		icon: "gift-outline" as const,
		label: "포인트몰",
	},
];

function MeMenu() {
	const foregroundColor = useThemeColor("foreground");

	return (
		<ListGroup>
			{MENU_ITEMS.map((item, index) => (
				<Fragment key={item.label}>
					{index > 0 ? <Separator className="mx-4" /> : null}
					<ListGroup.Item
						accessibilityLabel={`${item.label} — ${item.description}`}
						accessibilityRole="button"
						onPress={() => router.push(item.href)}
					>
						<ListGroup.ItemPrefix>
							<Ionicons
								color={foregroundColor}
								name={item.icon}
								size={22}
							/>
						</ListGroup.ItemPrefix>
						<ListGroup.ItemContent>
							<ListGroup.ItemTitle>{item.label}</ListGroup.ItemTitle>
							<ListGroup.ItemDescription>
								{item.description}
							</ListGroup.ItemDescription>
						</ListGroup.ItemContent>
						<ListGroup.ItemSuffix />
					</ListGroup.Item>
				</Fragment>
			))}
		</ListGroup>
	);
}
```

`SeekerMeScreen`을 최종 형태로 교체 — StateCard "준비 중이에요" 제거(이 시점부터 `StateCard` import는 PointsSummaryCard 폴백에서만 쓰인다):

```tsx
export default function SeekerMeScreen() {
	return (
		<BambiScreen>
			<BambiHeader description="내 계정과 활동을 관리합니다." title="내 정보" />
			<ProfileCard />
			<PointsSummaryCard />
			<MeMenu />
			<View className="items-start">
				<LogoutButton />
			</View>
		</BambiScreen>
	);
}
```

- [ ] **Step 2: 최종 검증(lint·타입·테스트)**

Run: `pnpm exec ultracite check "apps/native/app/(seeker)/(tabs)/me.tsx" apps/native/src/lib/bambi-native.ts apps/native/src/lib/bambi-native.test.ts`
Run: `pnpm -F native check-types`
Run: `pnpm exec vitest run apps/native/src/lib/bambi-native.test.ts`
Expected: 전부 오류 없음·PASS. `ListGroup.Item`이 `onPress`/접근성 props에서 타입 오류를 내면 설치본 타입 정의(`node_modules/.pnpm/heroui-native@1.0.4_*/node_modules/heroui-native/lib/typescript/components/list-group`)를 열어 실제 prop 이름을 확인해 맞춘다(문서상 Item은 Pressable 기반).

- [ ] **Step 3: 커밋**

```
feat(native): 내 정보 탭 허브 완성 — ListGroup 메뉴·최종 조립
- heroui-native ListGroup(Item/Prefix/Content/Title/Description/Suffix)으로 알림·포인트몰 메뉴, 항목 사이 Separator
- 항목 전체가 스크린리더 단일 버튼(accessibilityLabel), 탭 시 기존 native 라우트로 push
- "준비 중이에요" 플레이스홀더 제거, 화면 순서 헤더→프로필→포인트 요약→메뉴→로그아웃
- 하위 화면(신고·글 관리·면접·차단·포인트 내역·쪽지함·계정 설정)은 범위 합의대로 후속 — 화면 생기면 MENU_ITEMS에 행 추가
```

```bash
git add "apps/native/app/(seeker)/(tabs)/me.tsx"
git commit -F <임시파일>
git log -1 --format=%B
```

---

## 실행 후 잔여(계획 밖, 보고만)

- 시각 확인(라이트/다크·실기기)은 사용자가 한다 — 에뮬레이터 실측 금지.
- 워크트리 → `feat/native-mypage` no-ff `merge:` 병합·정리는 컨트롤러(본 세션)가 병합 직전 현재 브랜치 확인 후 수행. push·PR은 사용자 지시 대기.
