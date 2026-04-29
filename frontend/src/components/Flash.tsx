import { useEffect, useState } from 'react'

interface FlashState {
  message: string
  kind: 'good' | 'bad'
  id: number
}

interface Props {
  flash: FlashState | null
}

export default function Flash({ flash }: Props) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (!flash) return
    setVisible(true)
    const t = setTimeout(() => setVisible(false), 3200)
    return () => clearTimeout(t)
  }, [flash])

  if (!flash || !visible) return null

  return (
    <div className={`flash ${flash.kind}`}>
      {flash.kind === 'good' ? (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
      ) : (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="15" y1="9" x2="9" y2="15"></line>
          <line x1="9" y1="9" x2="15" y2="15"></line>
        </svg>
      )}
      <span>{flash.message}</span>
    </div>
  )
}

export type { FlashState }
