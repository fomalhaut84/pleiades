/**
 * 분기 리포트 PDF 템플릿
 *
 * @react-pdf/renderer 기반 서버사이드 PDF 렌더링.
 */

import React from 'react'
import path from 'path'
import { Document, Page, Text, View, StyleSheet, Font } from '@react-pdf/renderer'
import type { QuarterlyData } from './data-collector'

const FONT_DIR = path.join(process.cwd(), 'assets', 'fonts')

Font.register({
  family: 'NotoSansKR',
  fonts: [
    { src: path.join(FONT_DIR, 'NotoSansKR-Regular.ttf'), fontWeight: 400 },
    { src: path.join(FONT_DIR, 'NotoSansKR-Bold.ttf'), fontWeight: 700 },
  ],
})

const styles = StyleSheet.create({
  page: { padding: 40, fontFamily: 'NotoSansKR', fontSize: 10, color: '#333' },
  // 커버
  cover: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  coverTitle: { fontSize: 28, fontWeight: 'bold', color: '#1a1a2e', marginBottom: 8 },
  coverSubtitle: { fontSize: 16, color: '#666' },
  coverDate: { fontSize: 12, color: '#999', marginTop: 24 },
  // 섹션
  section: { marginBottom: 20 },
  sectionTitle: { fontSize: 14, fontWeight: 'bold', color: '#1a1a2e', marginBottom: 8, borderBottomWidth: 1, borderBottomColor: '#e5e7eb', paddingBottom: 4 },
  // 행
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4, borderBottomWidth: 0.5, borderBottomColor: '#f3f4f6' },
  rowLabel: { fontSize: 10, color: '#555', flex: 1 },
  rowValue: { fontSize: 10, fontWeight: 'bold', color: '#1a1a2e', textAlign: 'right' },
  rowPositive: { color: '#059669' },
  rowNegative: { color: '#dc2626' },
  // AI 코멘트
  aiBox: { backgroundColor: '#f8fafc', padding: 12, borderRadius: 4, borderWidth: 0.5, borderColor: '#e5e7eb' },
  aiText: { fontSize: 9, lineHeight: 1.6, color: '#444' },
  // 푸터
  footer: { position: 'absolute', bottom: 20, left: 40, right: 40, textAlign: 'center', fontSize: 8, color: '#999' },
  // 면책
  disclaimer: { fontSize: 7, color: '#999', marginTop: 8 },
})

function formatKRW(n: number): string {
  const abs = Math.abs(n)
  if (abs >= 1_0000_0000) return `${(n / 1_0000_0000).toFixed(1)}억원`
  if (abs >= 1_0000) return `${Math.round(n / 1_0000).toLocaleString()}만원`
  return `${Math.round(n).toLocaleString()}원`
}

function formatPct(n: number): string {
  return `${n >= 0 ? '+' : ''}${n.toFixed(1)}%`
}

interface Props {
  data: QuarterlyData
  aiComment: string
}

export function QuarterlyReportPDF({ data, aiComment }: Props) {
  const q = `${data.year}년 ${data.quarter}분기`

  return (
    <Document>
      {/* 커버 페이지 */}
      <Page size="A4" style={styles.page}>
        <View style={styles.cover}>
          <Text style={styles.coverTitle}>myFinance</Text>
          <Text style={styles.coverSubtitle}>{q} 리포트</Text>
          <Text style={styles.coverDate}>
            {data.period.start.toISOString().slice(0, 10)} ~ {data.period.end.toISOString().slice(0, 10)}
          </Text>
        </View>
        <Text style={styles.footer}>myFinance 가족 자산관리 시스템</Text>
      </Page>

      {/* 포트폴리오 요약 */}
      <Page size="A4" style={styles.page}>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>1. 포트폴리오 요약</Text>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>총 평가금</Text>
            <Text style={styles.rowValue}>{formatKRW(data.portfolio.totalValueKRW)}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>총 매입금</Text>
            <Text style={styles.rowValue}>{formatKRW(data.portfolio.totalCostKRW)}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>수익률</Text>
            <Text style={[styles.rowValue, data.portfolio.returnPct >= 0 ? styles.rowPositive : styles.rowNegative]}>
              {formatPct(data.portfolio.returnPct)}
            </Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>환율 (USD/KRW)</Text>
            <Text style={styles.rowValue}>{data.fxRate.toLocaleString()}원</Text>
          </View>
        </View>

        {/* 계좌별 성과 */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>2. 계좌별 성과</Text>
          {data.portfolio.accounts.map((a) => (
            <View key={a.name} style={styles.row}>
              <Text style={styles.rowLabel}>{a.name} ({a.holdingCount}종목)</Text>
              <Text style={[styles.rowValue, a.returnPct >= 0 ? styles.rowPositive : styles.rowNegative]}>
                {formatKRW(a.valueKRW)} ({formatPct(a.returnPct)})
              </Text>
            </View>
          ))}
        </View>

        {/* 분기 활동 */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>3. 분기 활동</Text>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>거래</Text>
            <Text style={styles.rowValue}>{data.trades.total}건 (매수 {data.trades.buys}, 매도 {data.trades.sells})</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>배당</Text>
            <Text style={styles.rowValue}>{data.dividends.count}건, {formatKRW(data.dividends.totalKRW)}</Text>
          </View>
        </View>

        {/* 증여세 현황 */}
        {data.giftTax.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>4. 증여세 현황</Text>
            {data.giftTax.map((g) => (
              <View key={g.accountName} style={styles.row}>
                <Text style={styles.rowLabel}>{g.accountName}</Text>
                <Text style={styles.rowValue}>
                  {formatKRW(g.totalGifted)} / {formatKRW(g.exemptLimit)} ({(g.usageRate * 100).toFixed(0)}%)
                </Text>
              </View>
            ))}
            <Text style={styles.disclaimer}>※ 참고용이며 법적 조언이 아닙니다. 정확한 내용은 세무사 확인을 권장합니다.</Text>
          </View>
        )}

        <Text style={styles.footer}>myFinance {q} 리포트 — {new Date().toISOString().slice(0, 10)}</Text>
      </Page>

      {/* AI 분석 코멘트 */}
      <Page size="A4" style={styles.page}>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>5. AI 종합 분석</Text>
          <View style={styles.aiBox}>
            <Text style={styles.aiText}>{aiComment}</Text>
          </View>
          <Text style={styles.disclaimer}>※ 투자 권유가 아닌 정보 제공입니다.</Text>
        </View>

        <Text style={styles.footer}>myFinance {q} 리포트 — {new Date().toISOString().slice(0, 10)}</Text>
      </Page>
    </Document>
  )
}
