// 게시판 아이콘 이름 → lucide 컴포넌트. 고를 수 있는 이름의 정본은 서버
// (community-boards.ts의 COMMUNITY_BOARD_ICONS)가 zod enum으로 강제하고, 여기는 그 이름을
// 실제로 그리는 맵이다. 동적 import를 쓰지 않는 건 lucide 전체가 번들에 끌려오기 때문 —
// 명시적 Record라 쓰는 아이콘만 남는다. 서버에만 있고 여기 없는 이름은 조용히 무시된다.
// label은 운영자 화면 표기용이다: lucide 이름(키 원값)을 그대로 노출하지 않는다.

import {
	BriefcaseIcon,
	CoffeeIcon,
	HeartIcon,
	type LucideIcon,
	MegaphoneIcon,
	MessageCircleIcon,
	MusicIcon,
	NewspaperIcon,
	ScaleIcon,
	ShoppingBagIcon,
	SparklesIcon,
	StarIcon,
	UsersIcon,
} from "lucide-react";

export const COMMUNITY_BOARD_ICONS = {
	Briefcase: { icon: BriefcaseIcon, label: "서류가방" },
	Coffee: { icon: CoffeeIcon, label: "커피" },
	Heart: { icon: HeartIcon, label: "하트" },
	Megaphone: { icon: MegaphoneIcon, label: "확성기" },
	MessageCircle: { icon: MessageCircleIcon, label: "말풍선" },
	Music: { icon: MusicIcon, label: "음표" },
	Newspaper: { icon: NewspaperIcon, label: "신문" },
	Scale: { icon: ScaleIcon, label: "저울" },
	ShoppingBag: { icon: ShoppingBagIcon, label: "쇼핑백" },
	Sparkles: { icon: SparklesIcon, label: "반짝임" },
	Star: { icon: StarIcon, label: "별" },
	Users: { icon: UsersIcon, label: "사람들" },
} satisfies Record<string, { icon: LucideIcon; label: string }>;

// 운영자 화면의 선택지 타입. 서버 enum의 부분집합이라 그대로 입력으로 보낼 수 있다.
export type CommunityBoardIconName = keyof typeof COMMUNITY_BOARD_ICONS;

// 저장된 이름으로 아이콘 찾기. DB 값은 임의 문자열이라 넓은 Record로 한 번만 좁힌다 —
// 없거나 모르는 이름이면 undefined이고, 호출부는 기존 모양을 그대로 그린다.
export const communityBoardIcon = (
	name: string | null | undefined
): LucideIcon | undefined =>
	name
		? (
				COMMUNITY_BOARD_ICONS as Record<
					string,
					{ icon: LucideIcon; label: string }
				>
			)[name]?.icon
		: undefined;
