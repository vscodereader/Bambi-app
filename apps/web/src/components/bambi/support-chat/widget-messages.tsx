"use client";

import { Badge } from "@bambi-app/ui/components/badge";
import { Button } from "@bambi-app/ui/components/button";
import { SendHorizontal } from "lucide-react";
import { formatDateTime } from "@/lib/bambi-format";

// getMyRooms 응답의 방 요약. lastMessageAt은 oRPC 직렬화에 따라 Date/문자열 둘 다 올 수
// 있어 formatDateTime(둘 다 허용)로만 소비한다.
export interface WidgetRoomSummary {
	createdAt: Date | string;
	id: string;
	lastMessageAt: Date | string;
	lastMessagePreview: string;
	status: "closed" | "open";
	unreadCount: number;
}

// 메시지 뷰: 대화 목록(미리보기·시각·미읽음·종료 뱃지) + 하단 "메시지를 보내주세요"(새 대화).
export function WidgetMessages({
	onOpenRoom,
	onStartNew,
	rooms,
}: {
	onOpenRoom: (roomId: string) => void;
	onStartNew: () => void;
	rooms: WidgetRoomSummary[];
}) {
	return (
		<div className="flex flex-1 flex-col overflow-hidden">
			<div className="flex flex-1 flex-col gap-2 overflow-y-auto p-3">
				{rooms.length === 0 ? (
					<p className="m-0 py-8 text-center text-muted-foreground text-sm">
						아직 나눈 대화가 없어요.
					</p>
				) : (
					rooms.map((room) => (
						<button
							className="flex flex-col gap-1 rounded-lg border p-3 text-left hover:bg-muted"
							key={room.id}
							onClick={() => onOpenRoom(room.id)}
							type="button"
						>
							<div className="flex items-center justify-between gap-2">
								<span className="min-w-0 flex-1 truncate text-sm">
									{room.lastMessagePreview || "새 대화"}
								</span>
								{room.unreadCount > 0 ? (
									<Badge className="shrink-0">{room.unreadCount}</Badge>
								) : null}
							</div>
							<div className="flex items-center gap-2">
								<span className="text-muted-foreground text-xs">
									{formatDateTime(room.lastMessageAt)}
								</span>
								{room.status === "closed" ? (
									<Badge className="shrink-0" variant="outline">
										종료
									</Badge>
								) : null}
							</div>
						</button>
					))
				)}
			</div>
			<div className="border-t p-3">
				<Button className="w-full justify-between" onClick={onStartNew}>
					메시지를 보내주세요
					<SendHorizontal />
				</Button>
			</div>
		</div>
	);
}
