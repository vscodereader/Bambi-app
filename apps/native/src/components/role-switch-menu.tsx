import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { type Href, router } from "expo-router";
import { Menu, useThemeColor } from "heroui-native";
import type { ReactElement } from "react";
import { Pressable } from "react-native";

import { authClient } from "@/lib/auth-client";
import {
	getNativeAreaOptions,
	getNativeAreaSwitchAction,
	type NativeAreaRoute,
	type NativeProfileRole,
	type NativeRoleAreaRoute,
} from "@/src/lib/bambi-native";
import { orpc } from "@/src/lib/orpc";

const MENU_WIDTH = 220;

// 역할 영역(구인자·운영자) 헤더 우측의 화면 전환 메뉴. 역할 영역은 루트 스택에 push된
// 별도 탭 셸이라 뒤로 버튼도, 구직자 라우트를 가리키는 탭도 없다 — 이 메뉴가 유일한
// 출구다. 역할은 소비자가 알려주지 않고 스스로 조회한다(헤더마다 조회를 얹지 않게).
export function RoleSwitchMenu({
	currentArea,
}: {
	currentArea: NativeRoleAreaRoute;
}): ReactElement | null {
	const foreground = useThemeColor("foreground");
	const session = authClient.useSession();
	const mineQuery = useQuery({
		...orpc.bambi.onboarding.getMine.queryOptions(),
		enabled: Boolean(session.data?.user),
	});
	// 지금 있는 영역은 갈 곳이 아니므로 목록에서 뺀다 — 보통 구인자·운영자 영역에선
	// "메인 공고 화면으로 이동" 하나만 남는다(admin이 구인자 영역에 있으면 현재 영역이
	// 애초에 자기 목록에 없어 두 개가 남을 수 있는데, 그건 정상이라 그대로 둔다).
	const targets = getNativeAreaOptions(
		mineQuery.data?.bambiProfile?.role as NativeProfileRole | null | undefined
	).filter((option) => option.href !== currentArea);

	// 조회 중이거나 나갈 곳이 없으면 아무것도 그리지 않는다. 헤더의 보조 컨트롤이라
	// 스켈레톤을 깜빡이는 것보다 늦게 나타나는 편이 낫다.
	if (targets.length === 0) {
		return null;
	}

	const handleSelect = (href: NativeAreaRoute) => {
		if (href !== "/(seeker)") {
			router.push(href as Href);
			return;
		}

		// back()이 아니라 dismissTo를 쓴다 — back은 한 칸만 물러나서 역할 영역 안쪽(공고
		// 편집 등)에서 누르면 같은 영역의 이전 화면으로 갈 뿐이다. dismissTo는 구직자
		// 화면이 나올 때까지 되감아 "구직자 화면으로 나간다"는 의도를 그대로 표현한다.
		if (getNativeAreaSwitchAction(router.canGoBack()) === "back") {
			router.dismissTo(href as Href);
			return;
		}

		router.replace(href as Href);
	};

	return (
		<Menu>
			<Menu.Trigger asChild>
				{/* 헤더 우측의 보조 컨트롤. 아이콘만 담되 터치 타깃은 48dp(h-12 w-12)를 지킨다. */}
				<Pressable
					accessibilityLabel="화면 전환 메뉴"
					accessibilityRole="button"
					className="h-12 w-12 items-center justify-center rounded-2xl active:opacity-75"
				>
					<Ionicons color={foreground} name="ellipsis-horizontal" size={24} />
				</Pressable>
			</Menu.Trigger>
			<Menu.Portal>
				<Menu.Overlay />
				{/* 트리거가 헤더 오른쪽 끝이라 end 정렬이 아니면 화면 밖으로 밀린다. */}
				<Menu.Content align="end" presentation="popover" width={MENU_WIDTH}>
					{targets.map((option) => (
						<Menu.Item
							key={option.href}
							onPress={() => handleSelect(option.href)}
						>
							<Menu.ItemTitle>{option.title}</Menu.ItemTitle>
						</Menu.Item>
					))}
				</Menu.Content>
			</Menu.Portal>
		</Menu>
	);
}
