// 공개 가이드 콘텐츠 클러스터(/jobs/guide/*)의 데이터 모델. 랜딩(/jobs)이 지역×업종 목록을
// 색인 진입점으로 삼는 것과 달리, 가이드는 타깃 키워드 하나를 깊게 설명하는 본문 페이지다
// (하루알바 /content/* 패턴 벤치마크). 본문·FAQ는 후속 집필자가 채우고, 여기서는 골격만 고정한다.
//
// 콘텐츠 규칙(가드 테스트로 강제): (1) 급여 금액 수치 금지 — 일급·TC·페이백 같은 정산 '구조'만
// 설명하고 "일 N만원" 류 숫자는 쓰지 않는다. (2) 경쟁 서비스명(퀸알바·여우알바·하루알바 등)
// 본문 금지. (3) 로그인 유도 문구 금지. (4) 불법 알선·성적 서비스 암시 금지 — 합법 직업 정보·
// 안전 중심 톤. (5) 과장·보장 표현("무조건"·"100%") 금지. 문체는 job-landing-content.ts의
// 업종 정의와 같은 정중한 설명체.
//
// title/description/keywords만 경쟁사명 예외다 — 거기선 정책 순서(퀸알바→여우알바→밤알바)를
// 지킨다. SEO title은 index.ts의 guideTitle이 keyword로 파생하므로 본문엔 경쟁사명이 없다.

import type { FaqItem } from "../job-landing-content";

export type { FaqItem } from "../job-landing-content";

// h2 한 섹션 — 제목 + 문단 여러 개. 화면은 h2 + p로 그린다(FAQPage/HowTo JSON-LD 금지).
export interface GuideSection {
	heading: string;
	paragraphs: readonly string[];
}

// 가이드가 가리키는 관련 채용정보 랜딩. region 슬러그는 필수, industry 슬러그는 선택
// (지역만 있는 랜딩도 유효). 두 슬러그는 JOB_LANDING_REGIONS/INDUSTRIES에 실존해야 한다
// (가드 테스트가 검증) — 렌더 쪽에서 jobLandingPath로 실제 <a href>를 만든다.
export interface GuideLandingLink {
	industry?: string;
	region: string;
}

export interface GuideContent {
	// meta description.
	description: string;
	// 텍스트로만 렌더하는 FAQ(FAQPage JSON-LD는 정책상 금지). 3개 이상.
	faqs: readonly FaqItem[];
	// SEO title 선두에 쓰는 대표 타깃 키워드(예: "텐프로알바"). guideTitle이 이 값을 앞세운다.
	keyword: string;
	// meta keywords에 얹을 추가 키워드(대표 키워드 변형·롱테일). 본문 규칙과 무관.
	keywords: readonly string[];
	// 가이드 간 상호링크 대상 slug(레지스트리에 실존해야 한다).
	relatedGuides: readonly string[];
	// 하단 "관련 채용정보" 블록에 링크할 랜딩 슬러그 쌍.
	relatedLandings: readonly GuideLandingLink[];
	// 본문 섹션(h2 + 문단). 어절 합계 하한은 가드 테스트가 강제한다.
	sections: readonly GuideSection[];
	// URL 세그먼트(/jobs/guide/<slug>)이자 레지스트리 키.
	slug: string;
	// 화면 h1이자 문서 제목. SEO title은 keyword로 파생하므로 이 값과 별개다.
	title: string;
}
