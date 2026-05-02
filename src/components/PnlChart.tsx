import { useEffect, useMemo, useRef } from 'react'
import { AreaSeries, ColorType, LineStyle, createChart, type UTCTimestamp } from 'lightweight-charts'
import type { PnlPoint } from '../types'
import { formatUsd } from '../utils'

interface Props {
  data: PnlPoint[]
  embedded?: boolean
}

export default function PnlChart({ data, embedded = false }: Props) {
  const normalizedData = useMemo(() => normalizeSeries(data), [data])

  return (
    <div className={embedded ? 'chart-panel chart-panel--embedded' : 'panel'}>
      {!embedded && (
        <div className="panel-head">
          <div className="panel-title">PnL Curve</div>
          <div className="mini">Realized history with live open-position impact</div>
        </div>
      )}

      {!normalizedData.length ? (
        <div className="empty-state">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 3v18h18"/>
            <path d="m18.7 8-5.1 5.2-2.8-2.7L7 14.3"/>
          </svg>
          <p>Insufficient performance history to map curve</p>
        </div>
      ) : (
        <div className={`chart ${embedded ? 'chart--embedded' : ''}`}>
          <ChartCanvas data={normalizedData} />
        </div>
      )}
    </div>
  )
}

function ChartCanvas({ data }: { data: Array<{ time: UTCTimestamp; value: number }> }) {
  const hostRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    const stroke = data[data.length - 1]?.value >= 0 ? '#41dbc3' : '#ff7c87'
    const chart = createChart(host, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: '#88ada8',
        fontFamily: 'Manrope, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif',
      },
      grid: {
        vertLines: { color: 'rgba(111, 183, 171, 0.08)' },
        horzLines: { color: 'rgba(111, 183, 171, 0.14)', style: LineStyle.LargeDashed },
      },
      crosshair: {
        vertLine: { color: 'rgba(89, 223, 207, 0.28)', labelBackgroundColor: '#0f2f32' },
        horzLine: { color: 'rgba(89, 223, 207, 0.22)', labelBackgroundColor: '#0f2f32' },
      },
      rightPriceScale: {
        borderColor: 'rgba(111, 183, 171, 0.16)',
        scaleMargins: { top: 0.14, bottom: 0.16 },
      },
      timeScale: {
        borderColor: 'rgba(111, 183, 171, 0.16)',
        timeVisible: true,
        secondsVisible: false,
      },
      localization: {
        priceFormatter: (value: number) => formatUsd(value).replace('.00', ''),
      },
      handleScroll: {
        mouseWheel: true,
        pressedMouseMove: true,
        horzTouchDrag: true,
        vertTouchDrag: false,
      },
      handleScale: {
        axisPressedMouseMove: true,
        mouseWheel: true,
        pinch: true,
      },
    })

    const series = chart.addSeries(AreaSeries, {
      lineColor: stroke,
      lineWidth: 3,
      priceLineColor: stroke,
      lastValueVisible: true,
      crosshairMarkerVisible: true,
      crosshairMarkerRadius: 5,
      topColor: data[data.length - 1]?.value >= 0 ? 'rgba(65, 219, 195, 0.22)' : 'rgba(255, 124, 135, 0.22)',
      bottomColor: 'rgba(65, 219, 195, 0.02)',
    })

    series.setData(data)
    chart.timeScale().fitContent()

    const observer = new ResizeObserver(() => {
      chart.timeScale().fitContent()
    })
    observer.observe(host)

    return () => {
      observer.disconnect()
      chart.remove()
    }
  }, [data])

  return <div ref={hostRef} className="chart-host" />
}

function normalizeSeries(data: PnlPoint[]): Array<{ time: UTCTimestamp; value: number }> {
  const bySecond = new Map<number, number>()

  for (const point of data) {
    const second = Math.max(1, Math.floor(Number(point.time) / 1000))
    bySecond.set(second, Number(point.cumPnl))
  }

  return [...bySecond.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([time, value]) => ({ time: time as UTCTimestamp, value }))
}
