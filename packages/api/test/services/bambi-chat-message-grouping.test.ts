import { describe, expect, it } from "vitest";
import {
	annotateChatMessages,
	formatChatDateLabel,
	formatChatTimeLabel,
} from "@/services/bambi-chat-message-grouping";

// 타임존에 흔들리지 않게 로컬 시각 생성자로 만든다(UTC 문자열이면 CI 타임존에 따라 날짜가 밀린다).
const message = ({
	at,
	id,
	kind = "text",
	sender = "seeker",
}: {
	at: Date;
	id: string;
	kind?: string;
	sender?: string;
}) => ({ createdAt: at, id, kind, senderUserId: sender });

const localAt = (
	year: number,
	monthIndex: number,
	day: number,
	hour: number,
	minute: number,
	second = 0
) => new Date(year, monthIndex, day, hour, minute, second);

const boundaries = (messages: Parameters<typeof annotateChatMessages>[0]) =>
	annotateChatMessages(messages).map(
		({ dateLabel, isGroupEnd, isGroupStart, message: { id } }) => ({
			dateLabel,
			id,
			isGroupEnd,
			isGroupStart,
		})
	);

describe("formatChatDateLabel / formatChatTimeLabel", () => {
	it("ko-KR 날짜 칩·시간 문구를 만든다", () => {
		const at = localAt(2026, 7, 6, 16, 26);

		expect(formatChatDateLabel(at)).toBe("2026년 8월 6일 목요일");
		expect(formatChatTimeLabel(at)).toBe("오후 4:26");
	});

	it("ISO 문자열도 받는다", () => {
		expect(formatChatTimeLabel(localAt(2026, 7, 7, 9, 5).toISOString())).toBe(
			"오전 9:05"
		);
	});
});

describe("annotateChatMessages", () => {
	it("메시지가 없으면 빈 배열", () => {
		expect(annotateChatMessages([])).toEqual([]);
	});

	it("한 개면 그룹의 처음이자 끝이고 날짜 칩을 단다", () => {
		expect(
			boundaries([message({ at: localAt(2026, 7, 6, 16, 26), id: "a" })])
		).toEqual([
			{
				dateLabel: "2026년 8월 6일 목요일",
				id: "a",
				isGroupEnd: true,
				isGroupStart: true,
			},
		]);
	});

	// 같은 사람이 같은 분에 연달아 보내면 첫 줄만 아바타, 마지막 줄만 시간.
	it("같은 사람·같은 분이면 한 그룹으로 묶는다", () => {
		expect(
			boundaries([
				message({ at: localAt(2026, 7, 6, 16, 26, 1), id: "a" }),
				message({ at: localAt(2026, 7, 6, 16, 26, 30), id: "b" }),
				message({ at: localAt(2026, 7, 6, 16, 26, 59), id: "c" }),
			])
		).toEqual([
			{
				dateLabel: "2026년 8월 6일 목요일",
				id: "a",
				isGroupEnd: false,
				isGroupStart: true,
			},
			{ dateLabel: null, id: "b", isGroupEnd: false, isGroupStart: false },
			{ dateLabel: null, id: "c", isGroupEnd: true, isGroupStart: false },
		]);
	});

	it("분이 바뀌면 새 그룹", () => {
		const annotated = boundaries([
			message({ at: localAt(2026, 7, 6, 16, 26), id: "a" }),
			message({ at: localAt(2026, 7, 6, 16, 27), id: "b" }),
		]);

		expect(annotated.map(({ isGroupStart }) => isGroupStart)).toEqual([
			true,
			true,
		]);
		expect(annotated.map(({ isGroupEnd }) => isGroupEnd)).toEqual([true, true]);
		expect(annotated[1]?.dateLabel).toBeNull();
	});

	it("발신자가 바뀌면 같은 분이어도 새 그룹", () => {
		expect(
			boundaries([
				message({ at: localAt(2026, 7, 6, 16, 26), id: "a", sender: "seeker" }),
				message({
					at: localAt(2026, 7, 6, 16, 26),
					id: "b",
					sender: "employer",
				}),
			]).map(({ isGroupStart }) => isGroupStart)
		).toEqual([true, true]);
	});

	it("날짜가 바뀌면 날짜 칩을 달고 그룹도 끊는다", () => {
		expect(
			boundaries([
				message({ at: localAt(2026, 7, 6, 16, 26), id: "a" }),
				message({ at: localAt(2026, 7, 6, 16, 26), id: "b" }),
				message({ at: localAt(2026, 7, 7, 16, 26), id: "c" }),
			])
		).toEqual([
			{
				dateLabel: "2026년 8월 6일 목요일",
				id: "a",
				isGroupEnd: false,
				isGroupStart: true,
			},
			{ dateLabel: null, id: "b", isGroupEnd: true, isGroupStart: false },
			{
				dateLabel: "2026년 8월 7일 금요일",
				id: "c",
				isGroupEnd: true,
				isGroupStart: true,
			},
		]);
	});

	// 연락처 공개 요청 카드는 앞뒤 말풍선 묶음을 갈라야 한다 — 같은 사람·같은 분이어도.
	it("contact_request는 단독 그룹이 되고 앞뒤를 분리한다", () => {
		expect(
			boundaries([
				message({ at: localAt(2026, 7, 6, 16, 26), id: "a" }),
				message({
					at: localAt(2026, 7, 6, 16, 26),
					id: "req",
					kind: "contact_request",
				}),
				message({ at: localAt(2026, 7, 6, 16, 26), id: "b" }),
			])
		).toEqual([
			{
				dateLabel: "2026년 8월 6일 목요일",
				id: "a",
				isGroupEnd: true,
				isGroupStart: true,
			},
			{ dateLabel: null, id: "req", isGroupEnd: true, isGroupStart: true },
			{ dateLabel: null, id: "b", isGroupEnd: true, isGroupStart: true },
		]);
	});

	it("contact_request가 연달아도 각각 단독 그룹", () => {
		expect(
			boundaries([
				message({
					at: localAt(2026, 7, 6, 16, 26),
					id: "r1",
					kind: "contact_request",
				}),
				message({
					at: localAt(2026, 7, 6, 16, 26),
					id: "r2",
					kind: "contact_request",
				}),
			])
		).toEqual([
			{
				dateLabel: "2026년 8월 6일 목요일",
				id: "r1",
				isGroupEnd: true,
				isGroupStart: true,
			},
			{ dateLabel: null, id: "r2", isGroupEnd: true, isGroupStart: true },
		]);
	});
});
