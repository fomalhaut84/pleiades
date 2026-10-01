import { useState } from "react";

const FX = 1466;

const tabs = [
  { id: "overview", label: "전체 현황", icon: "🏠" },
  { id: "sejin", label: "세진", icon: "⚡" },
  { id: "rsu", label: "RSU 플랜", icon: "🎯" },
  { id: "sodam", label: "소담 9세", icon: "🌿" },
  { id: "dasom", label: "다솜 5세", icon: "🌱" },
  { id: "action", label: "실행현황", icon: "✅" },
];

const C = {
  bg: "#07080c",
  card: "rgba(255,255,255,0.025)",
  border: "rgba(255,255,255,0.05)",
  dim: "#4a4a5a",
  sub: "#7a7a8e",
  text: "#c8c8d4",
  bright: "#eeeef2",
  green: "#34d399",
  red: "#f87171",
  amber: "#fbbf24",
  blue: "#60a5fa",
  purple: "#a78bfa",
  orange: "#fb923c",
  cyan: "#22d3ee",
};

function Card({ children, glow, style = {} }) {
  return (
    <div style={{
      background: C.card, borderRadius: 16, padding: "20px", border: `1px solid ${C.border}`,
      position: "relative", overflow: "hidden", marginBottom: 14,
      boxShadow: glow ? `0 0 40px ${glow}08` : "none", ...style
    }}>
      {glow && <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg, transparent, ${glow}, transparent)` }} />}
      {children}
    </div>
  );
}

function Badge({ text, color = C.blue }) {
  return <span style={{ fontSize: 9, fontWeight: 700, color, background: `${color}14`, padding: "2px 7px", borderRadius: 4, letterSpacing: 0.5, textTransform: "uppercase" }}>{text}</span>;
}

function Stat({ label, value, sub, color = C.bright }) {
  return (
    <div style={{ textAlign: "center", padding: "10px 6px" }}>
      <div style={{ fontSize: 10, color: C.dim, marginBottom: 3, letterSpacing: 0.5 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 800, color, letterSpacing: -0.5 }}>{value}</div>
      {sub && <div style={{ fontSize: 9, color: C.sub, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function Progress({ pct, color, height = 4 }) {
  return (
    <div style={{ height, background: "rgba(255,255,255,0.04)", borderRadius: height, overflow: "hidden" }}>
      <div style={{ height: "100%", width: `${Math.min(pct, 100)}%`, background: color, borderRadius: height, transition: "width 0.6s ease" }} />
    </div>
  );
}

function Pie({ segments, size = 100 }) {
  let cum = 0;
  const total = segments.reduce((s, seg) => s + seg.value, 0);
  const r = size / 2 - 3, cx = size / 2, cy = size / 2;
  return (
    <svg width={size} height={size}>
      {segments.map((seg, i) => {
        const pct = seg.value / total;
        if (pct < 0.005) { cum += pct; return null; }
        if (pct > 0.999) return <circle key={i} cx={cx} cy={cy} r={r} fill={seg.color} />;
        const sa = cum * 2 * Math.PI - Math.PI / 2;
        cum += pct;
        const ea = cum * 2 * Math.PI - Math.PI / 2;
        return <path key={i} d={`M${cx} ${cy}L${cx + r * Math.cos(sa)} ${cy + r * Math.sin(sa)}A${r} ${r} 0 ${pct > 0.5 ? 1 : 0} 1 ${cx + r * Math.cos(ea)} ${cy + r * Math.sin(ea)}Z`} fill={seg.color} />;
      })}
      <circle cx={cx} cy={cy} r={r * 0.42} fill={C.bg} />
    </svg>
  );
}

function HoldingRow({ name, qty, avg, current, strategy, stratColor, isNew }) {
  const val = qty * current;
  const ret = avg > 0 ? ((current - avg) / avg * 100).toFixed(1) : null;
  const isPos = ret && parseFloat(ret) >= 0;
  return (
    <div style={{ display: "flex", alignItems: "center", padding: "8px 0", borderBottom: `1px solid ${C.border}`, gap: 8 }}>
      <div style={{ flex: 2 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: C.bright }}>{name}</span>
        {isNew && <span style={{ marginLeft: 6, fontSize: 8, fontWeight: 700, color: C.green, background: `${C.green}18`, padding: "1px 5px", borderRadius: 3 }}>NEW</span>}
      </div>
      <div style={{ flex: 1, textAlign: "center", fontSize: 12, color: C.text }}>{qty}주</div>
      <div style={{ flex: 1, textAlign: "right", fontSize: 12, color: isPos ? C.green : C.red }}>{ret ? `${isPos ? "+" : ""}${ret}%` : "—"}</div>
      <div style={{ flex: 1, textAlign: "right" }}><Badge text={strategy} color={stratColor} /></div>
    </div>
  );
}

function Timeline({ items }) {
  return items.map((m, i) => (
    <div key={i} style={{ display: "flex", gap: 0 }}>
      <div style={{ width: 36, display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0 }}>
        <div style={{ width: m.done ? 12 : 9, height: m.done ? 12 : 9, borderRadius: "50%", background: m.done ? C.green : m.color, border: m.done ? "none" : `2px solid ${C.bg}`, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1 }}>
          {m.done && <span style={{ fontSize: 7, color: C.bg }}>✓</span>}
        </div>
        {i < items.length - 1 && <div style={{ width: 1, flex: 1, background: C.border }} />}
      </div>
      <div style={{ flex: 1, paddingBottom: 16 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: m.done ? C.green : m.color }}>{m.label}</div>
        <div style={{ fontSize: 13, fontWeight: 700, color: m.done ? C.sub : C.bright, textDecoration: m.done ? "line-through" : "none", marginTop: 1 }}>{m.title}</div>
        <div style={{ fontSize: 11, color: C.sub, lineHeight: 1.5, marginTop: 2 }}>{m.desc}</div>
      </div>
    </div>
  ));
}

function GiftTax({ name, used, limit, color, reset }) {
  const pct = (used / limit) * 100;
  return (
    <Card>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: C.text }}>💰 {name} 증여세</span>
        <span style={{ fontSize: 11, color }}>₩{(used / 10000).toFixed(0)}만 / {(limit / 10000).toFixed(0)}만</span>
      </div>
      <Progress pct={pct} color={color} height={5} />
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
        <span style={{ fontSize: 9, color: C.dim }}>{pct.toFixed(0)}% 사용</span>
        <span style={{ fontSize: 9, color: C.dim }}>리셋: {reset}</span>
      </div>
    </Card>
  );
}

/* ─── TABS ─── */

function OverviewTab() {
  const sejinVal = Math.round(
    6 * 260 * FX + 4 * 380 * FX + 10 * 174 * FX + 16 * 68 * FX +
    1 * 58000 + 2 * 100000 + 12 * 10600
  );
  const sodamVal = Math.round(
    3 * 280 * FX + 11 * 260 * FX +
    120 * 13485 + 72 * 11455 + 46 * 24880
  );
  const dasomVal = Math.round(
    2 * 280 * FX + 5 * 68 * FX + 3 * 260 * FX +
    36 * 24880 + 18 * 13485
  );

  const accounts = [
    { name: "세진", val: sejinVal, color: C.green, desc: "RSU 대기 · 월적립 시작" },
    { name: "소담 9세", val: sodamVal, color: C.blue, desc: "매수 완료 ✓", done: true },
    { name: "다솜 5세", val: dasomVal, color: C.orange, desc: "매수 완료 ✓", done: true },
  ];
  const familyTotal = accounts.reduce((s, a) => s + a.val, 0);

  return (
    <div>
      <Card glow={C.purple}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 11, color: C.sub, letterSpacing: 1 }}>FAMILY TOTAL</div>
            <div style={{ fontSize: 28, fontWeight: 900, color: C.bright, letterSpacing: -1 }}>₩{(familyTotal / 10000).toFixed(0)}<span style={{ fontSize: 14, color: C.sub }}>만원</span></div>
          </div>
          <div style={{ textAlign: "right" }}>
            <Badge text="2026.03.04 기준" color={C.dim} />
            <div style={{ fontSize: 10, color: C.red, marginTop: 4 }}>⚠️ 이란 사태 변동성 구간</div>
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
          {accounts.map((a, i) => (
            <div key={i} style={{ padding: "12px 8px", background: "rgba(255,255,255,0.02)", borderRadius: 10, border: `1px solid ${a.color}18`, textAlign: "center" }}>
              <div style={{ fontSize: 10, color: C.sub }}>{a.name}</div>
              <div style={{ fontSize: 17, fontWeight: 800, color: a.color }}>₩{(a.val / 10000).toFixed(0)}<span style={{ fontSize: 10 }}>만</span></div>
              <div style={{ fontSize: 9, color: a.done ? C.green : C.dim, marginTop: 2 }}>{a.desc}</div>
            </div>
          ))}
        </div>
      </Card>

      <Card glow={C.red}>
        <div style={{ fontSize: 14, fontWeight: 800, color: C.bright, marginBottom: 10 }}>🌍 시장 상황 — 이란 사태</div>
        <div style={{ fontSize: 12, color: C.sub, lineHeight: 1.8, marginBottom: 12 }}>
          2월 28일 미국·이스라엘의 이란 공습 후 호르무즈 해협 봉쇄. 코스피 하루 7.24% 급락(6244→5792). 미국 증시는 상대적으로 선방(S&P500 -0.4%). 유가 급등 · 원/달러 환율 1,466원.
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
          {[
            { label: "우리 전략에 미치는 영향", color: C.green, text: "변경 없음. 장기 투자 유지. 시장 하락은 아이들 계좌에 좋은 매수 기회 → 이미 실행 완료." },
            { label: "주의할 포인트", color: C.amber, text: "유가 상승 장기화 시 인플레이션 → 금리 인하 지연 가능. 4월 RSU 베스팅 시 카카오 주가에 주목." },
          ].map((item, i) => (
            <div key={i} style={{ padding: 12, background: "rgba(255,255,255,0.02)", borderRadius: 10, border: `1px solid ${item.color}15` }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: item.color, marginBottom: 4 }}>{item.label}</div>
              <div style={{ fontSize: 11, color: C.sub, lineHeight: 1.5 }}>{item.text}</div>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <div style={{ fontSize: 14, fontWeight: 800, color: C.bright, marginBottom: 12 }}>🗓 핵심 이벤트 타임라인</div>
        <Timeline items={[
          { label: "2026년 3월 4일", title: "아이들 예수금 투입", desc: "소담 ₩217만 · 다솜 ₩96만 → ETF 매수 완료", color: C.green, done: true },
          { label: "2026년 3월 중", title: "세진 월 20만원 S&P500 적립 시작", desc: "TIGER 미국S&P500 매월 적립. 이란 사태 하락 구간이 첫 매수 기회.", color: C.blue, done: false },
          { label: "2026년 3월 중", title: "증여세 신고 (홈택스)", desc: "소담·다솜 비과세 한도 내 증여 기록 남기기.", color: C.purple, done: false },
          { label: "2026년 4월", title: "1차 RSU 베스팅: 카카오 135주", desc: "70주 즉시 매도 → TIGER S&P500 ~170주 전환. 66주 장기 보유.", color: C.amber, done: false },
          { label: "2026년 6월", title: "첫 분기 점검", desc: "컨텍 재평가 · 포트폴리오 리뷰 · 증여 기록 업데이트.", color: C.sub, done: false },
          { label: "2027년 4월", title: "2차 RSU: ~83주 (마지막)", desc: "동일 전략. 절반 매도 → S&P500 전환. RSU 종료.", color: C.orange, done: false },
        ]} />
      </Card>

      <Card>
        <div style={{ fontSize: 13, fontWeight: 800, color: C.bright, marginBottom: 10 }}>4대 운영 원칙</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          {[
            { n: "01", t: "아이들 = 절대 매도 금지", d: "10~15년 장기. 하락 = 싸게 살 기회.", c: C.blue },
            { n: "02", t: "RSU = 리밸런싱 재원", d: "2회의 RSU로 인덱스 기반 구축.", c: C.amber },
            { n: "03", t: "세진 = 인덱스 비중 확대", d: "RSU + 월 20만원으로 30%+ 목표.", c: C.green },
            { n: "04", t: "분기 1회 점검", d: "3개월마다 리뷰. 급하게 안 움직이기.", c: C.purple },
          ].map((item, i) => (
            <div key={i} style={{ padding: "10px 12px", background: "rgba(255,255,255,0.015)", borderRadius: 10 }}>
              <div style={{ fontSize: 20, fontWeight: 900, color: `${item.c}30` }}>{item.n}</div>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.text, marginBottom: 2 }}>{item.t}</div>
              <div style={{ fontSize: 10, color: C.dim, lineHeight: 1.4 }}>{item.d}</div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

function SejinTab() {
  const holdings = [
    { name: "RKLB", qty: 16, avg: 6.05, cur: 68, strat: "전량보유", sc: C.green, krw: false },
    { name: "AAPL", qty: 6, avg: 105.8, cur: 260, strat: "장기보유", sc: C.green, krw: false },
    { name: "MSFT", qty: 4, avg: 319.6, cur: 380, strat: "장기보유", sc: C.green, krw: false },
    { name: "NVDA", qty: 10, avg: 120.5, cur: 174, strat: "장기보유", sc: C.green, krw: false },
    { name: "카카오", qty: 1, avg: 45000, cur: 58000, strat: "RSU대기", sc: C.amber, krw: true },
    { name: "두산로보틱스", qty: 2, avg: 26000, cur: 100000, strat: "보유", sc: C.sub, krw: true },
    { name: "컨텍", qty: 12, avg: 22500, cur: 10600, strat: "관망", sc: C.red, krw: true },
  ];

  const usVal = holdings.filter(h => !h.krw).reduce((s, h) => s + h.qty * h.cur * FX, 0);
  const krVal = holdings.filter(h => h.krw).reduce((s, h) => s + h.qty * h.cur, 0);
  const total = usVal + krVal;

  const segments = [
    { label: "미국 개별주", value: usVal, color: C.blue },
    { label: "카카오", value: 1 * 58000, color: C.amber },
    { label: "기타 한국주", value: 2 * 100000 + 12 * 10600, color: C.sub },
  ];

  return (
    <div>
      <Card glow={C.green}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 800, color: C.bright }}>세진 포트폴리오</div>
            <div style={{ fontSize: 11, color: C.sub }}>RSU 전 · 인덱스 비중 0%</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 20, fontWeight: 800, color: C.green }}>₩{(total / 10000).toFixed(0)}만</div>
            <div style={{ fontSize: 10, color: C.sub }}>환율 ₩{FX}/$ 반영</div>
          </div>
        </div>
        <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 8 }}>
          {holdings.map((h, i) => (
            <HoldingRow key={i} name={h.name} qty={h.qty}
              avg={h.krw ? h.avg : h.avg * FX}
              current={h.krw ? h.cur : h.cur * FX}
              strategy={h.strat} stratColor={h.sc} />
          ))}
        </div>
      </Card>

      <div style={{ display: "grid", gridTemplateColumns: "110px 1fr", gap: 12, marginBottom: 14 }}>
        <Card style={{ marginBottom: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 12 }}>
          <Pie segments={segments} size={90} />
          <div style={{ marginTop: 6 }}>{segments.map((s, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 2 }}>
              <div style={{ width: 5, height: 5, borderRadius: "50%", background: s.color }} />
              <span style={{ fontSize: 8, color: C.dim }}>{s.label}</span>
            </div>
          ))}</div>
        </Card>
        <Card style={{ marginBottom: 0 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.sub, marginBottom: 8 }}>RSU 후 예상 변화</div>
          {[
            { label: "인덱스 비중", before: "0%", after: "~20%", color: C.green },
            { label: "카카오", before: "1주(1%)", after: "66주(~19%)", color: C.amber },
            { label: "포트폴리오", before: `₩${(total/10000).toFixed(0)}만`, after: "~₩1,700만", color: C.blue },
          ].map((r, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6, fontSize: 11 }}>
              <span style={{ color: C.dim, width: 65, fontSize: 10 }}>{r.label}</span>
              <span style={{ color: C.red, width: 50, textAlign: "right" }}>{r.before}</span>
              <span style={{ color: C.dim, fontSize: 9 }}>→</span>
              <span style={{ color: r.color, fontWeight: 700 }}>{r.after}</span>
            </div>
          ))}
        </Card>
      </div>

      <Card glow={C.blue}>
        <div style={{ fontSize: 13, fontWeight: 700, color: C.bright, marginBottom: 8 }}>📈 월 20만원 적립 계획</div>
        <div style={{ fontSize: 12, color: C.sub, lineHeight: 1.7 }}>
          이번 달부터 TIGER 미국S&P500 월 20만원 적립을 시작합니다. 이란 사태로 시장이 조정 중인 지금이 첫 매수 기회입니다.
        </div>
        <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
          <Stat label="월 적립" value="₩20만" color={C.blue} />
          <Stat label="현재가 기준" value="~8주/월" sub="₩24,880" color={C.text} />
          <Stat label="12개월 목표" value="~96주" sub="~₩240만" color={C.green} />
        </div>
      </Card>

      <Card>
        <div style={{ fontSize: 12, fontWeight: 700, color: C.sub, marginBottom: 8 }}>컨텍 관망 기준 (분기별 점검)</div>
        {[
          { signal: "✅ 보유 유지", items: "흑자전환 · 신규계약 · 매출 30%+ 성장", color: C.green },
          { signal: "🚨 손절 검토", items: "하반기 적자 지속 · 고객사 이탈 · 주가 ₩8,000 이하", color: C.red },
        ].map((item, i) => (
          <div key={i} style={{ padding: "7px 10px", background: "rgba(255,255,255,0.015)", borderRadius: 8, marginBottom: 4, border: `1px solid ${item.color}12` }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: item.color }}>{item.signal}</span>
            <span style={{ fontSize: 10, color: C.dim, marginLeft: 8 }}>{item.items}</span>
          </div>
        ))}
      </Card>
    </div>
  );
}

function RSUTab() {
  return (
    <div>
      <Card glow={C.amber}>
        <div style={{ fontSize: 17, fontWeight: 800, color: C.bright, marginBottom: 6 }}>RSU 운용 전략</div>
        <div style={{ fontSize: 12, color: C.sub, lineHeight: 1.7, marginBottom: 14 }}>
          확정된 2회의 RSU를 <strong style={{ color: C.amber }}>포트폴리오 리밸런싱의 기회</strong>로 활용합니다. 카카오 직원으로서 월급이 이미 카카오에 의존 → 자산까지 집중시키지 않는 것이 핵심.
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          {[
            { title: "1차 · 2026년 4월", qty: "135주 확정", basis: "25.4.9 종가 ~₩37,037", value: "~₩810만 (현재가)", sell: "70주 매도 → S&P500 ~170주", keep: "65주 보유 (기존1+RSU65=66주)", color: C.amber },
            { title: "2차 · 2027년 4월", qty: "~83주 예상", basis: "26.4 종가 기준 500만원", value: "~₩500만", sell: "~45주 매도 → S&P500 전환", keep: "~38주 보유", color: C.orange },
          ].map((r, i) => (
            <div key={i} style={{ padding: 14, background: "rgba(255,255,255,0.02)", borderRadius: 12, border: `1px solid ${r.color}20` }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: r.color, marginBottom: 8 }}>{r.title}</div>
              {[
                ["수량", r.qty], ["산정", r.basis], ["가치", r.value], ["매도", r.sell], ["보유", r.keep]
              ].map(([k, v], j) => (
                <div key={j} style={{ fontSize: 11, color: C.sub, lineHeight: 1.7 }}>
                  <strong style={{ color: C.text }}>{k}:</strong> {v}
                </div>
              ))}
            </div>
          ))}
        </div>
      </Card>

      <Card glow={C.blue}>
        <div style={{ fontSize: 14, fontWeight: 700, color: C.bright, marginBottom: 10 }}>RSU 처리 프로세스</div>
        <Timeline items={[
          { label: "D-day", title: "베스팅일: 주식 수령", desc: "근로소득세 원천징수 후 실물 주식 입고. 이날 종가 = 취득가.", color: C.amber },
          { label: "D+1~3일", title: "70주 즉시 매도", desc: "취득가 ≈ 매도가 → 양도차익 ≈ 0 → 양도세 거의 없음.", color: C.red },
          { label: "D+1주", title: "매도대금 → TIGER S&P500 매수", desc: "결제 완료 후 S&P500 ~170주 매수.", color: C.green },
          { label: "이후", title: "나머지 65주 장기 보유", desc: "카카오 성장에 적절히 노출 유지.", color: C.blue },
        ]} />
      </Card>

      <Card>
        <div style={{ fontSize: 13, fontWeight: 700, color: C.sub, marginBottom: 10 }}>2회 RSU 완료 후 카카오 보유 전망</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6 }}>
          {[
            { label: "현재", qty: "1주", color: C.sub },
            { label: "1차 후", qty: "66주", color: C.amber },
            { label: "2차 후", qty: "~104주", color: C.orange },
            { label: "포트 비중", qty: "~25%", color: C.green },
          ].map((item, i) => (
            <div key={i} style={{ padding: "8px", background: "rgba(255,255,255,0.015)", borderRadius: 8, textAlign: "center" }}>
              <div style={{ fontSize: 9, color: C.dim }}>{item.label}</div>
              <div style={{ fontSize: 16, fontWeight: 800, color: item.color }}>{item.qty}</div>
            </div>
          ))}
        </div>
      </Card>

      <Card glow={C.red}>
        <div style={{ fontSize: 13, fontWeight: 700, color: C.bright, marginBottom: 8 }}>💰 세금 요약</div>
        <div style={{ fontSize: 11, color: C.sub, lineHeight: 1.8 }}>
          <strong style={{ color: C.text }}>① 근로소득세</strong> — 베스팅일 종가 × 주수가 근로소득 추가. 회사 원천징수. 연말정산 시 추가 납부 가능.
          <br /><strong style={{ color: C.text }}>② 양도소득세</strong> — 베스팅 직후 매도 시 차익 ≈ 0 → 양도세 거의 없음.
          <br /><span style={{ fontSize: 10, color: C.red }}>⚠️ 정확한 세금은 세무사 상담 권장</span>
        </div>
      </Card>
    </div>
  );
}

function SodamTab() {
  const holdings = [
    { name: "SOL 미국배당다우존스", qty: 120, avg: (635400 + 60 * 13485) / 120, cur: 13485, strat: "장기보유", sc: C.green, krw: true },
    { name: "SOL 미국배당미국채혼합50", qty: 72, avg: (410000 + 32 * 11455) / 72, cur: 11455, strat: "장기보유", sc: C.green, krw: true },
    { name: "TIGER 미국S&P500", qty: 46, avg: (131610 + 40 * 24880) / 46, cur: 24880, strat: "장기보유", sc: C.green, krw: true },
    { name: "AAPL", qty: 11, avg: 212.25, cur: 260, strat: "유지", sc: C.blue, krw: false },
    { name: "XAR", qty: 3, avg: 171.45, cur: 280, strat: "유지", sc: C.blue, krw: false },
  ];

  const total = holdings.reduce((s, h) => s + h.qty * (h.krw ? h.cur : h.cur * FX), 0);
  const dividendVal = 120 * 13485 + 72 * 11455;
  const indexVal = 46 * 24880;
  const indivVal = 11 * 260 * FX + 3 * 280 * FX;

  const segments = [
    { label: "배당ETF", value: dividendVal, color: C.green },
    { label: "인덱스", value: indexVal, color: C.blue },
    { label: "개별주", value: indivVal, color: C.amber },
  ];

  return (
    <div>
      <Card glow={C.blue}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 800, color: C.bright }}>소담 — 9세</div>
            <div style={{ fontSize: 11, color: C.sub }}>투자기간 10년+ · 균형형</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <Badge text="매수 완료 ✓" color={C.green} />
            <div style={{ fontSize: 18, fontWeight: 800, color: C.blue, marginTop: 4 }}>₩{(total / 10000).toFixed(0)}만</div>
          </div>
        </div>
      </Card>

      <Card>
        <div style={{ fontSize: 12, fontWeight: 700, color: C.sub, marginBottom: 6 }}>보유 종목</div>
        {holdings.map((h, i) => {
          const isNew = (h.name === "SOL 미국배당다우존스" || h.name === "SOL 미국배당미국채혼합50" || h.name === "TIGER 미국S&P500");
          return <HoldingRow key={i} name={h.name} qty={h.qty}
            avg={h.krw ? h.avg : h.avg * FX}
            current={h.krw ? h.cur : h.cur * FX}
            strategy={h.strat} stratColor={h.sc} isNew={isNew} />;
        })}
        <div style={{ marginTop: 8, fontSize: 10, color: C.dim }}>잔여 예수금: ~₩12,167</div>
      </Card>

      <Card>
        <div style={{ fontSize: 12, fontWeight: 700, color: C.sub, marginBottom: 8 }}>오늘 매수 내역 (3/4)</div>
        {[
          { name: "TIGER 미국S&P500", qty: 40, price: "₩24,880", total: "₩995,200", note: "6→46주" },
          { name: "SOL 미국배당다우존스", qty: 60, price: "₩13,485", total: "₩809,100", note: "60→120주" },
          { name: "SOL 미국배당미국채혼합50", qty: 32, price: "₩11,455", total: "₩366,560", note: "40→72주" },
        ].map((item, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 0", borderBottom: `1px solid ${C.border}` }}>
            <div>
              <span style={{ fontSize: 12, fontWeight: 600, color: C.text }}>{item.name}</span>
              <span style={{ fontSize: 9, color: C.green, marginLeft: 6 }}>{item.note}</span>
            </div>
            <div style={{ textAlign: "right" }}>
              <span style={{ fontSize: 11, color: C.text }}>{item.qty}주 × {item.price}</span>
              <span style={{ fontSize: 10, color: C.dim, marginLeft: 6 }}>{item.total}</span>
            </div>
          </div>
        ))}
        <div style={{ marginTop: 6, fontSize: 11, color: C.blue, fontWeight: 600 }}>합계: ₩2,170,860</div>
      </Card>

      <div style={{ display: "grid", gridTemplateColumns: "100px 1fr", gap: 12, marginBottom: 14 }}>
        <Card style={{ marginBottom: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 10 }}>
          <Pie segments={segments} size={85} />
          <div style={{ marginTop: 6 }}>{segments.map((s, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 3, marginTop: 1 }}>
              <div style={{ width: 5, height: 5, borderRadius: "50%", background: s.color }} />
              <span style={{ fontSize: 8, color: C.dim }}>{s.label} {((s.value / total) * 100).toFixed(0)}%</span>
            </div>
          ))}</div>
        </Card>
        <Card style={{ marginBottom: 0 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.sub, marginBottom: 6 }}>10년 후 시뮬레이션 (19세)</div>
          <div style={{ fontSize: 11, color: C.sub, lineHeight: 1.8 }}>
            현재 ~{(total / 10000).toFixed(0)}만원 · 연 8% 복리
            <br />추가 없이 → <strong style={{ color: C.blue }}>~₩1,490만</strong>
            <br />월 5만 추가 → <strong style={{ color: C.green }}>~₩2,400만</strong>
            <br />월 10만 추가 → <strong style={{ color: C.green }}>~₩3,310만</strong>
          </div>
        </Card>
      </div>

      <GiftTax name="소담" used={7400000} limit={20000000} color={C.blue} reset="19세(2036) → 성인 5,000만 한도" />
    </div>
  );
}

function DasomTab() {
  const holdings = [
    { name: "TIGER 미국S&P500", qty: 36, avg: (153545 + 29 * 24880) / 36, cur: 24880, strat: "장기보유", sc: C.green, krw: true },
    { name: "SOL 미국배당다우존스", qty: 18, avg: 13485, cur: 13485, strat: "장기보유", sc: C.green, krw: true, isNew: true },
    { name: "XAR", qty: 2, avg: 171.5, cur: 280, strat: "유지", sc: C.blue, krw: false },
    { name: "RKLB", qty: 5, avg: 28.6, cur: 68, strat: "유지", sc: C.blue, krw: false },
    { name: "AAPL", qty: 3, avg: 225.8, cur: 260, strat: "유지", sc: C.blue, krw: false },
  ];

  const total = holdings.reduce((s, h) => s + h.qty * (h.krw ? h.cur : h.cur * FX), 0);
  const indexVal = 36 * 24880;
  const dividendVal = 18 * 13485;
  const indivVal = 2 * 280 * FX + 5 * 68 * FX + 3 * 260 * FX;

  const segments = [
    { label: "인덱스", value: indexVal, color: C.orange },
    { label: "배당(신규)", value: dividendVal, color: C.green },
    { label: "개별주", value: indivVal, color: C.amber },
  ];

  return (
    <div>
      <Card glow={C.orange}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 800, color: C.bright }}>다솜 — 5세</div>
            <div style={{ fontSize: 11, color: C.sub }}>투자기간 15년+ · 성장형</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <Badge text="매수 완료 ✓" color={C.green} />
            <div style={{ fontSize: 18, fontWeight: 800, color: C.orange, marginTop: 4 }}>₩{(total / 10000).toFixed(0)}만</div>
          </div>
        </div>
      </Card>

      <Card>
        <div style={{ fontSize: 12, fontWeight: 700, color: C.sub, marginBottom: 6 }}>보유 종목</div>
        {holdings.map((h, i) => (
          <HoldingRow key={i} name={h.name} qty={h.qty}
            avg={h.krw ? h.avg : h.avg * FX}
            current={h.krw ? h.cur : h.cur * FX}
            strategy={h.strat} stratColor={h.sc} isNew={h.isNew || h.name === "TIGER 미국S&P500"} />
        ))}
        <div style={{ marginTop: 8, fontSize: 10, color: C.dim }}>잔여 예수금: ~₩7,800</div>
      </Card>

      <Card>
        <div style={{ fontSize: 12, fontWeight: 700, color: C.sub, marginBottom: 8 }}>오늘 매수 내역 (3/4)</div>
        {[
          { name: "TIGER 미국S&P500", qty: 29, price: "₩24,880", total: "₩721,520", note: "7→36주" },
          { name: "SOL 미국배당다우존스", qty: 18, price: "₩13,485", total: "₩242,730", note: "신규 편입" },
        ].map((item, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 0", borderBottom: `1px solid ${C.border}` }}>
            <div>
              <span style={{ fontSize: 12, fontWeight: 600, color: C.text }}>{item.name}</span>
              <span style={{ fontSize: 9, color: C.green, marginLeft: 6 }}>{item.note}</span>
            </div>
            <div style={{ textAlign: "right" }}>
              <span style={{ fontSize: 11, color: C.text }}>{item.qty}주 × {item.price}</span>
              <span style={{ fontSize: 10, color: C.dim, marginLeft: 6 }}>{item.total}</span>
            </div>
          </div>
        ))}
        <div style={{ marginTop: 6, fontSize: 11, color: C.orange, fontWeight: 600 }}>합계: ₩964,250</div>
      </Card>

      <div style={{ display: "grid", gridTemplateColumns: "100px 1fr", gap: 12, marginBottom: 14 }}>
        <Card style={{ marginBottom: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 10 }}>
          <Pie segments={segments} size={85} />
          <div style={{ marginTop: 6 }}>{segments.map((s, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 3, marginTop: 1 }}>
              <div style={{ width: 5, height: 5, borderRadius: "50%", background: s.color }} />
              <span style={{ fontSize: 8, color: C.dim }}>{s.label} {((s.value / total) * 100).toFixed(0)}%</span>
            </div>
          ))}</div>
        </Card>
        <Card style={{ marginBottom: 0 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.sub, marginBottom: 6 }}>15년 후 시뮬레이션 (20세)</div>
          <div style={{ fontSize: 11, color: C.sub, lineHeight: 1.8 }}>
            현재 ~{(total / 10000).toFixed(0)}만원 · 연 8% 복리
            <br />추가 없이 → <strong style={{ color: C.orange }}>~₩1,363만</strong>
            <br />월 5만 추가 → <strong style={{ color: C.green }}>~₩3,093만</strong>
            <br />월 10만 추가 → <strong style={{ color: C.green }}>~₩4,823만</strong>
          </div>
        </Card>
      </div>

      <GiftTax name="다솜" used={2780000} limit={20000000} color={C.orange} reset="15세(2036) → 여유 충분" />
    </div>
  );
}

function ActionTab() {
  const groups = [
    {
      title: "완료 ✓", color: C.green,
      items: [
        { tag: "다솜", tc: C.orange, text: "TIGER S&P500 29주 × ₩24,880 매수", done: true },
        { tag: "다솜", tc: C.orange, text: "SOL 미국배당다우존스 18주 × ₩13,485 신규매수", done: true },
        { tag: "소담", tc: C.blue, text: "TIGER S&P500 40주 × ₩24,880 매수", done: true },
        { tag: "소담", tc: C.blue, text: "SOL 미국배당다우존스 60주 × ₩13,485 매수", done: true },
        { tag: "소담", tc: C.blue, text: "SOL 미국배당미국채혼합50 32주 × ₩11,455 매수", done: true },
      ],
    },
    {
      title: "이번 달 (3월)", color: C.amber,
      items: [
        { tag: "세진", tc: C.green, text: "TIGER S&P500 월 20만원 적립 시작", done: false },
        { tag: "세무", tc: C.purple, text: "소담 증여세 신고 (홈택스, 비과세 한도 내)", done: false },
        { tag: "세무", tc: C.purple, text: "다솜 증여세 신고 (홈택스, 비과세 한도 내)", done: false },
        { tag: "기록", tc: C.sub, text: "입금 내역 엑셀 기록 (날짜·금액·계좌)", done: false },
      ],
    },
    {
      title: "4월 (RSU 베스팅)", color: C.amber,
      items: [
        { tag: "RSU", tc: C.amber, text: "카카오 135주 수령 확인", done: false },
        { tag: "RSU", tc: C.amber, text: "근로소득세 원천징수 내역 확인", done: false },
        { tag: "RSU", tc: C.amber, text: "베스팅 직후 70주 매도 (양도세 최소화)", done: false },
        { tag: "RSU", tc: C.amber, text: "매도 대금 → TIGER S&P500 ~170주 매수", done: false },
        { tag: "세진", tc: C.green, text: "나머지 65주 장기 보유 유지", done: false },
      ],
    },
    {
      title: "분기별 (6월, 9월, 12월...)", color: C.blue,
      items: [
        { tag: "세진", tc: C.green, text: "컨텍 실적·뉴스 확인 → 보유/손절 판단", done: false },
        { tag: "세진", tc: C.green, text: "RKLB 분기 실적 확인", done: false },
        { tag: "세진", tc: C.green, text: "월 20만원 적립 빠짐없이 실행했는지 체크", done: false },
        { tag: "아이들", tc: C.blue, text: "용돈/입금 시 TIGER S&P500 우선 매수", done: false },
        { tag: "세무", tc: C.purple, text: "증여 입금 총액 기록 업데이트", done: false },
      ],
    },
    {
      title: "2027년 4월 (2차 RSU)", color: C.orange,
      items: [
        { tag: "RSU", tc: C.amber, text: "카카오 ~83주 수령 확인", done: false },
        { tag: "RSU", tc: C.amber, text: "1차와 동일: 절반 매도 → S&P500 전환", done: false },
        { tag: "세진", tc: C.green, text: "RSU 종료 후 인덱스 비중 30%+ 달성 확인", done: false },
      ],
    },
  ];

  return (
    <div>
      {groups.map((g, gi) => (
        <Card key={gi} glow={gi === 0 ? C.green : undefined}>
          <div style={{ fontSize: 14, fontWeight: 800, color: gi === 0 ? C.green : C.bright, marginBottom: 10 }}>{g.title}</div>
          {g.items.map((item, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0", borderBottom: `1px solid ${C.border}` }}>
              <div style={{
                width: 16, height: 16, borderRadius: 4, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
                background: item.done ? C.green : "transparent",
                border: item.done ? "none" : `2px solid rgba(255,255,255,0.1)`,
              }}>
                {item.done && <span style={{ fontSize: 9, color: C.bg, fontWeight: 900 }}>✓</span>}
              </div>
              <Badge text={item.tag} color={item.tc} />
              <div style={{ flex: 1, fontSize: 12, color: item.done ? C.sub : C.text, textDecoration: item.done ? "line-through" : "none" }}>{item.text}</div>
            </div>
          ))}
        </Card>
      ))}

      <div style={{ padding: "12px 14px", background: "rgba(255,255,255,0.015)", borderRadius: 10, border: `1px dashed ${C.border}`, fontSize: 10, color: C.dim, lineHeight: 1.6 }}>
        ⚠️ 이 전략은 참고용이며 투자 권유가 아닙니다. RSU 세금은 개인 상황에 따라 다르므로 세무사 상담을 권장합니다.
      </div>
    </div>
  );
}

export default function Dashboard() {
  const [active, setActive] = useState("overview");

  return (
    <div style={{ fontFamily: "'Pretendard', 'SF Pro Display', -apple-system, sans-serif", background: C.bg, color: C.text, minHeight: "100vh", padding: "16px 14px" }}>
      <div style={{ maxWidth: 700, margin: "0 auto" }}>
        <div style={{ marginBottom: 14 }}>
          <h1 style={{ fontSize: 20, fontWeight: 900, color: C.bright, margin: 0, letterSpacing: -0.5 }}>
            가족 투자 전략
          </h1>
          <p style={{ fontSize: 10, color: C.dim, margin: "3px 0 0", letterSpacing: 0.5 }}>
            2026.03.04 업데이트 · 소담 9세 · 다솜 5세 · RSU 2회(26.4·27.4) · 이란사태 변동성 구간
          </p>
        </div>

        <div style={{ display: "flex", gap: 3, marginBottom: 14, overflowX: "auto" }}>
          {tabs.map(t => (
            <button key={t.id} onClick={() => setActive(t.id)} style={{
              flex: "1 0 auto", minWidth: 52, padding: "8px 4px", border: "none", borderRadius: 8, cursor: "pointer",
              fontSize: 9, fontWeight: 700, letterSpacing: 0.3, transition: "all 0.2s",
              background: active === t.id ? "rgba(255,255,255,0.06)" : "transparent",
              color: active === t.id ? C.bright : C.dim,
              borderBottom: active === t.id ? `2px solid ${C.green}` : "2px solid transparent",
            }}>
              <span style={{ fontSize: 14, display: "block", marginBottom: 2 }}>{t.icon}</span>
              {t.label}
            </button>
          ))}
        </div>

        {active === "overview" && <OverviewTab />}
        {active === "sejin" && <SejinTab />}
        {active === "rsu" && <RSUTab />}
        {active === "sodam" && <SodamTab />}
        {active === "dasom" && <DasomTab />}
        {active === "action" && <ActionTab />}
      </div>
    </div>
  );
}
