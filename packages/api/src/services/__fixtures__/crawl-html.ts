// 파서 테스트 입력. 상대 사이트 응답을 통째로 저장하는 대신, 파서가 실제로 보는 구조만
// 남겨 손으로 쓴다. 응답 원본(퀸알바 목록 1.7MB)을 리포에 넣으면 남의 사이트 콘텐츠가
// 수천 줄 커밋되고, 그 안에 업소명·주소·담당자 같은 것이 딸려 들어온다.
//
// 여기 있는 마크업은 전부 실제 응답에서 확인한 모양 그대로다 — 클래스 이름, 중첩, 값이
// span 밖 맨 텍스트로 오는 것, &nbsp;로 이어지는 것까지. 파서가 의존하는 기벽을 하나라도
// 매끈하게 고쳐 쓰면 테스트만 통과하고 실물에서 깨지므로, 고치지 말 것.
//
// 이 픽스처가 잡아주는 건 "우리 파서가 회귀했는가"다. "상대가 마크업을 바꿨는가"는 어차피
// 저장된 스냅샷으로는 못 잡고, 운영 중에는 수율 판정(isYieldTrustworthy)이 잡는다.

const page = (body: string): string =>
	`<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>${body}</body></html>`;

// ---------------------------------------------------------------------------
// 여우알바
// ---------------------------------------------------------------------------

export const FOXALBA_SAMPLE_ID = "201905221407151982";

// span.add는 시/도와 시/군구를 &nbsp;(U+00A0)로 잇는다. 정규화가 빠지면 여기서 깨진다.
const NBSP = " ";

interface FoxalbaListRow {
	add: string;
	company: string;
	// 급여 단위는 텍스트가 아니라 아이콘 class로만 구분된다(day=TC, hs=협의, time=시급).
	iconClass: string;
	id: string;
	// 썸네일 alt. 있으면 파서가 말줄임된 span.company보다 이쪽을 먼저 본다.
	imgAlt?: string;
	pay: string;
	title: string;
}

const foxalbaListItem = (row: FoxalbaListRow): string => `
<li class="liItem" data-id="${row.id}">
	<div class="ad_div_l"><a class="info" href="view.asp?o_idx=${row.id}">${
		row.imgAlt
			? `<img src="/offerphoto/${row.id}.jpg" class="info_img" alt="${row.imgAlt}">`
			: `<div class="banner-btn bannerbg3_2"><span>${row.company}</span></div>`
	}</a></div>
	<div class="ad_div_r">
		<a class="info " href="view.asp?o_idx=${row.id}">
			<span class="title ellipsis no1"> ${row.title} </span>
			<span class="company">${row.company}</span> |
			<span class="add">${row.add}</span> |
			<span class="pay">${row.pay}</span><span class="icon ${row.iconClass}">T</span>
		</a>
	</div>
</li>`;

// 목록 50칸. 같은 o_idx가 두 번 실리는 경우가 실제로 있어(50칸 중 고유 49건) 중복을 한 건
// 심어둔다 — 수집기의 중복 제거가 빠지면 같은 상세를 두 번 받고 신규 건수도 부풀려진다.
const foxalbaListRows = (): FoxalbaListRow[] => {
	const rows: FoxalbaListRow[] = [
		{
			add: `경기${NBSP}하남시`,
			company: "벤츠",
			iconClass: "day",
			id: FOXALBA_SAMPLE_ID,
			pay: "60,000",
			title: "★하남시 도우미 모집★",
		},
		{
			add: `서울${NBSP}강남구`,
			company: "시흥시 써니 노..",
			iconClass: "hs",
			id: "202503181400532633",
			imgAlt: "시흥시 써니 노래클럽",
			pay: "협의",
			title: "룸 도우미 급구",
		},
		{
			add: `부산${NBSP}해운대구`,
			company: "라운지",
			iconClass: "time",
			id: "202004091334566711",
			pay: "15,000",
			title: "홀서빙 시급 협의",
		},
		// 위 항목과 같은 id. 중복 제거가 여기서 걸린다.
		{
			add: `부산${NBSP}해운대구`,
			company: "라운지",
			iconClass: "time",
			id: "202004091334566711",
			pay: "15,000",
			title: "홀서빙 시급 협의",
		},
	];

	for (let index = rows.length; index < 50; index += 1) {
		rows.push({
			add: `대구${NBSP}중구`,
			company: `업소${index}`,
			iconClass: "day",
			id: `2026010112000${index.toString().padStart(5, "0")}`,
			pay: "50,000",
			title: `모집 공고 ${index}`,
		});
	}

	return rows;
};

export const foxalbaListHtml = page(`
<ul class="ti"><li><h2>전체보기</h2><span class="num">총 <b>3,283</b> 건</span></li></ul>
<ul class="list">${foxalbaListRows().map(foxalbaListItem).join("")}</ul>`);

// 상세는 table도 dl도 아니고 `<li><span class="ti">라벨</span>값</li>` 형태다. 값이 없는
// 필드는 li 행 자체가 사라지므로 위치 인덱스로 읽으면 밀린다.
//
// 재현해 둔 기벽 셋:
//  - 제목은 #spnTitle이 아니라 #divTitle에 있다(#spnTitle은 빈 채로 서빙되고 JS가 채운다)
//  - 카톡아이디는 span에 감싸이지 않은 맨 텍스트 노드이고 뒤에 "복사" 버튼이 붙는다
//  - 근무지역·급여는 `칩 + 값` 두 span으로 쪼개져 있다
//  - #nowAd 밖에 같은 구조의 빈 슬라이드가 있어 스코프를 좁히지 않으면 엉뚱한 걸 읽는다
export const foxalbaDetailHtml = page(`
<div id="prevAd"><ul class="top"><li><span class="ti">닉네임/업소명</span><span class="name"></span></li></ul></div>
<div id="nowAd">
	<span id="spnTitle"></span>
	<div id="divTitle" style="display:none">★하남시 도우미 모집★</div>
	<ul class="top">
		<li class="linick"><span class="ti">닉네임/업소명</span><span class="name">벤츠</span></li>
		<li><span class="ti">모집직종</span><span>노래주점</span></li>
		<li><span class="ti">담당자</span><span>홍길동</span></li>
		<li><span class="ti">사업자명</span><span>오페라노래</span></li>
		<li><span class="ti">주소</span><span class="addr">경기도 하남시${NBSP}신장동 523-1</span></li>
		<li><span class="ti">연락처</span><span id="spnPhone" class="num">010-0000-0000</span></li>
		<li><span class="ti">카톡아이디</span>testkakao <a href="javascript:copy('testkakao');" class="copy-btn">복사</a></li>
	</ul>
	<ul class="info">
		<li><span class="ti">근무지역</span><span class="info"> <span class="keyword-chip">경기</span> <span class="value-strong">하남시</span></span></li>
		<li><span class="ti">근무시간</span><span class="info">추후협의</span></li>
		<li><span class="ti">급여</span><span class="info"> <span class="keyword-chip">TC</span> <span class="value-strong">60,000원 </span></span></li>
		<li><span class="ti">모집성별</span><span class="info">여</span></li>
		<li><span class="ti">모집연령</span><span class="info">20~49세</span></li>
	</ul>
	<ul class="info">
		<li><span class="ti">모집글</span></li>
		<li class="content"><span><div><font color="#ff0000" size="6">초보 환영</font><br><strong>문의 010-1234-5678</strong><br>카톡 shopkakao<br><img src="https://fox2.kr/data/tmp/2408/sample.gif"></div></span></li>
	</ul>
</div>`);

// ---------------------------------------------------------------------------
// 퀸알바
// ---------------------------------------------------------------------------

// 게이트가 돌려주는 실제 응답 전문(116바이트). 인증 세션이 없으면 어떤 URL이든 이것만 온다.
export const queenalbaGateStubHtml = `<script type="text/javascript">
                document.location.replace("/adult_index.php");
            </script>`;

// 카드 썸네일 경로는 인증 쿠키로 받은 실물에서 확인했다: ./upload/happy_member/YYYY/MM/DD/
// <n>.gif(86×46). 처음에 /offerphoto/로 가정했었고 그 경로는 이 사이트에 없어서 썸네일이
// 한 건도 수집되지 않았다. 아이콘(img/icon_*.gif)을 함께 넣어 두어 썸네일로 새어 들어오지
// 않는지를 이걸로 못박는다.
const queenalbaCard = (id: string, shop: string): string => `
<td><dl>
	<dt><span><a href="./guin_detail.php?num=${id}&pg=&cou=&clickChk=&ssi=&sgu="><font color="70009a"><strong>${shop}</strong></font></a><font class="smfont3">기타</font></span>
	<span><font class="smfont3">서울 강남구</font></span></dt>
	<dd><a href="./guin_detail.php?num=${id}&pg=&cou=&clickChk=&ssi=&sgu=" class="title_ellipse"><img src="./upload/happy_member/2026/07/20/${id}.gif" class="card_photo" alt="${shop}"><span><font>${shop} 급구...</font></span></a>
	<ul><li><b>500,000원</b></li>
	<li><table class="level_icon"><tbody><tr><td class="medal"><img src="img/icon_medal.gif"></td><td class="center">97회 2910일</td><td class="last"></td></tr></tbody></table></li></ul></dd>
</dl></td>`;

// 목록은 카드형·표형 섹션이 섞여 있고 같은 공고가 여러 섹션에 겹쳐 실린다. 파서가 섹션
// 구조를 따라가지 않고 상세 링크의 num만 훑어 Set으로 접는 이유다.
// 헤더·푸터 배너 링크를 공고로 세지 않으려고 #sub_center로 좁히는 것도 여기서 확인된다.
export const queenalbaGuinListHtml = page(`
<div id="header"><a href="./guin_detail.php?num=99999&pg=">배너 링크(수집 대상 아님)</a></div>
<div id="sub_center">
	<div><table><tbody>
		<tr>${queenalbaCard("36659", "❤️에밀리❤️")}${queenalbaCard("16100", "♥The Day♥")}${queenalbaCard("25073", "이찌니")}</tr>
	</tbody></table></div>
	<div><table><tbody>
		<tr>${queenalbaCard("36659", "❤️에밀리❤️")}${queenalbaCard("29431", "박서준이사")}</tr>
	</tbody></table></div>
	<div><table><tbody>
		<tr><td>서울 강남구</td><td><a href="./guin_detail.php?num=37428&pg=">강남1등 도파민</a></td></tr>
	</tbody></table></div>
</div>`);

interface QueenalbaDetailOptions {
	// 라벨-값 표. 값이 비는 필드는 행 자체가 사라지므로 넘기지 않는 것으로 재현한다.
	bodyHtml: string;
	messengerRows: string;
	rows: [string, string][];
	// 상세 썸네일. 실물에서 본문 영역보다 위, 업체정보안내 블록 안의 86×46 GIF로 확인했다
	// (경로 upload/happy_member/...). 썸네일이 없는 공고도 있어 선택 항목으로 둔다.
	thumbnailSrc?: string;
	title: string;
}

const queenalbaDetail = (options: QueenalbaDetailOptions): string =>
	page(`
<div id="sub_center">
	<h1>${options.title}</h1>
	${
		options.thumbnailSrc
			? `<div><table><tbody><tr><td><div><img src="${options.thumbnailSrc}"></div></td></tr></tbody></table></div>`
			: ""
	}
	<h2>업체정보안내</h2>
	<table><tbody>
		${options.rows
			.map(
				([label, value]) =>
					`<tr><td><img src="img/icon_balloon_arrow.gif"><b class="smfont4">${label}</b></td><td colspan="3">${value}</td></tr>`
			)
			.join("")}
		${options.messengerRows}
		<tr><td colspan="4" style="height:1px"></td></tr>
	</tbody></table>
	<div>
		<h2><img src="img/title_detail_guin_02.gif" alt="상세 채용정보 이미지"></h2>
		<div style="background-color:#cdcdcd; height:1px"></div>
		<div>${options.bodyHtml}</div>
		<div class="detail_no_ment">본 정보는 업소에서 제공한 자료이며 … 재배포 할 수 없습니다.</div>
	</div>
</div>`);

// 본문 텍스트가 있고 카톡 아이디를 남긴 공고. 급여 칸에 사이트가 최저임금 안내를 덧붙이는
// 것과, 본문에 박힌 번호·카톡이 마스킹되는지를 여기서 본다.
//
// 급여 칸의 WantMoneyArrImg2.gif가 실물의 단위 표기다 — 단위는 텍스트로 오지 않고 이
// gif 파일명(2=시급)에만 있다. 전화번호·마감일자 행도 실물에서 확인한 라벨이고, 마감일자
// 값에는 D-day 표기가 뒤에 붙는다.
//
// 본문 이미지 옆에 장식 이미지(1x1 스페이서·아이콘·외부 호스트 gif)와 같은 이미지 재게시를
// 함께 넣어 두었다. 전부 실물에서 흔한 조합이고, 이걸 안 거르면 공고 이미지 자리에 투명
// gif나 남의 서버 장식이 저장된다. /img_up/shop_pds/는 본문 이미지의 다른 저장 위치다.
export const queenalbaGuinDetailHtml = queenalbaDetail({
	bodyHtml:
		'<p>송파1등업소!! 최대소득 장난아니야~~!!</p><p>문의 010-1234-5678</p><p>카톡 shopkakao</p><img src="img/blank.gif" width="1" height="1"><img src="/wys2/file_attach/2025/12/06/sample.jpg"><img src="upload/happy_config/IconData2.gif"><img src="/wys2/file_attach/2025/12/06/sample.jpg"><img src="/img_up/shop_pds/2026/07/29/detail_01.jpg"><img src="https://i.imgur.com/decoline.gif">',
	messengerRows: `
		<tr class="kakao-wrap"><td><b class="smfont4"><img alt="카카오톡아이디"> ID</b></td><td colspan="3">kakaosample</td></tr>
		<tr class="line-wrap"><td><b class="smfont4"><img alt="라인 아이디"> ID</b></td><td colspan="3"></td></tr>
		<tr class="telegram-wrap"><td><b class="smfont4"><img alt="텔레그램 아이디"> ID</b></td><td colspan="3"></td></tr>`,
	rows: [
		["닉네임", "♥The Day♥"],
		["상호", "주식회사 제이유니언"],
		["담당자", "홍길동"],
		["전화번호", "<span>010-9876-5432</span>"],
		["근무지역", "<span><b>서울</b> - 송파구</span>"],
		["업무내용", "룸싸롱 - 클럽"],
		["고용형태", "고용"],
		[
			"급여",
			'<img src="upload/happy_config/WantMoneyArrImg2.gif"> 150,000원 2026년 최저시급 10,320원',
		],
		["경력", "정보없음"],
		["업무일", "정보없음"],
		["나이", "제한 없음"],
		["접수기간", "2026-07-29 ~ 2026-09-01"],
		["마감일자", "2026-08-05 D-12"],
		["회사명", "주식회사 제이유니언"],
		["회사주소", "서울특별시 송파구 송파대로28길 11, 지하1층"],
	],
	thumbnailSrc: "./upload/happy_member/2026/07/20/16100_main.gif",
	title: "❤TC인상❤급구❤7T~9T❤빠른회전❤서류無송파구방이동잠실셔츠룸레깅스가락동",
});

// 콜핀(대표번호 + 내선)으로만 연락되고, 카톡은 비었는데 텔레그램에만 아이디가 있고,
// 본문이 이미지뿐인 공고. 셋 다 실물에서 흔한 조합이라 한 픽스처로 묶었다.
export const queenalbaGuinDetailCallpinHtml = queenalbaDetail({
	bodyHtml:
		'<img src="/wys2/file_attach/2025/12/06/a.jpg"><img src="/wys2/file_attach/2025/12/06/b.jpg">',
	messengerRows: `
		<tr class="kakao-wrap"><td><b class="smfont4"><img alt="카카오톡아이디"> ID</b></td><td colspan="3"></td></tr>
		<tr class="line-wrap"><td><b class="smfont4"><img alt="라인 아이디"> ID</b></td><td colspan="3"></td></tr>
		<tr class="telegram-wrap"><td><b class="smfont4"><img alt="텔레그램 아이디"> ID</b></td><td colspan="3">tgsample</td></tr>`,
	rows: [
		["닉네임", "❤️에밀리❤️"],
		["콜핀대표번호", "<span>1566-1945 + 콜핀번호</span>"],
		["콜핀번호", "<span>0000</span>"],
		["상호", "세이렌(siren)"],
		["담당자", "이순신"],
		["근무지역", "<span><b>서울</b> - 강남구</span>"],
		["업무내용", "기타 - 기타업종"],
		["급여", "500,000원 2026년 최저시급 10,320원"],
		["업무일", "정보없음"],
		["나이", "제한 없음"],
		["접수기간", "2026-07-29 ~ 2026-08-08"],
		["회사명", "세이렌(siren)"],
		["회사주소", "서울특별시 강남구 테헤란로 411 (삼성동)"],
	],
	title: "❤️에밀리❤️초보환영❤️하루100❤️",
});

// 이미지 상한(20장) 검증용. 조건을 이미지로만 적는 공고가 많아 장수가 커지는 건 실물에서
// 확인했고, 25장이라는 숫자 자체는 상한을 넘기려고 고른 값이다.
export const queenalbaGuinDetailManyImagesHtml = queenalbaDetail({
	bodyHtml: Array.from(
		{ length: 25 },
		(_unused, index) =>
			`<img src="/wys2/file_attach/2025/12/06/img${index}.jpg">`
	).join(""),
	messengerRows: "",
	rows: [
		["닉네임", "이미지많은업소"],
		["업무내용", "기타 - 기타업종"],
		["접수기간", "2026-07-29 ~ 2026-08-08"],
	],
	title: "이미지만 25장인 공고",
});

// 본문 이미지가 전량 외부 호스트인 공고. 37893은 본문 14장이 전부 tksk8080.diskn.com이었다 —
// same-origin 화이트리스트가 한 장도 없으면 외부 후보로 폴백해야 그 공고의 이미지가 산다.
// 함께 심어둔 것: same-origin 에디터 장식(/cheditor/)은 화이트리스트 밖이라 폴백에서도 빠지고,
// 같은 외부 URL이 두 번 걸려 중복 접기도 여기서 함께 못박는다.
export const queenalbaGuinDetailExternalOnlyHtml = queenalbaDetail({
	bodyHtml:
		'<img src="/cheditor/icons/deco.gif"><img src="https://tksk8080.diskn.com/2026/07/a.jpg"><img src="https://tksk8080.diskn.com/2026/07/b.jpg"><img src="https://tksk8080.diskn.com/2026/07/a.jpg">',
	messengerRows: "",
	rows: [
		["닉네임", "외부호스팅업소"],
		["업무내용", "기타 - 기타업종"],
		["접수기간", "2026-07-29 ~ 2026-08-08"],
	],
	title: "본문 이미지가 전부 외부 호스트인 공고",
});

// ---------------------------------------------------------------------------
// 퀸알바 메인페이지(유료 노출 자리)
//
// 아래 네 가지는 인증 쿠키로 받은 실물 메인(364KB)에서 확인한 것을 그대로 재현했다.
// 처음에 가정으로 짰다가 전부 틀렸던 자리라 특히 그대로 두어야 한다:
//
//  1) 배너 이미지 경로는 `../mobile_img/banner/<md5>`다. 확장자가 없고 서버가 content-type을
//     text/plain으로 준다 — 그래서 이미지 판정을 헤더가 아니라 매직 넘버로 한다.
//  2) 배너 링크는 상세로 바로 가지 않고 `banner_link.php?number=NN` 리다이렉터를 거친다.
//     공고 번호는 그 응답에만 있어서 파서는 번호만 넘기고 수집기가 한 번 더 조회한다.
//  3) 섹션 제목은 텍스트가 아니라 GIF/SVG이고, 사람이 읽을 이름은 alt에만 있다
//     (title_premium_use1.gif = "프리미엄 채용정보"). 앞 형제의 글자를 훑던 예전 방식은
//     한 건도 못 잡았고 그래서 listing_type이 전부 null이었다.
//  4) 섹션은 #content1의 **직계 자식 div** 하나씩이다. 그래서 스코프를 그 div로 못 박는다 —
//     "상세 링크를 처음 품는 조상"을 쓰던 예전 방식은 여러 섹션을 감싼 table을 잡아
//     옆 섹션 공고까지 같은 라벨을 받았다.
//
// 함께 재현한 실물 관행: 컨테이너 밖(헤더)의 상세 링크, 아이콘 gif가 카드 이미지보다 먼저
// 오는 것, 루트 없는 상대경로, 카드 하나가 이미지 링크(dt)와 제목 링크(dd.title_ellipse)로
// 갈라지는 것, 같은 공고가 여러 섹션에 겹쳐 걸리는 것, 배너 칸에 회원가입·TOP 버튼이
// 섞여 있는 것(경로로 걸러야 한다).
//
// 일부러 심어둔 함정:
//  - 기준 밖 배너 컨테이너 #main_top_center·#main_left(가로는 #main_center만 수집한다)
//  - #main_center의 외부 링크 배너(리다이렉터가 아니라 붙일 공고가 없다 → skipped 1건)
//  - 퀸알바 자체 급구·추천 섹션(우리 자리에 대응이 없어 라벨 없음). 그 안 카드 alt에
//    "최고우대"를 심어 뒀다 — 우대 매칭이 `채용`을 함께 요구하지 않으면 이 div가 통째로
//    스페셜로 라벨된다.
//  - 구직자 섹션 "스페셜인재정보"(제목에 채용이 없다). 실물은 구직자 링크지만, alt 매칭이
//    느슨해지면 바로 드러나도록 여기서는 일부러 채용 카드를 넣어 뒀다.
//  - 섹션에 안 든 일반 카드(실시간 등록)
// ---------------------------------------------------------------------------

// 메인 배너 한 칸.
const mainBanner = (href: string, hash: string, alt: string): string =>
	`<a href="${href}"><img src="../mobile_img/banner/${hash}" alt="${alt}"></a>`;

// 메인 섹션 카드 한 칸. 썸네일이 있는 카드는 아이콘 gif가 카드 이미지보다 먼저 온다.
const mainCard = (id: string, title: string, thumbnail = true): string => `
<td><dl>
	<dt><a href="./guin_detail.php?num=${id}&pg=">${
		thumbnail
			? `<img src="img/icon_medal.gif"><img src="./upload/happy_member/2026/07/20/${id}.gif" alt="${title}">`
			: `<font><strong>${title}</strong></font>`
	}</a></dt>
	<dd><a href="./guin_detail.php?num=${id}&pg=" class="title_ellipse"><span><font>${title}</font></span></a></dd>
</dl></td>`;

// 섹션 하나 = #content1의 직계 자식 div 하나. 제목 이미지가 표 안 h2에 들어 있고, 파일명은
// 뜻을 담지 않아(title_premium_use1.gif) alt만 읽을 수 있다. 자체 급구·추천처럼 제목 둘이
// 한 div를 나눠 쓰는 자리가 있어 배열로 받는다.
const mainSection = (
	titles: readonly [file: string, alt: string][],
	cards: string
): string => `
<div><table><tbody>
	<tr><td>${titles.map(([file, alt]) => `<h2><img src="img/${file}" alt="${alt}"></h2>`).join("")}</td></tr>
	<tr>${cards}</tr>
</tbody></table></div>`;

export const queenalbaMainHtml = page(`
<div id="header"><a href="./guin_detail.php?num=99999&pg="><img src="./upload/happy_member/2026/07/20/99999.gif"></a></div>
<div id="main_top_center">
	<table><tbody><tr>
		<td>${mainBanner("banner_link.php?number=11", "9f5ba1d6e7e6cf3b3ea0e6ef3f8f0b21", "기준 밖 배너 A")}</td>
	</tr></tbody></table>
</div>
<div id="main_left">
	<table><tbody><tr>
		<td>${mainBanner("banner_link.php?number=12", "1b0d3c5a2e2f4a6b8c0d2e4f6a8b0c1d", "기준 밖 배너 B")}</td>
	</tr></tbody></table>
</div>
<div id="main_center">
	<table><tbody><tr>
		<td>${mainBanner("banner_link.php?number=77", "8b68d5e4425482c53bc6c819192cc562", "❤️에밀리❤️ 강남 최고대우")}</td>
		<td><a href="banner_link.php?number=78"><img src="img/icon_new.gif"><img src="../mobile_img/banner/a429bcdf625c91542e84c72c4f491211" alt="배너"></a></td>
		<td>${mainBanner("./event_view.php?ev=summer", "66cec1d83667dbd343851476f5add24a", "여름 이벤트")}</td>
	</tr></tbody></table>
</div>
<div id="divMenu2">
	<div>${mainBanner("banner_link.php?number=53", "2558b0f5498ce229ba4ee285b1323b3d", "세로배너 에밀리")}</div>
	<div><a href="/happy_member.php?mode=joinus"><img src="img/right_btn_join.png"></a></div>
</div>
<div id="divMenu12">
	<div>${mainBanner("banner_link.php?number=74", "14e561247f0634faaa5fcf05019cfefc", "세로배너 C")}</div>
	<div>${mainBanner("banner_link.php?number=60", "4b45438e6af37a9731d744cd6fc739bc", "세로배너 카톡 sidekakao")}</div>
	<div><a href="#"><img src="img/right_btn_top.png"></a></div>
</div>
<div id="content1">
	<div class="tit_area"><h2>실시간 등록</h2></div>
	<div><table><tbody><tr>${mainCard("40001", "일반 채용 카드")}</tr></tbody></table></div>
	${mainSection([["title_premium_use1.gif", "프리미엄 채용정보"]], `${mainCard("16100", "급구 카톡 shopkakao", false)}${mainCard("37428", "강남1등 도파민")}`)}
	${mainSection([["title_special_use1.svg", "스페셜 채용정보"]], `${mainCard("29431", "박서준이사")}${mainCard("36659", "❤️에밀리❤️ 초보환영")}`)}
	${mainSection([["title_use_guin1.gif", "우대등록 채용정보"]], `${mainCard("25073", "이찌니 우대")}${mainCard("36659", "❤️에밀리❤️ 초보환영")}`)}
	${mainSection(
		[
			["title_speed_use1.gif", "급구채용"],
			["title_cucun_use1.gif", "추천채용"],
		],
		`${mainCard("41001", "최고우대 강남")}${mainCard("41002", "추천 카드")}`
	)}
	${mainSection([["title_special_person1.gif", "스페셜인재정보"]], mainCard("50501", "구직 섹션 카드"))}
</div>`);

interface QueenalbaTopicRow {
	author: string;
	// 일반 글은 댓글수·조회수 칸이 비어 있고, 댓글 수가 제목 뒤 "[21]"로만 온다.
	commentSuffix: string;
	date: string;
	id: string;
	notice: boolean;
	noticeCommentCount: string;
	noticeViewCount: string;
	title: string;
}

const queenalbaTopicRow = (row: QueenalbaTopicRow): string => {
	const query = row.notice
		? `bbs_detail.php?bbs_num=${row.id}&top_gonggi=1&tb=comm_board2&id=&pg=1`
		: `bbs_detail.php?bbs_num=${row.id}&tb=comm_board2&id=&pg=1`;

	return `
<tr height="30">
	<td width="54" align="center">${row.notice ? "" : "추천"}</td>
	<td width="70" align="center"><a href="${query}"><img src="upload/happy_config/IconData2.gif"></a></td>
	<td align="left">${row.notice ? '<font color="#FF6D01">[공지]</font> ' : ""}<a href="./${query}"><font>${row.title}</font></a>${row.commentSuffix}</td>
	<td width="100" align="center">${row.author}</td>
	<td width="100" align="center">${row.date}</td>
	<td width="40" align="center">${row.noticeCommentCount}</td>
	<td width="64" align="center">${row.noticeViewCount}</td>
</tr>`;
};

const topic = (
	id: string,
	title: string,
	author: string,
	date: string,
	comments: number
): QueenalbaTopicRow => ({
	author,
	commentSuffix: ` [${comments}]`,
	date,
	id,
	notice: false,
	noticeCommentCount: "",
	noticeViewCount: "",
	title,
});

const notice = (
	id: string,
	title: string,
	views: string
): QueenalbaTopicRow => ({
	author: "퀸알바",
	commentSuffix: "",
	date: "2016-07-04",
	id,
	notice: true,
	noticeCommentCount: "21",
	noticeViewCount: views,
	title,
});

const queenalbaTopicRows: QueenalbaTopicRow[] = [
	// 상단 고정 공지. 조회수가 20만대라 걸러내지 않으면 주제 반응 표의 상위권을 차지한다.
	notice("67", "커뮤니티 운영정책 및 변경사항 안내", "225033"),
	notice("65", "커뮤니티 이용개선 및 변경사항 안내", "282811"),
	topic(
		"1370389",
		"일할때 술 안먹는 비결 알려주실 언니..",
		"바보인간",
		"2026-07-26",
		21
	),
	topic(
		"1370243",
		"힘든 시기를 보내고 있는 언니들에게~",
		"ㅇㅇ",
		"2026-07-26",
		9
	),
	topic("1370217", "전 20대 젊손이랑 텐션 안맞아요.", "ㄴ", "2026-07-26", 11),
	topic("1370207", "갑자기 웃겻던 썰", "ㅊㅊ", "2026-07-26", 12),
	topic("1369758", "잘되는 하퍼수니 사쥬업 역사", "ㅇ", "2026-07-27", 31),
];

export const queenalbaBbsListHtml = page(`
<div id="sub_center">
	<h1>밤문화이야기</h1>
	<table><tbody>${queenalbaTopicRows.map(queenalbaTopicRow).join("")}</tbody></table>
</div>`);

// 게시글 상세. 목록에 없는 세 가지가 여기서 온다.
//  - 본문은 #ct 한 덩어리다
//  - 조회수는 추천 수와 같은 칸에 들어 있어("조회 : 176 추천: 0") 라벨로 끊어 읽어야 한다
//  - 제목은 목록의 h2(게시판명)가 아니라 .board-title-container h1이다
//  - 댓글은 상세 HTML에 인라인으로 전부 렌더돼 있다. 댓글 하나 = TR 하나, 셀 3개 =
//    [작성자 | 본문 td#comment_id_N | 작성일시]. 본문 셀의 직계 자식은 세 변형이 있고(마커
//    span형·아이콘 img형·대댓글 단일 span형) 전부 실물 그대로 재현했다. 파서는 "직계 자식
//    span 중 마지막 것"을 본문으로 읽으므로 앞의 [N] 마커나 아이콘은 빠져야 한다. secret-comment
//    (비밀댓글) 한 건을 함께 심어 스킵을, 대댓글의 빈 날짜 칸으로 날짜 null 폴백을 못박는다.
export const queenalbaBbsDetailHtml = page(`
<div id="sub_center">
	<h2><img src="img/bbs_title_night.gif" alt="밤문화이야기 게시판"> 밤문화이야기</h2>
	<table><tbody>
		<tr><td><div class="board-title-container"><h1>일할때 술 안먹는 비결 알려주실 언니..</h1></div></td></tr>
		<tr>
			<td>작성인</td>
			<td align="right" class="smfont2"> 조회 : 2,377<span style="color: #ff0000;">&nbsp;&nbsp;&nbsp;추천: 1</span> </td>
		</tr>
	</tbody></table>
	<div>
		<div id="ct" align="justify"> 저는 뭔 ㄴㄷ 다니는데도 술을 먹네요<br><br>문의 010-1234-5678<br>카톡 shopkakao </div>
	</div>
	<table><tbody>
		<tr>
			<td align="center">여의도언니</td>
			<td id="comment_id_1"><span class="cmt-num">[1]</span><span>여의도 하퍼 오세요 ⭐010-5000-1507⭐ 카톡:ssiee123aa</span></td>
			<td align="center">2026-07-26 14:30:12</td>
		</tr>
		<tr>
			<td align="center">ㅇㅇ</td>
			<td id="comment_id_2"><img src="upload/happy_config/re_icon.gif"><span>맞아요 저도 술 안 먹어요</span></td>
			<td align="center">2026-07-26 15:02:00</td>
		</tr>
		<tr>
			<td align="center">ㅊㅊ</td>
			<td id="comment_id_3"><span>ㄴ 저는 대댓글이에요</span></td>
			<td align="center"></td>
		</tr>
		<tr class="secret-comment">
			<td align="center">비밀언니</td>
			<td id="comment_id_4" class="secret-comment"><span>비밀 댓글 본문입니다</span></td>
			<td align="center">2026-07-26 16:00:00</td>
		</tr>
	</tbody></table>
</div>`);

// 조회수 칸이 비어 있는 글. 실측에서 흔했다 — 칸(td.smfont2)은 그대로 있고 내용만 없다.
// 본문은 멀쩡한데 조회수만 없는 상태를 파싱 실패로 보면 멀쩡한 글이 매 회차 다시 시도된다.
export const queenalbaBbsDetailNoViewsHtml = page(`
<div id="sub_center">
	<table><tbody>
		<tr><td><div class="board-title-container"><h1>에이스병 어캐고쳐요..</h1></div></td></tr>
		<tr><td>작성인</td><td align="right" class="smfont2"></td></tr>
	</tbody></table>
	<div><div id="ct"> 하이다니다 개인사정으로 지금 하퍼 나가고있는데 </div></div>
</div>`);
