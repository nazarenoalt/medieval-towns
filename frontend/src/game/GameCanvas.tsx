import { useEffect, useRef } from 'react'
import { Application } from 'pixi.js'

export default function GameCanvas() {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const app = new Application()

    app.init({
      resizeTo: container,
      backgroundColor: 0x1a1a2e,
    }).then(() => {
      container.appendChild(app.canvas)
    })

    return () => {
      app.destroy(true)
    }
  }, [])

  return (
    <div
      ref={containerRef}
      style={{ position: 'absolute', inset: 0 }}
    />
  )
}
