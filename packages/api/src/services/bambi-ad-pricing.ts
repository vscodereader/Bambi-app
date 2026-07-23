// 광고 상품 할인가 계산의 단일 소스. 상품의 discountPercent(0~100)를 가격 옵션 금액에
// 적용해 결제 금액을 확정한다. 10원 단위 내림으로 잔돈이 남지 않게 한다.
// import 없는 순수 모듈(웹이 런타임에 그대로 import해 미리보기 금액을 계산한다).

// discountPercent가 0 이하면 amount 원값을 그대로 돌려준다 — 할인 없는 상품이
// 10원 내림 때문에 원가와 달라지는 일이 없어야 한다.
export const discountedAdAmount = (
	amount: number,
	discountPercent: number
): number => {
	if (discountPercent <= 0) {
		return amount;
	}
	return Math.floor((amount * (100 - discountPercent)) / 100 / 10) * 10;
};
