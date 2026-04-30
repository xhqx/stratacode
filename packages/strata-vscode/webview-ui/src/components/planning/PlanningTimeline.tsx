import { Show } from "solid-js"
import { usePlanning } from "../../context/planning"

export function PlanningTimeline() {
  const planning = usePlanning()

  return (
    <div style={{ padding: "16px", "text-align": "center", opacity: 0.7 }}>
      Timeline view coming soon.
    </div>
  )
}
