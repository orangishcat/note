import {ArrowLeft, Download, Share2, Star} from "lucide-react"
import Link from "next/link"
import Image from "next/image"
import {Button} from "@/components/ui/button"
import {Layout} from "@/components/layout"
import {useState} from "react"

interface DocumentViewProps {
    id: string
    title: string
    type: string
    content: string
    thumbnail: string
    starred: boolean
    onStarToggle: (id: string) => void
}

export default function DocumentView({
                                         id,
                                         title,
                                         type,
                                         content,
                                         thumbnail,
                                         starred,
                                         onStarToggle,
                                     }: DocumentViewProps) {
    const [isStarred, setIsStarred] = useState(starred)

    const toggleStar = () => {
        setIsStarred(!isStarred)
        onStarToggle(id)
    }

    return (
      <Layout>
          <div className="p-6">
              <div className="mb-6 flex items-center justify-between">
                  <div className="flex items-center space-x-4">
                      <Link href="/"
                            className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
                          <ArrowLeft className="h-6 w-6"/>
                      </Link>
                      <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{title}</h1>
                  </div>
                  <div className="flex items-center space-x-2">
                      <Button variant="ghost" size="icon" onClick={toggleStar}>
                          <Star
                            className={`h-5 w-5 ${isStarred ? "fill-yellow-400 text-yellow-400" : "text-gray-400"}`}/>
                      </Button>
                      <Button variant="ghost" size="icon">
                          <Share2 className="h-5 w-5"/>
                      </Button>
                      <Button variant="ghost" size="icon">
                          <Download className="h-5 w-5"/>
                      </Button>
                  </div>
              </div>
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg overflow-hidden">
                  <div className="aspect-video relative">
                      <Image
                        src={thumbnail || "/placeholder.svg"}
                        alt={title}
                        layout="fill"
                        objectFit="cover"
                        className="w-full h-full object-cover"
                      />
                  </div>
                  <div className="p-6">
                      <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">{type}</h2>
                      <div className="prose dark:prose-invert max-w-none">
                          {content.split("\n").map((paragraph, index) => (
                            <p key={index} className="mb-4 text-gray-700 dark:text-gray-300">
                                {paragraph}
                            </p>
                          ))}
                      </div>
                  </div>
              </div>
          </div>
      </Layout>
    )
}

