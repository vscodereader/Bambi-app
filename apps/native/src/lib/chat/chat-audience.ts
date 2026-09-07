// 채팅 목록·방 화면은 구직자와 구인자가 그대로 공유한다(서버가 viewerIsEmployer로 상대를
// 뒤집어 주므로 조회에 차이가 없다). 역할별로 다른 것은 안내 문구와 이동 경로뿐이다.
export type ChatAudience = "employer" | "seeker";

export interface ChatListCopy {
	description: string;
	emptyCtaHref: string;
	emptyCtaLabel: string;
	emptyDescription: string;
	roomPathname: string;
}

const CHAT_LIST_COPY: Record<ChatAudience, ChatListCopy> = {
	employer: {
		description: "지원자와 나눈 대화를 확인합니다.",
		emptyCtaHref: "/(employer)",
		emptyCtaLabel: "공고 관리로 가기",
		emptyDescription: "지원자가 1:1 채팅을 시작하면\n여기에 대화가 쌓여요.",
		roomPathname: "/(employer)/chats/[id]",
	},
	seeker: {
		description: "지원한 공고의 대화를 확인합니다.",
		emptyCtaHref: "/(seeker)",
		emptyCtaLabel: "공고 탐색하기",
		emptyDescription:
			"공고 상세에서 1:1 채팅을 시작하면\n여기에 대화가 쌓여요.",
		roomPathname: "/(seeker)/chats/[id]",
	},
};

export const getChatListCopy = (audience: ChatAudience): ChatListCopy =>
	CHAT_LIST_COPY[audience];

// 차단 대상은 언제나 "나의 상대"다. 구직자 화면만 있던 시절에는 고용주 id를 그대로 넘겨도
// 맞았지만, 구인자가 같은 방을 열면 자기 자신을 넘기게 되고 서버가 거부한다
// ("자기 자신은 차단할 수 없어요"). 서버 counterpartUserId와 같은 규칙을 화면에서도 쓴다.
export const getChatCounterpartUserId = ({
	currentUserId,
	employerUserId,
	jobSeekerUserId,
}: {
	currentUserId: string;
	employerUserId: string;
	jobSeekerUserId: string;
}): string =>
	employerUserId === currentUserId ? jobSeekerUserId : employerUserId;
