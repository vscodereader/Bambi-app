import {
	BambiHeader,
	BambiScreen,
	StateCard,
} from "@/src/components/bambi-screen";

// ponytail: 상품 목록·교환 흐름이 붙으면 StateCard를 실제 섹션으로 교체한다.
export default function SeekerPointShopScreen() {
	return (
		<BambiScreen>
			<BambiHeader
				description="모은 포인트로 교환할 수 있는 상품을 준비하고 있어요."
				title="포인트몰"
			/>
			<StateCard
				description="교환 가능한 상품이 준비되면 이곳에서 바로 만나보실 수 있어요."
				title="준비 중이에요"
			/>
		</BambiScreen>
	);
}
