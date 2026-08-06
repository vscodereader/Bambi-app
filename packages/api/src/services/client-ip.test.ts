import { describe, expect, it } from "vitest";
import {
	DEFAULT_TRUSTED_PROXY_HOPS,
	parseTrustedProxyHops,
	resolveClientIp,
	UNKNOWN_CLIENT_IP,
} from "./client-ip";

describe("resolveClientIp", () => {
	it("헤더가 없으면 unknown", () => {
		expect(resolveClientIp({})).toBe(UNKNOWN_CLIENT_IP);
		expect(resolveClientIp({ forwardedFor: "   " })).toBe(UNKNOWN_CLIENT_IP);
	});

	it("홉이 0이면 체인의 오른쪽 끝을 쓴다", () => {
		expect(
			resolveClientIp({ forwardedFor: "203.0.113.9", trustedProxyHops: 0 })
		).toBe("203.0.113.9");
	});

	// 구글 외부 ALB: `<호출자가 보낸 값>,<실제 클라이언트 IP>,<LB IP>`
	it("ALB 뒤(홉 1)에서는 LB IP를 건너뛰고 실제 클라이언트를 쓴다", () => {
		expect(
			resolveClientIp({
				forwardedFor: "203.0.113.9, 34.117.0.1",
				trustedProxyHops: 1,
			})
		).toBe("203.0.113.9");
	});

	it("호출자가 x-forwarded-for를 위조해도 실제 클라이언트를 쓴다", () => {
		const spoofed = resolveClientIp({
			forwardedFor: "10.0.0.1, 203.0.113.9, 34.117.0.1",
			trustedProxyHops: 1,
		});

		expect(spoofed).toBe("203.0.113.9");
	});

	// 종전 동작(맨 앞 칸)의 실제 장애: 사내·통신사 프록시가 사설 IP를 넣으면 서로 다른
	// 사용자가 같은 버킷으로 합쳐져 정상 사용자끼리 한도를 밀어냈다.
	it("사설 IP를 앞에 붙인 서로 다른 사용자가 같은 버킷으로 합쳐지지 않는다", () => {
		const first = resolveClientIp({
			forwardedFor: "192.168.0.10, 203.0.113.9, 34.117.0.1",
			trustedProxyHops: 1,
		});
		const second = resolveClientIp({
			forwardedFor: "192.168.0.10, 198.51.100.7, 34.117.0.1",
			trustedProxyHops: 1,
		});

		expect(first).not.toBe(second);
	});

	it("체인이 홉 수보다 짧으면 맨 앞 값으로 떨어진다", () => {
		expect(
			resolveClientIp({ forwardedFor: "203.0.113.9", trustedProxyHops: 3 })
		).toBe("203.0.113.9");
	});

	it("directIp가 있으면 x-forwarded-for보다 우선한다", () => {
		expect(
			resolveClientIp({
				directIp: "203.0.113.9",
				forwardedFor: "10.0.0.1",
				trustedProxyHops: 0,
			})
		).toBe("203.0.113.9");
	});

	it("포트·대괄호·대소문자 표기가 달라도 같은 버킷이다", () => {
		const plain = resolveClientIp({ forwardedFor: "203.0.113.9" });
		const withPort = resolveClientIp({ forwardedFor: "203.0.113.9:51234" });

		expect(withPort).toBe(plain);
		expect(resolveClientIp({ forwardedFor: "[2001:DB8::1]:443" })).toBe(
			resolveClientIp({ forwardedFor: "2001:db8:0:0::1" })
		);
	});

	it("IPv4-mapped IPv6는 IPv4로 본다", () => {
		expect(resolveClientIp({ forwardedFor: "::ffff:203.0.113.9" })).toBe(
			"203.0.113.9"
		);
	});

	it("IPv6는 /64로 묶어 주소만 바꾸는 우회를 막는다", () => {
		const first = resolveClientIp({ forwardedFor: "2001:db8:1:2:3:4:5:6" });
		const second = resolveClientIp({ forwardedFor: "2001:db8:1:2:aaaa::1" });

		expect(first).toBe("2001:db8:1:2::/64");
		expect(second).toBe(first);
	});

	it("다른 /64는 다른 버킷이다", () => {
		expect(resolveClientIp({ forwardedFor: "2001:db8:1:2::1" })).not.toBe(
			resolveClientIp({ forwardedFor: "2001:db8:1:3::1" })
		);
	});
});

describe("parseTrustedProxyHops", () => {
	it("미설정·빈 값·이상한 값은 기본값", () => {
		expect(parseTrustedProxyHops(undefined)).toBe(DEFAULT_TRUSTED_PROXY_HOPS);
		expect(parseTrustedProxyHops("")).toBe(DEFAULT_TRUSTED_PROXY_HOPS);
		expect(parseTrustedProxyHops("abc")).toBe(DEFAULT_TRUSTED_PROXY_HOPS);
		expect(parseTrustedProxyHops("-1")).toBe(DEFAULT_TRUSTED_PROXY_HOPS);
	});

	it("0을 명시하면 0으로 내린다(LB 없는 배포)", () => {
		expect(parseTrustedProxyHops("0")).toBe(0);
	});

	it("숫자를 그대로 읽는다", () => {
		expect(parseTrustedProxyHops("2")).toBe(2);
	});
});
