import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(
	new URL("./seeker-chat-room-responsive.tsx", import.meta.url),
	"utf8"
);
// 방 화면이 쓰는 훅들. 화면과 함께 봐야 스크롤·자동 읽음·커서 페이지네이션 배선이 확인된다.
const readLib = (fileName: string) =>
	readFileSync(
		new URL(`../../../lib/bambi/${fileName}`, import.meta.url),
		"utf8"
	);
const scrollSource = readLib("use-chat-message-scroll.ts");
const autoReadSource = readLib("use-chat-room-auto-read.ts");
const olderMessagesSource = readLib("use-older-chat-messages.ts");
// 소켓 클라이언트(방 입장·이탈 유예)는 lib/bambi가 아니라 lib 바로 아래에 있다.
const realtimeSource = readFileSync(
	new URL("../../../lib/bambi-chat-realtime.ts", import.meta.url),
	"utf8"
);

describe("채팅방 연락처 재설계", () => {
	it("구인자 버튼을 연락처 공개 요청으로 바꾼다", () => {
		expect(source).toContain("연락처 공개 요청");
		expect(source).toContain("requestContactReveal");
	});

	it("연락처 공개 요청 안내 문구를 렌더한다", () => {
		expect(source).toContain("연락처 공개 요청이 왔습니다");
	});

	it("옛 reveal 페이지 이동을 제거한다", () => {
		expect(source).not.toContain("/reveal");
		expect(source).not.toContain("getContactReveal");
	});

	it("shadcn message 컴포넌트를 쓴다", () => {
		expect(source).toContain("@bambi-app/ui/components/message");
	});

	it("채팅 이미지 첨부에 시그니처 검증을 배선한다", () => {
		expect(source).toContain("detectImageSignature");
	});

	// 이미지·PDF만 받는다. 파일 선택 input의 accept와 선택 시점 검증이 같은 목록을 봐야 한다.
	it("첨부를 이미지와 PDF로만 제한한다", () => {
		expect(source).toContain('ACCEPTED_ATTACHMENT_MIME_TYPES.join(",")');
		expect(source).toContain("isPdfSignature");
		expect(source).not.toContain("image/gif");
	});

	// 인텐트만 받고 파일을 올리지 않던 게 "내 이미지 대신 목 이미지" 증상의 원인이었다.
	it("첨부 파일을 서명 URL로 실제 업로드한다", () => {
		expect(source).toContain("uploadFileToSignedUrl");
		// 업로드가 끝난 뒤에 메시지를 남겨야 한다(import가 아니라 호출부 위치로 본다).
		expect(source.indexOf("uploadFileToSignedUrl({")).toBeLessThan(
			source.indexOf("sendMediaMessageMutation.mutateAsync")
		);
	});

	it("채팅방 헤더에서 공고 상세로 이동시킨다", () => {
		expect(source).toContain("/seeker/jobs/");
		expect(source).toContain("ChatJobPostLink");
		// 상세가 published + paid만 열어 주므로 그 밖의 공고는 이동 대신 사유를 남긴다.
		expect(source).toContain("공고 삭제됨");
		expect(source).toContain("공고 비공개");
	});
});

describe("상대가 나간 채팅방", () => {
	// 한쪽이라도 나간 방은 서버가 NOT_FOUND로 끊어 화면이 열리지 않는다 — 화면에는
	// 나감 상태를 다루는 배선 자체가 없어야 한다.
	it("나감 상태로 잠그거나 안내하는 배선을 남기지 않는다", () => {
		expect(source).not.toContain("counterpartLeft");
		expect(source).not.toContain("disabledNotice");
		expect(source).not.toContain("isSendBlocked");
		expect(source).not.toContain("상대방 나감");
	});

	it("면접 제안·연락처 요청·요청 응답도 나감으로 감추지 않는다", () => {
		expect(source).toContain("{isJobSeeker ? null : (");
	});

	// 운영자 차단·내 신고 대기는 그대로 진입을 막고 목록으로 돌려보낸다.
	it("차단·신고 사유는 그대로 목록으로 돌려보낸다", () => {
		expect(source).toContain("getChatBlockMessage(roomQuery.error)");
		expect(source).toContain('router.replace("/seeker/chats")');
	});
});

describe("신고한 채팅 숨김", () => {
	// 신고 완료 안내가 "해당 채팅은 잠시 숨겨둘게요"라고 약속한다. 서버가 방을 감추므로
	// 창을 닫을 때 방 조회를 다시 돌려 그 안내와 함께 목록으로 나가야 한다.
	it("신고 창을 닫으면 방 조회를 다시 받는다", () => {
		expect(source).toContain("handleReportOpenChange");
		// 방 조회 입력에 페이지 크기가 들어가므로 부분 일치 키(key)로 무효화해야 한다
		// — 정확 일치(queryKey)는 "더 보기"로 늘린 페이지를 놓친다.
		expect(source).toContain("orpc.bambi.chats.getById.key");
	});
});

describe("채팅방 메시지 페이지네이션·재연결", () => {
	// 이력 전체를 매 조회마다 다시 받던 구조라, 소켓 이벤트 한 건이 전량 재전송을 불렀다.
	// 이제 최신 한 페이지만 쿼리가 들고, 이전 이력은 keyset 커서로 앞에 쌓는다.
	it("최근 한 페이지만 받고 커서로 이전 페이지를 붙인다", () => {
		expect(source).toContain("CHAT_MESSAGE_PAGE_SIZE");
		expect(source).toContain("이전 메시지 더 보기");
		expect(source).toContain("latestPageCursor: roomQuery.data?.nextCursor");
		expect(olderMessagesSource).toContain("resolveOldestChatMessageCursor");
		expect(olderMessagesSource).toContain("input: { cursor, id: roomId");
	});

	// limit을 키우던 방식은 상한(500)이 곧 열람 가능한 이력의 끝이었다 — 커서로 바뀌며 사라졌다.
	it("limit 확장 방식과 그 상한 안내를 걷어낸다", () => {
		expect(source).not.toContain("CHAT_MESSAGE_MAX_PAGE_SIZE");
		expect(source).not.toContain("setMessageLimit");
	});

	// 큐 재처리·소켓 재전달로 같은 메시지가 두 경로로 들어와도 말풍선이 겹치면 안 된다.
	it("메시지를 id 기준으로 합쳐 중복을 막는다", () => {
		expect(source).toContain("mergeChatMessagesById");
		expect(olderMessagesSource).toContain("mergeChatMessagesById");
	});

	// 끊겼다 붙으면 서버 쪽 입장 기록이 사라져 있어 방 이벤트가 한 건도 오지 않는다.
	it("재연결하면 방에 다시 입장한다", () => {
		expect(source).toContain("const handleConnect = () => {");
		expect(source).toContain("joinRoom();");
	});

	// 상한(50)을 넘는 id 목록을 보내 읽음 처리가 통째로 거절되던 문제.
	it("읽음 처리는 기준선 하나만 보낸다", () => {
		expect(autoReadSource).toContain("upToMessageId");
		expect(source).not.toContain("readCandidateMessageIds");
	});
});

describe("채팅방 내부 스크롤", () => {
	// 문서가 대화 길이만큼 세로로 자라던 구조(min-h-[420px])를 뷰포트 고정으로 바꿨다.
	it("방 패널을 뷰포트에 고정하고 메시지 영역만 스크롤한다", () => {
		expect(source).not.toContain("min-h-[420px]");
		expect(source).toContain("h-[calc(100dvh-6rem)]");
		expect(source).toContain("md:h-[calc(100dvh-7.5rem)]");
		expect(source).toContain("overflow-y-auto");
		expect(source).toContain("ref={scrollRef}");
		expect(source).toContain("onScroll={handleScroll}");
	});

	// 위로 올려 과거를 읽는 중이면 새 메시지가 와도 자리를 빼앗지 않는다.
	it("하단 고정 여부를 스크롤 위치로 판단한다", () => {
		expect(scrollSource).toContain("isScrolledToBottom");
		expect(scrollSource).toContain("stickToBottomRef");
	});

	// 앞이 늘어나면 브라우저가 스크롤을 그대로 둬 읽던 줄이 아래로 튄다.
	it("이전 메시지를 붙인 뒤 스크롤 점프를 되돌린다", () => {
		expect(scrollSource).toContain("olderAnchorRef");
		expect(olderMessagesSource).toContain("onBeforePrepend()");
		expect(source).toContain("useLayoutEffect(() => syncScroll(messages)");
	});
});

describe("보고 있는 방 자동 읽음", () => {
	// 방 데이터 로드 기준으로만 markRead를 걸면 소켓으로 먼저 온 상대 메시지가 빠져
	// 목록에 핀이 뜬다.
	it("소켓 수신분을 바로 읽음 기준선으로 올린다", () => {
		expect(source).toContain("handleMessageCreated");
		expect(source).toContain("queueMarkRead(payload.messageId)");
	});

	// 기준은 탭 활성 + 방 화면 표시 중. 백그라운드 탭이면 핀이 뜨고 복귀 시 처리한다.
	it("탭이 보일 때만 읽음 처리하고 복귀 시 밀린 기준선을 처리한다", () => {
		expect(autoReadSource).toContain('document.visibilityState === "visible"');
		expect(autoReadSource).toContain('"visibilitychange"');
	});

	// 수신이 몰려도 요청은 최신 기준선 하나로 접혀야 한다.
	it("읽음 요청을 최신 기준선 하나로 합친다", () => {
		expect(autoReadSource).toContain("MARK_READ_COALESCE_MS");
		expect(autoReadSource).toContain("if (timerRef.current !== null)");
	});

	// 읽음 왕복 사이에 목록이 다시 그려져도 방금 읽은 방에 핀이 깜빡이면 안 된다.
	it("읽는 즉시 목록 캐시의 안 읽음을 0으로 눌러 둔다", () => {
		expect(source).toContain("zeroUnreadCountForRoom");
		expect(source).toContain("orpc.bambi.chats.unreadState.queryKey()");
	});

	// 무효화만 걸어 두면 핀이 0이 되는 시점이 재조회 타이밍에 달린다 — 새 메시지 신호로
	// 먼저 뜬 조회가 읽음 커밋 전 값을 들고 늦게 돌아오면 핀이 1에 머문다.
	it("읽음 응답의 서버 총합으로 핀 캐시를 직접 덮는다", () => {
		expect(source).toContain("data.totalUnreadMessageCount");
		expect(source).toContain(
			"queryClient.setQueryData(orpc.bambi.chats.unreadState.queryKey()"
		);
	});

	// 실패한 기준선을 "보냈다"로 남기면 같은 기준선으로는 다시 시도하지 않아,
	// 다음 새 메시지가 올 때까지 핀이 안 꺼진다.
	it("읽음 요청이 실패하면 기준선을 되돌려 다시 시도할 수 있게 한다", () => {
		expect(source).toContain("markRead: markReadMutation.mutateAsync");
		expect(autoReadSource).toContain("sentMessageIdRef.current = null");
	});
});

describe("방 화면 실시간 연결 강건화", () => {
	// 소켓 접속·입장을 방 HTTP 조회(currentUserId)에 묶어 두면, 조회가 도는 동안 온 상대
	// 메시지가 방 소켓룸으로 오지 않아 핀이 남는다. 참여자 검증은 서버 join 가드가 한다.
	it("세션 id를 기다리지 않고 방 id만으로 즉시 접속·입장한다", () => {
		expect(source).not.toContain("if (!currentSessionUserId) {");
		expect(source).toContain(
			"const socket = connectBambiChatSocket();\n\t\tconst refreshIfCurrentRoom"
		);
	});

	// 세션 id가 늦게 도착해도 effect가 다시 돌면 leave/join을 왕복한다 — ref로만 흘린다.
	it("세션 id 도착이 실시간 effect를 다시 돌리지 않는다", () => {
		expect(source).toContain("currentSessionUserIdRef.current");
		expect(source).toContain(
			"}, [invalidateRoom, queueMarkRead, reassertMarkRead, roomId]);"
		);
	});

	// 서버 인증 미들웨어 거절은 socket.io가 스스로 다시 붙지 않는 네임스페이스 오류라,
	// 아무도 듣지 않으면 소켓이 조용히 영영 죽는다(HTTP 경로만 남는 관찰 증상).
	it("connect_error를 듣고 백오프로 다시 붙는다", () => {
		expect(realtimeSource).toContain('chatSocket.on("connect_error"');
		expect(realtimeSource).toContain("if (!chatSocket?.active)");
		expect(realtimeSource).toContain("RECONNECT_MAX_MS = 30_000");
		expect(realtimeSource).toContain("Math.random()");
		// 붙는 순간 백오프는 처음으로 되돌린다.
		expect(realtimeSource).toContain("reconnectAttempt = 0;");
	});

	// "보고 있는 방인데 안 읽음 > 0"은 성립할 수 없는 상태다 — 어떤 레이스로 뜬 핀이든
	// 읽음을 다시 주장해 자가 소멸시킨다. markRead 성공이 0 신호를 만들어 루프는 없다.
	it("이 방의 안 읽음 신호를 읽음 재주장으로 되받는다", () => {
		expect(source).toContain("const handleUnreadUpdated = (payload: {");
		expect(source).toContain("payload.unreadCount > 0");
		expect(source).toContain("reassertMarkRead();");
		expect(source).toContain(
			'socket.on("chat:unread:updated", handleUnreadUpdated)'
		);
	});

	// 재주장은 봉인만 풀고 평소 경로로 흘린다(탭 활성 게이트·300ms 합치기 그대로).
	it("재주장은 보낸 기준선의 봉인을 풀고 같은 경로로 흘린다", () => {
		expect(autoReadSource).toContain(
			"const reassertMarkRead = useCallback(() => {"
		);
		expect(autoReadSource).toContain(
			"if (latestRef.current?.chatRoomId !== chatRoomId) {"
		);
		expect(autoReadSource).toContain(
			"return { queueMarkRead, reassertMarkRead };"
		);
	});
});

describe("방 화면 이탈 시 조용한 연결 정리", () => {
	// 나감 알림이 아니라 내부 정리다 — 상대 화면에는 어떤 표시도 가지 않는다.
	it("이탈 시 즉시 leave 하지 않고 유예 뒤에 정리한다", () => {
		expect(source).toContain("scheduleBambiChatRoomLeave(roomId)");
		expect(source).not.toContain("leaveBambiChatRoom(roomId)");
		expect(realtimeSource).toContain("LEAVE_GRACE_MS = 30_000");
	});

	// 유예 안에 같은 방으로 돌아오면 기존 입장을 그대로 쓴다.
	it("재진입하면 예약된 정리를 취소한다", () => {
		expect(realtimeSource).toContain("cancelPendingLeave(roomId)");
		expect(
			realtimeSource.indexOf("cancelPendingLeave(roomId);\n\t\tconst socket")
		).toBeGreaterThan(-1);
	});

	// 입력 중에 나가면 상대 화면에 "입력 중"이 유령으로 남는다.
	it("이탈 시 타이핑 표시는 즉시 끈다", () => {
		expect(source).toContain(
			"if (typingActiveRef.current) {\n\t\t\t\temitBambiChatTypingStopped(roomId);"
		);
	});
});

describe("메시지 id 승격", () => {
	// 클라이언트가 전송 전에 id를 만들어 보내면 서버가 PK 충돌로 재시도·더블클릭을 흡수한다.
	it("전송 입력에 클라이언트 생성 messageId를 싣는다", () => {
		expect(source).toContain("@bambi-app/api/services/bambi-chat-message-id");
		expect(source.match(/messageId: generateChatMessageId\(\)/g)).toHaveLength(
			2
		);
	});
});
