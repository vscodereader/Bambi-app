import { redirectToDefaultManual } from "@/lib/bambi/require-role";

// /manual 은 자기 역할의 기본 매뉴얼로 보내는 인덱스일 뿐 화면이 없다.
export default async function ManualIndexPage() {
	await redirectToDefaultManual();
	return null;
}
