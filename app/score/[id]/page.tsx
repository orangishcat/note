"use client"

import { useParams } from "next/navigation"
import ScoreViewer from "../../score-viewer"
import { useState, useEffect } from "react"

interface MusicScore {
  id: string
  title: string
  composer: string
  starred: boolean
}

// This is a mock function to simulate fetching score data
function getScoreData(id: string): MusicScore {
  return {
    id,
    title: `Score ${id}`,
    composer: ["Mozart", "Beethoven", "Bach", "Chopin", "Tchaikovsky"][Math.floor(0.2 * 5)],
    starred: 0.2 < 0.3, // 30% chance of being starred
  }
}

export default function ScorePage() {
  const params = useParams()
  const id = params.id as string
  const [score, setScore] = useState<MusicScore | null>(null)

  useEffect(() => {
    setScore(getScoreData(id))
  }, [id])

  const onStarToggle = (id: string) => {
    setScore((prevScore) => {
      if (prevScore && prevScore.id === id) {
        return { ...prevScore, starred: !prevScore.starred }
      }
      return prevScore
    })
    // Here you would typically update the starred status in your backend
  }

  if (!score) {
    return <div>Loading...</div>
  }

  return <ScoreViewer {...score} onStarToggle={onStarToggle} />
}

