# Seeker 네이티브 홈 셸(헤더 + 하단 탭) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 네이티브 앱 seeker 영역에 웹 모바일 셸과 같은 상단 헤더(로고 타일+워드마크 / 검색·포인트몰·알림 아이콘)와 하단 탭바(탐색·채팅·수다방·내 정보)를 붙인다. **UI 작업만** — 검색·포인트몰·알림·수다방·내 정보의 실제 기능 연결은 후속.

**Architecture:** `app/(seeker)`를 Stack 단일 구조에서 `Stack → (tabs) 그룹(Tabs) + 상세 화면들` 이중 구조로 재편한다. 탭 4개(index=탐색, chats=채팅, community=수다방, me=내 정보)는 `(seeker)/(tabs)/` 아래에 두고, 풀스크린이어야 하는 상세(공고 상세·채팅방·연락처 공개)는 기존처럼 `(seeker)/` Stack 레벨에 남긴다(웹도 채팅방에서는 탭바를 숨긴다 — `persona-nav.tsx`의 SeekerNav 주석 참고). 헤더는 Tabs `screenOptions.header`로 한 번만 지정해 4개 탭이 공유한다.

**Tech Stack:** expo-router(~56) `Tabs`, heroui-native `useThemeColor` 테마 토큰, `@expo/vector-icons` Ionicons, uniwind(className). **새 의존성 없음.**

**Spec:** 별도 스펙 문서 없음. 요구사항은 사용자가 준 웹 모바일 스크린샷 기준:
- 헤더 왼쪽: 로고 아이콘(기존 `BambiLogo` 코랄 타일) + 워드마크 "밤비알바"
- 헤더 오른쪽: 검색, 포인트몰, 알림 아이콘 (이번 단계에서는 눌러도 동작하지 않음)
- 하단 탭: 탐색 / 채팅 / 수다방 / 내 정보 (웹 `mobile-tab-bar.tsx`와 동일 라벨)
- 수다방·내 정보는 화면이 아직 없으므로 "준비 중" 플레이스홀더 화면 신설

## Global Constraints

- 워크트리에서 첫 커밋 전 반드시 `pnpm install` 실행(lefthook·node_modules 준비). 이미 했다면 생략.
- **빌드·dev 서버 실행 금지**(`.claude/rules/no-build-or-run.md`). 검증은 타입체크+린트만, 시각 확인은 사용자가 한다.
- 임의 px 클래스(`h-[56px]` 등) 금지 — Tailwind 스케일 토큰만(`h-14` 등). 색은 시맨틱 토큰만(`bg-background`, `text-foreground`, `border-border`), raw hex 금지. JS에서 색이 필요하면 `useThemeColor("accent" | "muted" | "background" | "border" | "foreground" | "accent-foreground")` 사용(전부 `apps/native/global.css`에 정의돼 있음).
- primary(코랄) 강조는 활성 탭 틴트에만. 내비 버튼을 primary로 칠하지 않는다.
- 커밋 메시지는 한국어 `type:` 제목 + 촘촘한 `- ` 블릿 본문(블릿 사이 빈 줄 없음). Bash 툴에서 PowerShell here-string(`@'...'@`) 금지 — `git commit -F- <<'EOF'` heredoc 사용.
- 검증 명령(워크트리 루트 `C:\Users\user\projects\bambi-app\.claude\worktrees\seeker-native-home-shell`에서):
  - 타입: `pnpm --filter native check-types`
  - 린트: `pnpm exec ultracite fix apps/native/app apps/native/src` — **경로 인자 필수**(안 주면 0파일 검사)
- 이 변경은 렌더 전용이라 새 단위 테스트는 만들지 않는다(로직 없음). 기존 `apps/native/src/lib/bambi-native.test.ts`는 건드리지 않는다 — `"/(seeker)"` 라우트 문자열은 재편 후에도 유효하다(그룹의 initial route가 `(tabs)/index`로 이어짐).

---

### Task 1: SeekerHomeHeader 컴포넌트

**Files:**
- Create: `apps/native/src/components/seeker-header.tsx`

**Interfaces:**
- Consumes: `BambiLogo`(`@/src/components/bambi-logo`, props 없음), `useThemeColor`(heroui-native)
- Produces: `export function SeekerHomeHeader(): ReactElement` — props 없음. Task 2의 Tabs `screenOptions.header`가 그대로 렌더한다.

- [ ] **Step 1: (최초 1회) 워크트리 의존성 설치**

```bash
cd "C:/Users/user/projects/bambi-app/.claude/worktrees/seeker-native-home-shell" && pnpm install
```

- [ ] **Step 2: 컴포넌트 작성**

`apps/native/src/components/seeker-header.tsx` 전체 내용:

```tsx
import { Ionicons } from "@expo/vector-icons";
import { useThemeColor } from "heroui-native";
import type { ComponentProps } from "react";
import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BambiLogo } from "@/src/components/bambi-logo";

// 아직 연결된 화면이 없는 자리 표시 버튼 — 비활성으로 렌더한다.
// ponytail: 검색·포인트몰·알림 화면이 생기면 onPress 라우팅을 연결하고 disabled를 푼다.
function HeaderIconButton({
	label,
	name,
}: {
	label: string;
	name: ComponentProps<typeof Ionicons>["name"];
}) {
	const foreground = useThemeColor("foreground");

	return (
		<Pressable
			accessibilityLabel={label}
			accessibilityRole="button"
			accessibilityState={{ disabled: true }}
			className="h-11 w-11 items-center justify-center rounded-full"
			disabled
		>
			<Ionicons color={foreground} name={name} size={22} />
		</Pressable>
	);
}

// 웹 모바일 헤더(responsive-shell.tsx)의 네이티브판 — 로고+워드마크 / 검색·포인트몰·알림.
// Tabs의 커스텀 header로 쓰이므로 상단 안전영역 인셋을 스스로 채운다.
export function SeekerHomeHeader() {
	const insets = useSafeAreaInsets();

	return (
		<View
			className="border-border border-b bg-background"
			style={{ paddingTop: insets.top }}
		>
			<View className="h-14 flex-row items-center justify-between px-4">
				<View className="flex-row items-center gap-2">
					<BambiLogo />
					<Text className="font-extrabold text-foreground text-xl">
						밤비알바
					</Text>
				</View>
				{/* 아이콘 버튼이 각자 44dp(h-11) 터치 영역을 가지므로 사이 gap은 두지 않는다. */}
				<View className="flex-row items-center">
					<HeaderIconButton label="공고 검색" name="search-outline" />
					<HeaderIconButton label="포인트몰" name="storefront-outline" />
					<HeaderIconButton label="알림" name="notifications-outline" />
				</View>
			</View>
		</View>
	);
}
```

- [ ] **Step 3: 검증**

```bash
cd "C:/Users/user/projects/bambi-app/.claude/worktrees/seeker-native-home-shell" && pnpm --filter native check-types && pnpm exec ultracite fix apps/native/src/components/seeker-header.tsx
```

Expected: 타입 오류 0건, ultracite가 파일 1개 검사(0파일이면 경로 인자 누락).

- [ ] **Step 4: 커밋**

```bash
cd "C:/Users/user/projects/bambi-app/.claude/worktrees/seeker-native-home-shell" && git add apps/native/src/components/seeker-header.tsx && git commit -F- <<'EOF'
feat(native): seeker 홈 헤더 컴포넌트 추가
- 로고 타일+밤비알바 워드마크, 우측 검색·포인트몰·알림 아이콘(비활성 자리 표시)
- Tabs 커스텀 header용으로 상단 안전영역 인셋을 자체 처리
EOF
```

---

### Task 2: (tabs) 그룹 재편 — Tabs 레이아웃 + 수다방·내 정보 화면

**Files:**
- Create: `apps/native/app/(seeker)/(tabs)/_layout.tsx`
- Create: `apps/native/app/(seeker)/(tabs)/community.tsx`
- Create: `apps/native/app/(seeker)/(tabs)/me.tsx`
- Move: `apps/native/app/(seeker)/index.tsx` → `apps/native/app/(seeker)/(tabs)/index.tsx` (내용 수정 없음, `git mv`)
- Move: `apps/native/app/(seeker)/chats/index.tsx` → `apps/native/app/(seeker)/(tabs)/chats.tsx` (내용 수정 없음, `git mv`)
- Modify: `apps/native/app/(seeker)/_layout.tsx` (전체 교체)

**Interfaces:**
- Consumes: Task 1의 `SeekerHomeHeader`(props 없음), 기존 `BambiHeader`/`BambiScreen`/`StateCard`(`@/src/components/bambi-screen` — `BambiHeader`는 `{ title: string; description?: string }`, `StateCard`는 `{ title: string; description: string; action?: ReactNode }`), `LogoutButton`(`@/src/components/logout-button`, props 없음)
- Produces: 라우트 `/(seeker)/(tabs)/index|chats|community|me`. 상세 라우트(`jobs/[id]`, `chats/[id]`, `chats/[id]/reveal`)는 종전 경로 그대로. 기존 href 문자열 `"/(seeker)"`(onboarding·bambi-native.ts)와 `"/(seeker)/chats/[id]"`(채팅 목록 카드)는 수정 없이 유효.

- [ ] **Step 1: 화면 파일 이동**

```bash
cd "C:/Users/user/projects/bambi-app/.claude/worktrees/seeker-native-home-shell" && mkdir -p "apps/native/app/(seeker)/(tabs)" && git mv "apps/native/app/(seeker)/index.tsx" "apps/native/app/(seeker)/(tabs)/index.tsx" && git mv "apps/native/app/(seeker)/chats/index.tsx" "apps/native/app/(seeker)/(tabs)/chats.tsx"
```

- [ ] **Step 2: Tabs 레이아웃 작성**

`apps/native/app/(seeker)/(tabs)/_layout.tsx` 전체 내용:

```tsx
import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import { useThemeColor } from "heroui-native";
import type { ComponentProps } from "react";

import { SeekerHomeHeader } from "@/src/components/seeker-header";

// 활성 탭은 채운 글리프, 비활성은 outline — 색 틴트 단독으로 상태를 전달하지 않는다.
function tabIcon(
	active: ComponentProps<typeof Ionicons>["name"],
	inactive: ComponentProps<typeof Ionicons>["name"]
) {
	return ({
		color,
		focused,
		size,
	}: {
		color: string;
		focused: boolean;
		size: number;
	}) => (
		<Ionicons color={color} name={focused ? active : inactive} size={size} />
	);
}

export default function SeekerTabsLayout() {
	const accentColor = useThemeColor("accent");
	const mutedColor = useThemeColor("muted");
	const backgroundColor = useThemeColor("background");
	const borderColor = useThemeColor("border");

	return (
		<Tabs
			screenOptions={{
				header: () => <SeekerHomeHeader />,
				tabBarActiveTintColor: accentColor,
				tabBarInactiveTintColor: mutedColor,
				tabBarStyle: {
					backgroundColor,
					borderTopColor: borderColor,
				},
			}}
		>
			<Tabs.Screen
				name="index"
				options={{
					tabBarIcon: tabIcon("search", "search-outline"),
					title: "탐색",
				}}
			/>
			<Tabs.Screen
				name="chats"
				options={{
					tabBarIcon: tabIcon(
						"chatbubble-ellipses",
						"chatbubble-ellipses-outline"
					),
					title: "채팅",
				}}
			/>
			<Tabs.Screen
				name="community"
				options={{
					tabBarIcon: tabIcon("chatbubbles", "chatbubbles-outline"),
					title: "수다방",
				}}
			/>
			<Tabs.Screen
				name="me"
				options={{
					tabBarIcon: tabIcon("person", "person-outline"),
					title: "내 정보",
				}}
			/>
		</Tabs>
	);
}
```

- [ ] **Step 3: 수다방 플레이스홀더 작성**

`apps/native/app/(seeker)/(tabs)/community.tsx` 전체 내용:

```tsx
import {
	BambiHeader,
	BambiScreen,
	StateCard,
} from "@/src/components/bambi-screen";

// UI 단계 자리 표시 화면. ponytail: 수다방 기능이 붙으면 이 화면을 통째로 교체한다.
export default function SeekerCommunityScreen() {
	return (
		<BambiScreen>
			<BambiHeader
				description="구직자들과 이야기를 나누는 공간입니다."
				title="수다방"
			/>
			<StateCard
				description="수다방을 준비하고 있어요. 조금만 기다려 주세요."
				title="준비 중이에요"
			/>
		</BambiScreen>
	);
}
```

- [ ] **Step 4: 내 정보 플레이스홀더 작성**

`apps/native/app/(seeker)/(tabs)/me.tsx` 전체 내용:

```tsx
import { View } from "react-native";

import {
	BambiHeader,
	BambiScreen,
	StateCard,
} from "@/src/components/bambi-screen";
import { LogoutButton } from "@/src/components/logout-button";

// UI 단계 자리 표시 화면. 탐색 헤더에 있던 로그아웃의 새 자리이기도 하다.
// ponytail: 프로필·활동 내역이 붙으면 StateCard를 실제 섹션으로 교체한다.
export default function SeekerMeScreen() {
	return (
		<BambiScreen>
			<BambiHeader description="내 계정과 활동을 관리합니다." title="내 정보" />
			<StateCard
				description="프로필과 활동 내역 화면을 준비하고 있어요."
				title="준비 중이에요"
			/>
			<View className="items-start">
				<LogoutButton />
			</View>
		</BambiScreen>
	);
}
```

- [ ] **Step 5: Stack 레이아웃 교체**

`apps/native/app/(seeker)/_layout.tsx` 전체 내용(교체):

```tsx
import { Stack } from "expo-router";

// 탭 4개는 (tabs) 그룹이 관리하고, 여기는 탭바 없이 풀스크린으로 떠야 하는 상세만 남긴다
// (웹 SeekerNav와 같은 규칙 — 채팅방은 카카오톡식 풀스크린이라 탭바를 숨긴다).
export default function SeekerLayout() {
	return (
		<Stack>
			<Stack.Screen name="(tabs)" options={{ headerShown: false }} />
			<Stack.Screen name="jobs/[id]" options={{ title: "공고 상세" }} />
			<Stack.Screen name="chats/[id]" options={{ title: "채팅방" }} />
			<Stack.Screen
				name="chats/[id]/reveal"
				options={{ title: "연락처 공개" }}
			/>
		</Stack>
	);
}
```

- [ ] **Step 6: 검증**

```bash
cd "C:/Users/user/projects/bambi-app/.claude/worktrees/seeker-native-home-shell" && pnpm --filter native check-types && pnpm exec ultracite fix "apps/native/app/(seeker)"
```

Expected: 타입 오류 0건. (`(tabs)/index.tsx`·`(tabs)/chats.tsx`는 내용 무수정 이동이라 diff가 rename으로만 잡히는지 `git status`로 확인.)

- [ ] **Step 7: 커밋**

```bash
cd "C:/Users/user/projects/bambi-app/.claude/worktrees/seeker-native-home-shell" && git add "apps/native/app/(seeker)" && git commit -F- <<'EOF'
feat(native): seeker 영역을 하단 탭 구조로 재편
- (tabs) 그룹 신설: 탐색·채팅·수다방·내 정보 4탭, 공용 SeekerHomeHeader 장착
- 탐색·채팅 목록 화면을 (tabs) 아래로 이동(내용 무수정), 상세 라우트는 Stack에 유지
- 수다방·내 정보는 준비 중 플레이스홀더 화면으로 신설(내 정보에 로그아웃 배치)
EOF
```

---

### Task 3: 탐색 화면 헤더 정리(채팅 버튼·로그아웃 제거)

**Files:**
- Modify: `apps/native/app/(seeker)/(tabs)/index.tsx` (Task 2에서 이동된 파일 — 옛 경로 `(seeker)/index.tsx`)

**Interfaces:**
- Consumes: 없음(자체 정리)
- Produces: `SeekerListHeader`에서 우측 액션(채팅 링크·LogoutButton)이 사라지고 총 개수+스피너 행만 남는다. 채팅 진입은 하단 탭이, 로그아웃은 내 정보 탭이 전담.

- [ ] **Step 1: 우측 액션 제거**

`(tabs)/index.tsx`의 `SeekerListHeader` 안에서 아래 블록을:

```tsx
			<View className="flex-row items-center justify-between gap-3 px-4">
				<View className="flex-1 flex-row items-center gap-2">
					{availableCount === undefined ? null : (
						<Text
							accessibilityLiveRegion="polite"
							className="text-muted text-sm"
						>
							{`총 ${availableCount.toLocaleString("ko-KR")}개`}
						</Text>
					)}
					{isFilterPending ? <Spinner size="sm" /> : null}
				</View>
				<View className="flex-row gap-2">
					<Link asChild href={"/(seeker)/chats" as Href}>
						<Button size="sm" variant="tertiary">
							<Button.Label>채팅</Button.Label>
						</Button>
					</Link>
					<LogoutButton />
				</View>
			</View>
```

다음으로 교체(채팅·로그아웃은 이제 탭바·내 정보 탭이 담당):

```tsx
			<View className="flex-row items-center gap-2 px-4">
				{availableCount === undefined ? null : (
					<Text
						accessibilityLiveRegion="polite"
						className="text-muted text-sm"
					>
						{`총 ${availableCount.toLocaleString("ko-KR")}개`}
					</Text>
				)}
				{isFilterPending ? <Spinner size="sm" /> : null}
			</View>
```

- [ ] **Step 2: 불필요해진 import 제거**

같은 파일 상단에서:
- `import { type Href, Link } from "expo-router";` → `import type { Href } from "expo-router";` (`Href`는 `JobRow`·`CardLink` href 캐스팅에 여전히 필요, `Link`만 제거)
- `import { LogoutButton } from "@/src/components/logout-button";` 줄 삭제
- `Button`은 배너·푸터·빈 상태에서 계속 쓰므로 heroui-native import에 그대로 둔다.

- [ ] **Step 3: 검증**

```bash
cd "C:/Users/user/projects/bambi-app/.claude/worktrees/seeker-native-home-shell" && pnpm --filter native check-types && pnpm exec ultracite fix "apps/native/app/(seeker)/(tabs)/index.tsx"
```

Expected: 타입 오류 0건(미사용 import가 남으면 ultracite가 잡는다).

- [ ] **Step 4: 커밋**

```bash
cd "C:/Users/user/projects/bambi-app/.claude/worktrees/seeker-native-home-shell" && git add "apps/native/app/(seeker)/(tabs)/index.tsx" && git commit -F- <<'EOF'
fix(native): 탐색 목록 헤더의 채팅·로그아웃 버튼 제거
- 채팅 진입은 하단 탭, 로그아웃은 내 정보 탭으로 이관돼 중복 제거
- 총 개수·필터 스피너 행만 유지
EOF
```

---

## 마무리(사용자 확인 대기)

- 빌드·실행 금지 규칙에 따라 시각 확인(헤더 인셋, 탭 아이콘, 다크 테마, `"/(seeker)"` replace 진입이 탐색 탭에 안착하는지)은 사용자가 에뮬레이터에서 한다.
- 병합·push는 사용자 지시 전까지 하지 않는다. 완료 시 브랜치(`worktree-seeker-native-home-shell`)와 커밋 3개를 보고하고 대기.
