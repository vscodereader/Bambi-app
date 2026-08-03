// 국세청 사업자등록정보 진위확인(공공데이터포털 odcloud). portone-identity와 같은 축으로
// env·db에 의존하지 않는 순수 모듈로 둔다 — 서비스키는 호출부가 넘긴다.

const NTS_VALIDATE_URL =
	"https://api.odcloud.kr/api/nts-businessman/v1/validate";

// 장애·지연 이력이 잦은 API라 응답을 무한정 기다리면 제출 요청이 통째로 묶인다.
const TIMEOUT_MS = 10_000;

export interface BiznumValidation {
	// 사업자번호·대표자명·개업일자가 국세청 등록 정보와 모두 일치했는지(valid "01").
	matched: boolean;
	// 납세자 상태 코드 b_stt_cd — "01" 계속사업자 / "02" 휴업 / "03" 폐업.
	// 불일치·미등록이면 빈 문자열로 오므로 null로 정규화한다.
	statusCode: string | null;
}

// 진위확인 1건. HTTP는 항상 200이고 판정은 응답 값에만 들어 있으므로, 통신 자체가
// 실패한 경우(HTTP 오류·타임아웃·네트워크)만 throw한다 — 호출부가 "국세청이 불일치라고
// 했다"와 "국세청에 물어보지 못했다"를 구분해야 하기 때문이다.
export async function validateBiznum(
	serviceKey: string,
	{ bNo, pNm, startDt }: { bNo: string; pNm: string; startDt: string }
): Promise<BiznumValidation> {
	const response = await fetch(
		`${NTS_VALIDATE_URL}?serviceKey=${encodeURIComponent(serviceKey)}&returnType=JSON`,
		{
			method: "POST",
			headers: { "Content-Type": "application/json" },
			// 쓰지 않는 대조 항목도 빈 문자열로 채워 보내는 게 이 API의 관례다(누락 시 400).
			body: JSON.stringify({
				businesses: [
					{
						b_no: bNo,
						start_dt: startDt,
						p_nm: pNm,
						p_nm2: "",
						b_nm: "",
						corp_no: "",
						b_sector: "",
						b_type: "",
						b_adr: "",
					},
				],
			}),
			signal: AbortSignal.timeout(TIMEOUT_MS),
		}
	);
	if (!response.ok) {
		throw new Error(`국세청 진위확인에 실패했습니다(HTTP ${response.status}).`);
	}
	const payload = (await response.json()) as {
		data?: { status?: { b_stt_cd?: string }; valid?: string }[];
	};
	const result = payload.data?.[0];
	return {
		matched: result?.valid === "01",
		statusCode: result?.status?.b_stt_cd || null,
	};
}
