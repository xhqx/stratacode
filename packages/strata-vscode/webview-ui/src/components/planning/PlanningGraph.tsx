import { Show } from "solid-js"
import { usePlanning } from "../../context/planning"

export function PlanningGraph() {
  const planning = usePlanning()

  return (
    <div style={{ padding: "16px", "text-align": "center", opacity: 0.7 }}>
      Dependency Graph view coming soon.
    </div>
  )
}
