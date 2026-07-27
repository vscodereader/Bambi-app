import type { Metadata } from "next";
import {
	LegalDoc,
	LegalList,
	LegalParagraph,
	LegalSection,
	LegalSubheading,
	LegalTable,
} from "@/components/bambi/legal-doc";
import {
	PrivacyContactLine,
	PrivacyProcessorsTable,
	PrivacyRetentionDays,
} from "@/components/bambi/privacy-contacts";
import { BAMBI_COMPANY } from "@/lib/bambi/company";

export const metadata: Metadata = {
	title: "개인정보 처리방침 | 밤비",
	description: "밤비 개인정보 처리방침",
};

export default function PrivacyPage() {
	return (
		<LegalDoc
			effectiveDate="2026년 7월 27일"
			intro={
				<>
					<LegalParagraph>
						밤비({BAMBI_COMPANY.url} 이하 "회사"라 함)는 이용자의 개인정보를
						중요하게 생각하며, 이용자가 회사의 서비스(이하 "밤비 서비스" 또는
						"밤비"라 함)를 이용하면서 제공한 개인정보가 보호받을 수 있도록
						최선을 다하고 있습니다.
					</LegalParagraph>
					<LegalParagraph>
						회사는 「개인정보 보호법」 및 「정보통신망 이용촉진 및 정보보호 등에
						관한 법률」 등 관계 법령과 개인정보보호위원회가 정한 지침을 준수하고
						있습니다.
					</LegalParagraph>
					<LegalParagraph>
						회사는 이 개인정보 처리방침을 통하여 이용자가 제공하는 개인정보가
						어떠한 목적과 방식으로 처리되고 있으며 개인정보 보호를 위해 어떠한
						조치가 취해지고 있는지 알려드립니다. 이 처리방침은 홈페이지 하단에서
						언제든지 확인할 수 있습니다.
					</LegalParagraph>
					<LegalParagraph>
						밤비는 만 19세 이상만 이용할 수 있는 성인 대상 서비스입니다. 회사는
						휴대폰 본인확인을 통해 만 19세 미만의 가입과 이용을 차단하고 있으며,
						만 14세 미만 아동의 개인정보를 수집하지 않습니다.
					</LegalParagraph>
				</>
			}
			title="개인정보 처리방침"
		>
			<LegalSection heading="1. 수집하는 개인정보의 항목과 수집 방법">
				<LegalSubheading>
					가. 회원가입 시 (개인회원·업소회원 공통)
				</LegalSubheading>
				<LegalParagraph>
					- 필수항목 : 닉네임, 아이디, 비밀번호, 이메일
				</LegalParagraph>
				<LegalParagraph>
					회사는 회원가입 단계에서 성명·주소·연락처를 수집하지 않습니다.
				</LegalParagraph>

				<LegalSubheading>나. 업소회원의 업체 인증 시</LegalSubheading>
				<LegalParagraph>- 필수항목 : 업체명, 사업자등록번호</LegalParagraph>
				<LegalParagraph>
					업소회원이 채용공고를 등록하려면 위 정보를 제출해 회사의 심사를 거쳐야
					합니다.
				</LegalParagraph>

				<LegalSubheading>다. 성인 인증(만 19세 이상 확인) 시</LegalSubheading>
				<LegalParagraph>
					본인확인은 포트원(주)의 인증창(엔에이치엔케이씨피(NHN KCP) 휴대폰
					본인확인)을 통해 이루어집니다. 이름·주민등록번호 앞자리·통신사 정보는
					인증창에 직접 입력되어 인증기관에서 처리되며, 회사의 시스템을
					경유하거나 저장되지 않습니다.
				</LegalParagraph>
				<LegalParagraph>
					- 인증 완료 후 회사가 전달받는 정보 : 이름, 생년월일, 성별,
					휴대폰번호, 연계정보(CI), 중복가입확인정보(DI)
				</LegalParagraph>
				<LegalParagraph>
					- 회원 데이터베이스에 저장하는 정보 : 휴대폰번호, 성별, 생년월일과,
					연계정보(CI)·중복가입확인정보(DI)를 복호화할 수 없도록 일방향
					암호화(SHA-256 해시)한 값
				</LegalParagraph>
				<LegalParagraph>
					- 저장하지 않는 정보 : 이름, 통신사 정보,
					연계정보(CI)·중복가입확인정보(DI) 원문
				</LegalParagraph>
				<LegalParagraph>
					비회원(게스트)으로 성인 인증만 하는 경우 서버에는 어떠한 정보도
					저장하지 않으며, 이용자의 브라우저 쿠키(bambi_guest, 유효기간 30일)에
					서명된 토큰으로 성별과 만료 시각만 보관합니다.
				</LegalParagraph>

				<LegalSubheading>
					라. 서비스 이용 과정에서 자동으로 생성·수집되는 정보
				</LegalSubheading>
				<LegalParagraph>
					- 로그인 세션 관리를 위한 접속 IP 주소, 브라우저·기기 정보
				</LegalParagraph>
				<LegalParagraph>
					- 서비스 이용 기록(채용공고 노출·조회·클릭 등 통계 목적의 행위 기록.
					접속 IP 주소를 함께 저장하지 않습니다)
				</LegalParagraph>
				<LegalParagraph>- 쿠키(제7항 참조)</LegalParagraph>

				<LegalSubheading>마. 이용자가 직접 입력하는 정보</LegalSubheading>
				<LegalParagraph>
					채용공고, 1:1 채팅 메시지와 첨부파일, 커뮤니티 게시글·댓글, 리뷰,
					고객센터 문의 내용 등 이용자가 서비스에 입력하거나 업로드한 정보가
					수집됩니다.
				</LegalParagraph>

				<LegalSubheading>바. 유료 광고 상품 결제 시</LegalSubheading>
				<LegalParagraph>
					회사는 무통장입금 방식만 운영하며, 신용카드 번호·계좌번호 등 이용자의
					결제수단 정보를 수집하거나 저장하지 않습니다. 입금 확인은 회사 명의
					계좌의 입금 내역으로 처리합니다.
				</LegalParagraph>
			</LegalSection>

			<LegalSection heading="2. 개인정보의 처리 목적">
				<LegalSubheading>가. 서비스 제공</LegalSubheading>
				<LegalParagraph>
					채용공고 등록·열람, 구인자와 구직자 간 1:1 채팅 및 면접 일정 조율,
					커뮤니티 이용, 리뷰 작성, 연락처 공개 중개, 고객센터 문의 응대
				</LegalParagraph>

				<LegalSubheading>나. 회원 관리</LegalSubheading>
				<LegalParagraph>
					본인확인 및 개인식별, 만 19세 이상 성인 확인과 미성년자 이용 차단,
					연계정보(CI) 해시값 대조를 통한 중복 가입 및 부정 재가입 방지, 성별에
					따른 서비스 접근 관리(커뮤니티 등), 불량회원의 부정 이용과 비인가 사용
					방지, 고지사항 전달
				</LegalParagraph>

				<LegalSubheading>다. 신고 처리 및 분쟁 대응</LegalSubheading>
				<LegalParagraph>
					이용자의 신고가 접수되거나 법령·이용약관 위반이 의심되는 경우, 회사는
					신고 사실의 확인과 조치를 위해 해당 채팅방의 대화 내용, 게시물, 문의
					내역을 열람할 수 있습니다. 열람은 신고 처리와 분쟁 해결에 필요한
					범위로 한정하며, 그 이력은 별도로 기록·관리됩니다.
				</LegalParagraph>

				<LegalSubheading>라. 서비스 개선 및 통계</LegalSubheading>
				<LegalParagraph>
					접속 빈도 파악, 서비스 이용에 대한 통계 분석, 이를 통한 서비스 품질
					개선
				</LegalParagraph>
				<LegalParagraph>
					회사는 이용자에게 광고성 정보를 전송하거나 맞춤형 광고를 제공하기 위한
					목적으로 개인정보를 처리하지 않습니다. 향후 그러한 처리가 필요한 경우
					별도의 동의를 받겠습니다.
				</LegalParagraph>
			</LegalSection>

			<LegalSection heading="3. 개인정보의 보유 및 이용기간">
				<LegalParagraph>
					이용자의 개인정보는 처리 목적이 달성되면 지체 없이 파기하는 것을
					원칙으로 합니다.
				</LegalParagraph>

				<LegalSubheading>가. 회원 탈퇴 시</LegalSubheading>
				<LegalParagraph>
					탈퇴 신청 즉시 비밀번호 등 인증정보, 휴대폰번호, 성별, 생년월일을
					파기하고, 이메일 주소는 식별할 수 없는 값으로 치환하며, 프로필
					표시명은 '탈퇴한 회원'으로 변경합니다.
				</LegalParagraph>
				<LegalParagraph>
					다만 이용약관에 따라 이용이 제한된 회원의 부정 재가입을 막기 위하여,
					본인확인 식별값(연계정보(CI)·중복가입확인정보(DI)의 일방향 암호화
					값)만 탈퇴일로부터 <PrivacyRetentionDays />일 동안 보관한 뒤
					파기합니다. 이 값은 재가입 차단 목적 외에는 이용하지 않습니다. 보관
					기간은 회사의 정책에 따라 변경될 수 있으며, 변경 시 이 처리방침과 회원
					탈퇴 화면에 표시되는 기간이 함께 갱신됩니다.
				</LegalParagraph>
				<LegalParagraph>
					이용자가 작성한 채용공고, 채팅 메시지, 커뮤니티 게시글, 리뷰는 대화
					상대방 등 다른 이용자의 기록을 보호하기 위해 작성자 표시를 '탈퇴한
					회원'으로 바꾼 상태로 유지됩니다.
				</LegalParagraph>

				<LegalSubheading>나. 비회원 성인 인증</LegalSubheading>
				<LegalParagraph>
					비회원(게스트) 성인 인증 쿠키(bambi_guest)는 발급 후 30일이 지나거나
					회원 로그인·로그아웃 시 즉시 만료됩니다.
				</LegalParagraph>

				<LegalSubheading>다. 관계 법령에 따른 보존</LegalSubheading>
				<LegalParagraph>
					아래 기록이 발생한 경우에 한하여, 관계 법령이 정한 기간 동안 해당
					정보를 다른 개인정보와 분리하여 보관하며 그 보관 목적으로만
					이용합니다.
				</LegalParagraph>
				<LegalTable
					head={["보존 항목", "보존 근거 및 기간"]}
					rows={[
						[
							"소비자의 불만 또는 분쟁처리에 관한 기록",
							"전자상거래 등에서의 소비자보호에 관한 법률 — 3년",
						],
						[
							"계약 또는 청약철회 등에 관한 기록",
							"전자상거래 등에서의 소비자보호에 관한 법률 — 5년",
						],
						[
							"대금결제 및 재화 등의 공급에 관한 기록",
							"전자상거래 등에서의 소비자보호에 관한 법률 — 5년",
						],
					]}
				/>
			</LegalSection>

			<LegalSection heading="4. 개인정보의 제3자 제공">
				<LegalParagraph>
					회사는 이용자의 개인정보를 이 처리방침에서 고지한 범위를 넘어 외부에
					제공하지 않습니다. 다만 이용자가 사전에 동의한 경우, 법령에 따라 제출
					의무가 발생한 경우, 이용자의 생명이나 안전에 급박한 위험이 확인되어
					이를 해소하기 위한 경우에 한하여 개인정보를 제공합니다.
				</LegalParagraph>

				<LegalSubheading>가. 구인자 연락처의 공개</LegalSubheading>
				<LegalParagraph>
					구인자(업소회원)가 본인확인을 완료하고 채용공고를 등록하면, 해당
					휴대폰번호는 구직 상담을 받기 위한 연락 수단으로 채용공고 상세 화면에
					공개됩니다. 공개를 원하지 않는 경우 채용공고를 등록하지 않거나 등록된
					공고를 삭제할 수 있습니다.
				</LegalParagraph>

				<LegalSubheading>나. 구직자 연락처의 공개</LegalSubheading>
				<LegalParagraph>
					구직자(개인회원)의 휴대폰번호는 공개되지 않습니다. 구인자가 채팅방에서
					연락처 공개를 요청하고 구직자가 이에 동의한 경우에 한하여 해당
					구인자에게만 공개되며, 구직자는 요청을 거절할 수 있습니다.
				</LegalParagraph>
			</LegalSection>

			<LegalSection heading="5. 개인정보 처리업무의 위탁">
				<LegalParagraph>
					회사는 서비스 제공을 위해 아래와 같이 개인정보 처리업무를 위탁하고
					있습니다. 위탁계약 시 「개인정보 보호법」에 따라 위탁업무 수행 목적 외
					개인정보 처리 금지, 안전성 확보조치, 재위탁 제한, 수탁자에 대한
					관리·감독, 손해배상 등 책임에 관한 사항을 문서에 명시하고 수탁자가
					개인정보를 안전하게 처리하는지 감독합니다. 위탁업무의 내용이나
					수탁자가 변경될 경우 지체 없이 이 처리방침을 통해 공개합니다.
				</LegalParagraph>
				<PrivacyProcessorsTable />
				<LegalParagraph className="pt-2">
					휴대폰 본인확인은 포트원(주)의 본인인증 서비스를 통해 이루어지며, 실제
					본인확인은 인증기관인 엔에이치엔케이씨피(NHN KCP)와 이동통신
					3사(SK텔레콤·KT·LG U+ 및 이들의 통신망을 사용하는 알뜰폰 사업자)를
					통해 처리됩니다.
				</LegalParagraph>
			</LegalSection>

			<LegalSection heading="6. 개인정보의 국외 이전">
				<LegalParagraph>
					회사는 서비스 제공에 필요한 범위에서 아래와 같이 개인정보 처리업무를
					국외 사업자에게 위탁하며, 이전되는 정보는 위탁 목적 범위에서만
					처리됩니다.
				</LegalParagraph>
				<LegalTable
					head={[
						"이전받는 자",
						"이전 국가",
						"이전 항목",
						"이전 시기 및 방법",
						"이용 목적 및 보유기간",
					]}
					rows={[
						[
							"Google LLC",
							"미국",
							"업로드한 이미지 파일, 접속 기록 및 쿠키 식별자",
							"서비스 이용 시 네트워크를 통한 전송",
							"이미지 저장 및 웹 이용 통계 분석 / 위탁계약 종료 시까지(통계 정보는 최대 14개월)",
						],
						[
							"Vercel Inc.",
							"미국",
							"접속 IP 주소, 브라우저 정보, 요청 정보",
							"서비스 접속 시 네트워크를 통한 전송",
							"웹 서비스 호스팅 / 처리 목적 달성 후 지체 없이 파기",
						],
					]}
				/>
				<LegalParagraph className="pt-2">
					이용자는 개인정보의 국외 이전을 거부할 수 있습니다. 거부를 원하는 경우
					회원 탈퇴를 하거나 아래 개인정보 보호책임자에게 요청할 수 있으며, 웹
					이용 통계 목적의 이전은 제7항의 방법으로 쿠키를 차단하여 거부할 수
					있습니다. 다만 서비스 제공에 필수적인 이전을 거부하는 경우 서비스
					이용이 제한될 수 있습니다.
				</LegalParagraph>
			</LegalSection>

			<LegalSection heading="7. 개인정보 자동 수집 장치의 설치·운영 및 그 거부에 관한 사항">
				<LegalParagraph>
					회사는 이용자에게 개별적인 서비스를 제공하기 위해 쿠키(cookie)를
					사용합니다. 쿠키는 웹사이트가 이용자의 브라우저에 저장하는 소량의
					정보입니다.
				</LegalParagraph>
				<LegalTable
					head={["쿠키", "목적", "보관 기간"]}
					rows={[
						[
							"로그인 세션 쿠키",
							"로그인 상태 유지 및 인증",
							"로그아웃 또는 세션 만료 시까지",
						],
						[
							"bambi_guest",
							"비회원의 성인 인증 결과 보관(성별·만료 시각)",
							"발급 후 30일(로그인·로그아웃 시 즉시 만료)",
						],
						[
							"_ga, _ga_HNVZKKB0NX",
							"Google Analytics를 통한 방문 통계 분석",
							"약 2년",
						],
					]}
				/>
				<LegalParagraph className="pt-2">
					회사는 Google Analytics를 방문 통계 확인 목적으로만 사용하며, 광고
					개인화 및 다른 웹사이트에서의 행태정보 수집 기능은 사용하지 않도록
					설정하고 있습니다.
				</LegalParagraph>
				<LegalSubheading>쿠키 설치·운영의 거부 방법</LegalSubheading>
				<LegalList
					items={[
						"웹 브라우저 설정에서 쿠키를 허용하거나 차단할 수 있습니다. (예: Chrome — 설정 › 개인 정보 보호 및 보안 › 서드 파티 쿠키, Safari — 설정 › 개인정보 보호)",
						"Google Analytics의 정보 수집은 Google이 제공하는 차단 브라우저 부가기능(tools.google.com/dlpage/gaoptout)을 설치하여 거부할 수 있습니다.",
						"쿠키를 차단하면 로그인 상태 유지와 성인 인증이 정상적으로 동작하지 않아 서비스 이용이 제한될 수 있습니다.",
					]}
				/>
			</LegalSection>

			<LegalSection heading="8. 개인정보의 파기 절차 및 방법">
				<LegalParagraph>
					회사는 보유기간이 경과하거나 처리 목적이 달성되어 개인정보가
					불필요하게 되었을 때에는 지체 없이 해당 정보를 파기합니다. 다른 법령에
					따라 보존해야 하는 정보는 그 기간 동안 다른 개인정보와 분리하여
					저장·관리한 뒤 파기합니다.
				</LegalParagraph>
				<LegalParagraph>
					전자적 파일 형태로 저장된 개인정보는 기록을 재생할 수 없는 기술적
					방법으로 삭제하며, 종이에 출력된 개인정보는 분쇄기로 분쇄하거나
					소각합니다.
				</LegalParagraph>
			</LegalSection>

			<LegalSection heading="9. 개인정보의 안전성 확보조치">
				<LegalParagraph>
					회사는 개인정보의 안전성 확보를 위해 다음과 같은 조치를 취하고
					있습니다.
				</LegalParagraph>
				<LegalList
					items={[
						"비밀번호는 복호화할 수 없도록 일방향 암호화하여 저장합니다.",
						"본인확인 식별값(연계정보(CI)·중복가입확인정보(DI))은 원문을 저장하지 않고 일방향 암호화(SHA-256 해시)한 값만 저장합니다.",
						"이용자와 서비스 사이의 모든 통신 구간을 암호화(HTTPS)하여 전송합니다.",
						"개인정보에 접근할 수 있는 권한을 업무 수행에 필요한 최소한의 인원으로 제한하고, 운영자 기능은 별도의 권한 검사를 거치도록 분리해 운영합니다.",
						"비회원 성인 인증 토큰에 위·변조를 검증하는 전자서명을 적용합니다.",
						"업로드되는 파일의 형식과 용량을 서버에서 검증해 허용된 범위만 저장합니다.",
					]}
				/>
			</LegalSection>

			<LegalSection heading="10. 정보주체의 권리와 행사 방법">
				<LegalParagraph>
					이용자는 언제든지 자신의 개인정보에 대한 열람, 정정, 삭제, 처리정지를
					요구할 수 있습니다.
				</LegalParagraph>
				<LegalList
					items={[
						"개인회원은 '내 정보 > 계정 설정'에서, 업소회원은 '업체 정보'와 '조직 설정'에서 자신의 정보를 직접 조회하고 수정할 수 있습니다.",
						"화면에서 직접 수정할 수 없는 항목의 열람·정정·삭제·처리정지 요구는 고객센터 문의 또는 아래 개인정보 보호책임자의 연락처로 접수할 수 있으며, 회사는 지체 없이 필요한 조치를 하겠습니다.",
						"이용자는 언제든지 '회원 탈퇴'를 통해 개인정보의 수집 및 이용 동의를 철회할 수 있습니다.",
						"이용자가 개인정보의 오류에 대한 정정을 요청한 경우, 정정을 완료하기 전까지 해당 개인정보를 이용하거나 제공하지 않습니다. 잘못된 개인정보를 이미 제3자에게 제공한 경우에는 정정 처리 결과를 지체 없이 통지하여 정정이 이루어지도록 하겠습니다.",
						"이용자의 요구는 법정대리인이나 위임을 받은 자 등 대리인을 통해서도 할 수 있습니다.",
					]}
				/>
			</LegalSection>

			<LegalSection heading="11. 개인정보 보호책임자">
				<LegalParagraph>
					회사는 개인정보 처리에 관한 업무를 총괄하고 이용자의 불만 처리 및 피해
					구제를 담당하는 개인정보 보호책임자를 지정하고 있습니다. 개인정보의
					열람 청구도 아래 연락처로 접수할 수 있습니다.
				</LegalParagraph>
				<LegalParagraph>
					담당 부서 : {BAMBI_COMPANY.privacyOfficer.dept}
				</LegalParagraph>
				<PrivacyContactLine />
			</LegalSection>

			<LegalSection heading="12. 권익침해에 대한 구제방법">
				<LegalParagraph>
					개인정보 침해로 인한 상담이나 피해 구제가 필요한 경우 아래 기관에
					문의할 수 있습니다.
				</LegalParagraph>
				<LegalTable
					head={["기관", "연락처", "홈페이지"]}
					rows={[
						["개인정보분쟁조정위원회", "1833-6972", "www.kopico.go.kr"],
						["개인정보침해신고센터", "(국번없이) 118", "privacy.kisa.or.kr"],
						["대검찰청 사이버수사과", "(국번없이) 1301", "www.spo.go.kr"],
						["경찰청 사이버수사국", "(국번없이) 182", "ecrm.police.go.kr"],
					]}
				/>
			</LegalSection>

			<LegalSection heading="13. 개인정보 처리방침의 변경">
				<LegalParagraph>
					이 개인정보 처리방침의 내용에 추가, 삭제, 수정이 있을 때에는 시행 최소
					7일 전부터 홈페이지의 '공지사항'을 통해 고지합니다. 다만 개인정보의
					수집 및 이용 목적, 제3자 제공, 국외 이전 등 이용자 권리에 중요한
					변경이 있는 경우에는 최소 30일 전에 고지합니다.
				</LegalParagraph>
			</LegalSection>
		</LegalDoc>
	);
}
