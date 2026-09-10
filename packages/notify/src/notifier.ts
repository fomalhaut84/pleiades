/**
 * 파사드 — 라우트 1개 · 대상 N건. 호출부 21곳의 공통형(003 발견 16: 부수효과 0 · 수신자별 분기 0)을 한 곳에 둔다.
 *
 * 정본: fit `send.ts:77-91` `sendToAll` (대상 순차 · per-target catch · 집계 · 실패 로그) + fit `sendToAllWithKeyboard` 의 `first`.
 * 로그 prefix 는 호출부 `label` (Q26 ①). `deliveries[].error` 는 raw (Q19 C) · 로그는 `sanitizeError` 를 거친다.
 */
import { DEFAULT_RETRY_DELAYS_MS, deliverOne, type DeliveryPolicy } from './deliver';
import { sanitizeError } from './error';
import type {
  BroadcastResult,
  Content,
  Delivery,
  Notifier,
  NotifierConfig,
  NotifyContext,
  Route,
  Transport,
  TransportRef,
} from './types';

const DEFAULT_LABEL = 'notify';

const defaultSleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

function isTransport(value: unknown): value is Transport {
  return typeof value === 'object' && value !== null && typeof (value as Transport).send === 'function';
}

function isTransportRef(value: NotifierConfig['transport']): value is TransportRef {
  return typeof value === 'function' || isTransport(value);
}

/** 팩토리를 최대 1회만 호출하는 지연 해석기 (003 §4-3 제약 1). */
function lazy(ref: TransportRef): () => Transport {
  if (typeof ref !== 'function') return () => ref;
  let cached: Transport | undefined;
  return () => (cached ??= ref());
}

function buildResolver(config: NotifierConfig['transport']): (route: Route) => Transport {
  if (isTransportRef(config)) {
    const shared = lazy(config);
    return () => shared();
  }
  const byRoute: Partial<Record<Route, () => Transport>> = {};
  for (const [route, ref] of Object.entries(config) as Array<[Route, TransportRef | undefined]>) {
    if (ref !== undefined) byRoute[route] = lazy(ref);
  }
  return (route) => {
    const get = byRoute[route];
    if (get === undefined) {
      throw new Error(`@pleiades/notify: transport 가 설정되지 않은 route 로 notify 했다 (${route})`);
    }
    return get();
  };
}

export function createNotifier(config: NotifierConfig): Notifier {
  const resolveTransport = buildResolver(config.transport);
  const logger = config.logger ?? console;
  const sleep = config.sleep ?? defaultSleep;
  const retryDelaysMs = config.retryDelaysMs ?? DEFAULT_RETRY_DELAYS_MS;

  const targets = (route: Route): string[] => [...(config.targets[route]?.() ?? [])];

  const notify = async (route: Route, content: Content, ctx?: NotifyContext): Promise<BroadcastResult> => {
    const ids = targets(route);
    if (ids.length === 0) return { sent: 0, failed: 0, total: 0, deliveries: [] };

    const transport = resolveTransport(route);
    const label = ctx?.label ?? DEFAULT_LABEL;
    const policy: DeliveryPolicy = { retryDelaysMs, sleep, logger, label };

    const deliveries: Delivery[] = [];
    for (const target of ids) {
      try {
        const ref = await deliverOne(transport, target, content, policy);
        deliveries.push({ target, ok: true, ref });
      } catch (err) {
        deliveries.push({ target, ok: false, error: err instanceof Error ? err.message : String(err) });
        logger.error(`[${label}] 메시지 전송 실패 (${target}): ${sanitizeError(err)}`);
      }
    }

    const sent = deliveries.filter((d) => d.ok).length;
    const firstOk = deliveries.find((d) => d.ok);
    const result: BroadcastResult = { sent, failed: ids.length - sent, total: ids.length, deliveries };
    return firstOk === undefined ? result : { ...result, first: { target: firstOk.target, ref: firstOk.ref as string } };
  };

  return {
    notify,
    targets,
    targetCount: (route) => targets(route).length,
  };
}
