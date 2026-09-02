import { Surface } from "heroui-native";
import { Text } from "react-native";

// 수집 공고 후기 섹션. 웹 수집 상세(seeker-crawled-job-detail)와 똑같이 언제나 빈 상태다 —
// 후기(review)는 job_post 행(jobPostId)에 묶이는데 수집 공고는 별도 테이블(crawled_job_post)
// 이라 연결될 후기 행 자체가 없다. reviews.listByJobPost는 jobPostId(진짜 공고 uuid)를
// 받는 protectedProcedure이고 수집 공고 id로는 항상 빈 결과라, 웹처럼 호출하지 않고 정적
// 빈 상태만 보인다(비로그인 열람도 있어 불필요한 401을 만들지 않는다). 상세 응답에도 후기
// 개수 필드가 없다. ponytail: 서버에 수집 공고용 후기 프로시저가 생기면 그때 orpc로 잇는다.
export function CrawledJobReviews(_props: { crawledJobPostId: string }) {
	return (
		<Surface className="gap-2 rounded-lg p-4" variant="secondary">
			<Text className="font-semibold text-foreground text-sm" selectable>
				후기
			</Text>
			<Text className="text-muted text-sm leading-5" selectable>
				아직 후기가 없어요. 면접을 마친 구직자가 남긴 후기가 여기에 표시돼요.
			</Text>
		</Surface>
	);
}
