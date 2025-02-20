"use client"

import {useParams} from "next/navigation"
import {useEffect, useState} from "react"
import Link from "next/link";
import {ArrowLeft, Download, Share2, Star} from "lucide-react";
import {Button} from "@/components/ui/button";
import {Layout} from "@/components/layout";
import ScoreViewer, {MusicScore} from "@/components/score";
import {Get, Post} from "@/lib/network";
import NotImplementedTooltip from "@/components/ui-custom/not-implemented-tooltip";
import {useQuery} from "@tanstack/react-query";
import {id} from "postcss-selector-parser";


export default function ScorePage() {
  const params = useParams()
  const id = params.id as string
  const [score, setScore] = useState<MusicScore>({
    id: "nothing",
    title: "loading",
    subtitle: "you're not supposed to be seeing this. if you are, good for you.",
    upload_date: "now",
  })
  const [lastStarTime, setLastStarTime] = useState(0);
  const onStarToggle = (score: MusicScore) => {
    setLastStarTime(Date.now())
    if (Date.now() - lastStarTime < 1000) return
    setScore({...score, starred: !score.starred});
    Post(`/api/score/star/${score.id}`, {starred: !score.starred}).then().catch(console.error)
  }
  const {data: loadedScore, error} = useQuery({
     queryKey: ['score_' + id],
     queryFn: () => Get<MusicScore>(`/api/score/data/${id}`)
  })
  useEffect(() => {
    if (loadedScore) setScore(loadedScore)
  }, [loadedScore])

  return <Layout>
    <div className="flex items-center justify-between p-4">
      <div className="flex gap-2 place-items-center">
        <Link href="/" className="text-muted-foreground">
          <ArrowLeft className="h-6 w-6"/>
        </Link>
        <p><span className="text-2xl">{score.title}</span> <span
          className="text-gray-500 dark:text-gray-400">({score.subtitle})</span></p>
      </div>
      <div className="flex items-center gap-x-2">
        <Button variant="ghost"
                onClick={() => window.open(`/api/score/download/${score.file_id}?filename=${encodeURIComponent(score.title + ".mxl")}`)}>
          <Download className="h-4 w-4"/>
        </Button>
        <Button variant="ghost" onClick={() => onStarToggle(score)}>
          <Star className={score.starred ? "text-yellow-400 fill-yellow-400" : "text-black dark:text-white"}/>
        </Button>
        <NotImplementedTooltip>
          <Button variant="ghost" disabled>
            <Share2 className="h-4 w-4"/>
          </Button>
        </NotImplementedTooltip>
      </div>
    </div>
    <div className="p-4 space-y-4">
      {score && score.content ? <ScoreViewer musicXMLBase64={score.content}/> : ""}
    </div>
  </Layout>
}

