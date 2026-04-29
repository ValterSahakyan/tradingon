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
      {flash.message}
    </div>
  )
}

export type { FlashState }
