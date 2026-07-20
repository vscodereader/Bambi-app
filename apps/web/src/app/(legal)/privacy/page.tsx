import type { Metadata } from "next";
import {
	LegalDoc,
	LegalList,
	LegalParagraph,
	LegalSection,
	LegalSubheading,
	LegalTable,
} from "@/components/bambi/legal-doc";
import { BAMBI_COMPANY, BAMBI_PROCESSORS } from "@/lib/bambi/company";

export const metadata: Metadata = {
	title: "개인정보 처리방침 | 밤비",
	description: "밤비 개인정보 처리방침",
};

export default function PrivacyPage() {
	return (
		<LegalDoc
			effectiveDate="2026년 7월 10일"
			intro={
				<>
					<LegalParagraph>
						밤비({BAMBI_COMPANY.url} 이하 "회사"라 함)는 이용자들의
						개인정보보호를 매우 중요시하며, 이용자가 회사의 서비스(이하 "밤비
						서비스" 또는 "밤비"라 함)를 이용함과 동시에 온라인상에서 회사에
						제공한 개인정보가 보호받을 수 있도록 최선을 다하고 있습니다.
					</LegalParagraph>
					<LegalParagraph>
						이에 회사는 통신비밀보호법, 전기통신사업법, 정보통신망 이용촉진 및
						정보보호 등에 관한 법률 등 정보통신서비스제공자가 준수하여야 할 관련
						법규상의 개인정보보호규정 및 관계 부처가 제정한 개인정보보호지침을
						준수하고 있습니다.
					</LegalParagraph>
					<LegalParagraph>
						회사는 개인정보 처리방침을 통하여 이용자들이 제공하는 개인정보가
						어떠한 용도와 방식으로 이용되고 있으며 개인정보보호를 위해 어떠한
						조치가 취해지고 있는지 알려드립니다. 회사는 개인정보 처리방침을
						홈페이지 첫 화면에 공개함으로써 이용자들이 언제나 용이하게 확인할 수
						있도록 조치하고 있습니다.
					</LegalParagraph>
					<LegalParagraph>
						회사의 개인정보 처리방침은 정부의 법률 및 지침 변경이나 회사의 내부
						방침 변경 등으로 인하여 수시로 변경될 수 있으며, 개정하는 경우
						회사는 변경 시행 7일 전부터 사이트 공지사항을 통하여 공지하고
						버전번호 및 개정일자 등을 부여하여 개정된 사항을 이용자들이 쉽게
						알아볼 수 있도록 하고 있습니다.
					</LegalParagraph>
				</>
			}
			title="개인정보 처리방침"
		>
			<LegalSection heading="수집하는 개인정보의 항목">
				<LegalParagraph>
					가. 회사는 회원가입, 원활한 고객상담, 각종 서비스의 제공을 위해 최초
					회원가입 당시 아래와 같은 개인정보를 수집하고 있습니다.
				</LegalParagraph>
				<LegalSubheading>개인 회원가입 시</LegalSubheading>
				<LegalParagraph>
					- 필수항목 : 성명, 아이디, 비밀번호, 연락처, 이메일, 주소
				</LegalParagraph>
				<LegalSubheading>기업 회원가입 시</LegalSubheading>
				<LegalParagraph>
					- 필수항목 : 업소명, 아이디, 비밀번호, 담당자 이름, 휴대폰, 주소
				</LegalParagraph>
				<LegalParagraph className="pt-2">
					나. 서비스 이용과정에서 아래와 같은 정보들이 자동으로 생성되어 수집될
					수 있습니다.
				</LegalParagraph>
				<LegalParagraph>
					- IP Address, 쿠키, 방문 일시, 서비스 이용 기록, 불량 이용 기록
				</LegalParagraph>
				<LegalParagraph className="pt-2">
					다. 부가 서비스 및 맞춤식 서비스 이용 과정에서 해당 서비스의 이용자에
					한해서만 아래와 같은 정보들이 수집될 수 있습니다.
				</LegalParagraph>
				<LegalParagraph>- 주소, 연락처, 사용 이동통신사 등</LegalParagraph>
				<LegalParagraph className="pt-2">
					라. 유료 서비스 이용 과정에서 아래와 같은 결제 정보들이 수집될 수
					있습니다.
				</LegalParagraph>
				<LegalList
					items={[
						"- 신용카드 결제 시 : 카드사명, 카드번호 등",
						"- 휴대전화 결제 시 : 이동전화번호, 통신사, 결제승인번호 등",
						"- 계좌이체 시 : 은행명, 계좌번호 등",
					]}
				/>
			</LegalSection>

			<LegalSection heading="개인정보의 수집 및 이용 목적">
				<LegalParagraph>
					가. 서비스 제공에 관한 계약 이행 및 서비스 제공에 따른 요금정산
				</LegalParagraph>
				<LegalParagraph>
					콘텐츠 제공, 특정 맞춤 서비스 제공, 물품배송 또는 청구서 등 발송,
					본인인증, 구매 및 요금 결제, 요금추심
				</LegalParagraph>
				<LegalParagraph className="pt-2">나. 회원관리</LegalParagraph>
				<LegalParagraph>
					회원제 서비스 이용 및 제한적 본인 확인제에 따른 본인확인, 개인식별,
					불량회원의 부정 이용방지와 비인가 사용방지, 가입의사 확인, 가입 및
					가입횟수 제한, 만 14세 미만 아동 개인정보 수집 시 법정대리인 동의여부
					확인, 추후 법정대리인 본인확인, 분쟁 조정을 위한 기록보존, 불만처리 등
					민원처리, 고지사항 전달
				</LegalParagraph>
				<LegalParagraph className="pt-2">
					다. 신규 서비스 개발 및 마케팅·광고에의 활용
				</LegalParagraph>
				<LegalParagraph>
					신규 서비스 개발 및 맞춤 서비스 제공, 통계학적 특성에 따른 서비스 제공
					및 광고 게재, 서비스의 유효성 확인, 이벤트 및 광고성 정보 제공 및
					참여기회 제공, 접속빈도 파악, 회원의 서비스 이용에 대한 통계
				</LegalParagraph>
			</LegalSection>

			<LegalSection heading="개인정보의 보유 및 이용기간">
				<LegalParagraph>
					이용자의 개인정보는 원칙적으로 개인정보의 수집 및 이용목적이 달성되면
					지체 없이 파기합니다. 단, 다음의 정보에 대해서는 아래의 이유로 명시한
					기간 동안 보존합니다.
				</LegalParagraph>
				<LegalSubheading>
					가. 회사 내부 방침에 의한 정보보유 사유
				</LegalSubheading>
				<LegalParagraph>
					밤비의 이용약관에 따른 서비스 이용 제재 발생 시 부정사용자에 한하여
					동일인 식별 및 부정이용 방지가 필요한 경우
				</LegalParagraph>
				<LegalList
					items={[
						"항목 : 아이디, 휴대폰번호(복호화 불가능한 일방향 암호화(해시)하여 보관), CI, 중복가입확인정보(DI), IP",
						"보존 이유 : 부정 이용 방지",
						"보존 기간 : 1년",
					]}
				/>
				<LegalSubheading>나. 관련법령에 의한 정보보유 사유</LegalSubheading>
				<LegalParagraph>
					상법, 전자상거래 등에서의 소비자보호에 관한 법률 등 관계법령의 규정에
					의하여 보존할 필요가 있는 경우 회사는 관계법령에서 정한 일정한 기간
					동안 회원정보를 보관합니다. 이 경우 회사는 보관하는 정보를 그 보관의
					목적으로만 이용하며 보존기간은 아래와 같습니다.
				</LegalParagraph>
				<LegalTable
					head={["보존 항목", "보존 이유 및 기간"]}
					rows={[
						[
							"방문에 관한 기록",
							"통신비밀보호법 제2조제11호, 시행령 제41조 — 3개월",
						],
						[
							"소비자의 불만 또는 분쟁처리에 관한 기록",
							"전자상거래 등에서의 소비자보호에 관한 법률 제6조, 시행령 제6조 — 3년",
						],
						[
							"계약 또는 청약철회 등에 관한 기록",
							"전자상거래 등에서의 소비자보호에 관한 법률 제6조, 시행령 제6조 — 5년",
						],
						[
							"대금결제 및 재화 등의 공급에 관한 기록",
							"전자상거래 등에서의 소비자보호에 관한 법률 제6조, 시행령 제6조 — 5년",
						],
					]}
				/>
			</LegalSection>

			<LegalSection heading="개인정보의 제공 및 위탁">
				<LegalParagraph>
					밤비는 이용자의 사전 동의 없이 개인정보를 외부에 제공하지 않습니다.
					단, 이용자가 외부 제휴사의 서비스를 이용하기 위하여 개인정보 제공에
					직접 동의를 한 경우, 그리고 관련 법령에 의거해 밤비에 개인정보 제출
					의무가 발생한 경우, 이용자의 생명이나 안전에 급박한 위험이 확인되어
					이를 해소하기 위한 경우에 한하여 개인정보를 제공하고 있습니다.
				</LegalParagraph>
				<LegalSubheading>
					이용자 동의 후 개인정보 제공이 발생하는 경우
				</LegalSubheading>
				<LegalParagraph>
					밤비에서 제공하는 콘텐츠 등을 이용하기 위하여 외부 콘텐츠 제공사 등에
					개인정보를 제공하는 경우입니다. 즉, 해당 서비스를 이용하지 않는
					이용자는 개인정보 제공이 발생하지 않습니다. 이 때에도 회사는
					이용자에게 '개인정보를 제공받는 자, 제공목적, 제공하는 개인정보 항목,
					제공받는 개인정보의 보유 및 이용기간'을 사전에 고지하고 이에 대해
					명시적·개별적 동의를 얻습니다.
				</LegalParagraph>
				<LegalSubheading>수집한 개인정보의 위탁</LegalSubheading>
				<LegalParagraph>
					회사는 서비스 이행을 위해 이용자의 개인정보를 위탁 처리할 경우
					위탁하는 내용 및 수탁자를 고지하고, 위탁계약 시 개인정보가 안전하게
					보호될 수 있도록 필요한 사항을 규정해 관련 법규를 준수하고 이를
					감독합니다. 회사의 개인정보 위탁처리 기관 및 위탁업무 내용은 다음과
					같습니다.
				</LegalParagraph>
				<LegalTable
					head={["수탁자", "위탁업무 내용"]}
					rows={BAMBI_PROCESSORS.map((p): [string, string] => [p.name, p.task])}
				/>
			</LegalSection>

			<LegalSection heading="개인정보의 파기">
				<LegalParagraph>
					이용자의 개인정보는 원칙적으로 개인정보의 수집 시 고지한 이용목적이
					달성되면 지체 없이 파기합니다. 다만 다른 법률 규정에 의한 정보보호
					사유가 있는 경우 법령에서 정한 기간 동안 보관합니다.
				</LegalParagraph>
				<LegalParagraph>
					개인정보의 이용목적 또는 보관기간이 달성된 경우, 종이에 출력된
					개인정보는 분쇄기로 분쇄하거나 소각하고 전자적 파일 형태로 저장된
					개인정보는 기록을 재생할 수 없는 기술적 방법을 사용하여 삭제합니다.
				</LegalParagraph>
			</LegalSection>

			<LegalSection heading="이용자 및 법정대리인의 권리와 행사 방법">
				<LegalList
					items={[
						"이용자는 언제든지 '내 정보 > 회원정보'에서 자신의 개인정보를 조회하거나 수정할 수 있습니다.",
						"이용자는 언제든지 '회원탈퇴' 등을 통해 개인정보의 수집 및 이용 동의를 철회할 수 있습니다.",
						"이용자가 개인정보의 오류에 대한 정정을 요청한 경우, 정정을 완료하기 전까지 해당 개인정보를 이용 또는 제공하지 않습니다. 또한 잘못된 개인정보를 제3자에게 이미 제공한 경우에는 정정 처리결과를 제3자에게 지체 없이 통지하여 정정이 이루어지도록 하겠습니다.",
					]}
				/>
			</LegalSection>

			<LegalSection heading="개인정보 관리부서 안내">
				<LegalParagraph>
					개인정보 보호책임부서 : {BAMBI_COMPANY.privacyOfficer.dept}
				</LegalParagraph>
				<LegalParagraph>
					전화 : {BAMBI_COMPANY.privacyOfficer.tel} · 메일 :{" "}
					{BAMBI_COMPANY.privacyOfficer.email}
				</LegalParagraph>
			</LegalSection>

			<LegalSection heading="개인정보 처리방침 변경 시 고지 의무">
				<LegalParagraph>
					밤비 개인정보 처리방침의 내용 추가, 삭제, 수정이 있을 시에는 개정 최소
					7일 전부터 홈페이지의 '공지사항'을 통해 고지합니다. 다만, 개인정보의
					수집 및 활용, 제3자 제공 등과 같이 이용자 권리의 중요한 변경이 있을
					경우에는 최소 30일 전에 고지합니다.
				</LegalParagraph>
			</LegalSection>
		</LegalDoc>
	);
}
