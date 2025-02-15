"use client"

import { ArrowLeft, Download, Star, Share2 } from "lucide-react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Layout } from "@/components/layout"
import { useState, useEffect, useRef } from "react"
import { Vex } from "vexflow"

interface ScoreViewerProps {
  id: string
  title: string
  composer: string
  starred: boolean
  onStarToggle: (id: string) => void
}

export default function ScoreViewer({ id, title, composer, starred, onStarToggle }: ScoreViewerProps) {
  const [showDownload, setShowDownload] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    if (canvasRef.current) {
      const VF = Vex.Flow
      const renderer = new VF.Renderer(canvasRef.current, VF.Renderer.Backends.CANVAS)
      const context = renderer.getContext()
      const stave = new VF.Stave(10, 10, 400)
      stave.addClef("treble").setContext(context).draw()
    }
  }, [])

  const handleStarToggle = () => {
    onStarToggle(id)
  }

  return (
    <Layout folders={{}}>
      <div className="flex items-center justify-between p-4">
        <Link href="/" className="text-muted-foreground">
          <ArrowLeft className="h-6 w-6" />
        </Link>
        <div className="flex items-center gap-x-2">
          <Button variant="ghost" onClick={() => setShowDownload((prev) => !prev)}>
            <Download className="h-4 w-4" />
          </Button>
          <Button variant="ghost" onClick={handleStarToggle}>
            <Star className={starred ? "text-yellow-400 fill-yellow-400" : ""} />
          </Button>
          <Button variant="ghost">
            <Share2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
      <div className="p-4 space-y-4">
        <h1 className="text-3xl font-bold">{title}</h1>
        <p className="text-lg">{composer}</p>
        <canvas ref={canvasRef} />
      </div>
      {showDownload && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center">
          <div className="bg-white p-4 rounded-lg shadow-lg">
            <p>Download functionality not yet implemented.</p>
            <Button onClick={() => setShowDownload(false)}>Close</Button>
          </div>
        </div>
      )}
    </Layout>
  )
}

