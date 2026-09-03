import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { type Href, router } from "expo-router";
import { Menu, useThemeColor } from "heroui-native";
import type { ReactElement } from "react";
import { Pressable, Text } from "react-native";

import { authClient } from "@/lib/auth-client";
import {
	getNativeAreaOptions,
	getNativeAreaSwitchAction,
	type NativeAreaRoute,
	type NativeProfileRole,
	type NativeRoleAreaRoute,
} from "@/src/lib/bambi-native";
import { orpc } from "@/src/lib/orpc";

const MENU_WIDTH = 200;

// 전환할 곳이 하나뿐이면(=현재 화면만) 메뉴가 할 일이 없다.
const MIN_SWITCHABLE_AREAS = 2;

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
	const options = getNativeAreaOptions(
		mineQuery.data?.bambiProfile?.role as NativeProfileRole | null | undefined
	);

	// 조회 중이거나 전환할 곳이 없으면 아무것도 그리지 않는다. 헤더의 보조 컨트롤이라
	// 스켈레톤을 깜빡이는 것보다 늦게 나타나는 편이 낫다.
	if (options.length < MIN_SWITCHABLE_AREAS) {
		return null;
	}

	const handleSelect = (href: NativeAreaRoute) => {
		// 현재 영역은 선택 표시만 하고 아무 데도 가지 않는다(메뉴만 닫힌다).
		if (href === currentArea) {
			return;
		}

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

	// 운영자는 구인자 영역에도 들어갈 수 있어(EmployerLayout이 admin을 통과시킨다) 현재
	// 영역이 자기 목록에 없을 수 있다 — 그때는 이름 대신 메뉴의 용도를 그대로 쓴다.
	const currentTitle =
		options.find((option) => option.href === currentArea)?.title ?? "화면 전환";

	return (
		<Menu>
			<Menu.Trigger asChild>
				{/* 헤더 안에 들어가는 보조 컨트롤이라 폭은 글자에 맞추되, 높이는 48dp를 지킨다. */}
				<Pressable
					accessibilityLabel="화면 전환"
					accessibilityRole="button"
					className="h-12 flex-row items-center gap-1 rounded-2xl border border-border bg-surface px-3 active:opacity-75"
					hitSlop={8}
				>
					<Text className="font-medium text-foreground text-sm">
						{currentTitle}
					</Text>
					<Ionicons color={foreground} name="chevron-down" size={16} />
				</Pressable>
			</Menu.Trigger>
			<Menu.Portal>
				<Menu.Overlay />
				{/* 트리거가 헤더 오른쪽 끝이라 end 정렬이 아니면 화면 밖으로 밀린다. */}
				<Menu.Content align="end" presentation="popover" width={MENU_WIDTH}>
					{options.map((option) => (
						<Menu.Item
							isSelected={option.href === currentArea}
							key={option.href}
							onPress={() => handleSelect(option.href)}
						>
							<Menu.ItemIndicator />
							<Menu.ItemTitle>{option.title}</Menu.ItemTitle>
						</Menu.Item>
					))}
				</Menu.Content>
			</Menu.Portal>
		</Menu>
	);
}
