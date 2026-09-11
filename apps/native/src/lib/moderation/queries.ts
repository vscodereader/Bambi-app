import { useQueryClient } from "@tanstack/react-query";

import { orpc } from "@/src/lib/orpc";

// 탭별 목록은 입력을 고정한다. 상세 화면이 목록 캐시에서 항목을 찾으므로 목록 쿼리와
// invalidate가 같은 키를 봐야 한다 — 입력을 호출부마다 쓰지 않고 여기서만 정의한다.
export const QUEUE_LIST_INPUT = {
	limit: 50,
	status: "pending_review",
} as const;
export const REPORT_LIST_INPUT = { limit: 50 } as const;
export const USER_LIST_INPUT = { limit: 1000 } as const;

export const queueListOptions = () =>
	orpc.bambi.moderation.listJobPosts.queryOptions({ input: QUEUE_LIST_INPUT });
export const reportListOptions = () =>
	orpc.bambi.moderation.listReports.queryOptions({ input: REPORT_LIST_INPUT });
export const userListOptions = () =>
	orpc.bambi.moderation.listUsers.queryOptions({ input: USER_LIST_INPUT });

// 상태 변경 성공 후 목록을 다시 읽는다. 사용자 변경은 해당 사용자의 제재 이력도 함께
// (page·pageSize는 넘기지 않는다 — 부분 키라 모든 페이지가 걸린다).
export function useInvalidateModeration() {
	const queryClient = useQueryClient();

	return {
		queue: () =>
			queryClient.invalidateQueries({ queryKey: queueListOptions().queryKey }),
		reports: () =>
			queryClient.invalidateQueries({ queryKey: reportListOptions().queryKey }),
		users: async (targetUserId?: string) => {
			await queryClient.invalidateQueries({
				queryKey: userListOptions().queryKey,
			});

			if (targetUserId) {
				await queryClient.invalidateQueries({
					queryKey: orpc.bambi.moderation.listUserModerationActions.key({
						input: { targetUserId },
					}),
				});
			}
		},
	};
}
