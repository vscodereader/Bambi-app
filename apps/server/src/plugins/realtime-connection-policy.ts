// 장수명 SSE는 프록시 idle timeout보다 짧은 주기로 프레임을 보내고, 매 프레임마다
// 세션 DB를 읽지 않도록 기존 알림·presence 스트림이 같은 재검사 주기를 공유한다.
export const REALTIME_HEARTBEAT_INTERVAL_MS = 30_000;
export const REALTIME_SESSION_RECHECK_EVERY_HEARTBEATS = 10;
