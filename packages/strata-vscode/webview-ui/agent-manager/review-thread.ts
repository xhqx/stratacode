export interface ReviewMessage {
  id: string
  author: "ai" | "user"
  text: string
  timestamp: number
}

export interface ReviewThread {
  id: string
  file: string
  side: "additions" | "deletions"
  line: number
  messages: ReviewMessage[]
  pending: boolean
}
