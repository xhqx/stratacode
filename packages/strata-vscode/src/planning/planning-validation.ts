import type { PlanningTask } from "./types"

/**
 * Checks if adding `newDeps` to `taskId` would create a cycle in the task dependency graph.
 */
export function hasCycle(tasks: PlanningTask[], taskId: string, newDeps: string[]): boolean {
  const taskMap = new Map<string, string[]>()

  // Build adjacency list
  for (const t of tasks) {
    if (t.id === taskId) {
      taskMap.set(t.id, newDeps)
    } else {
      taskMap.set(t.id, t.dependsOn || [])
    }
  }

  if (!taskMap.has(taskId)) {
    taskMap.set(taskId, newDeps)
  }

  const visited = new Set<string>()
  const recursionStack = new Set<string>()

  const dfs = (nodeId: string): boolean => {
    if (recursionStack.has(nodeId)) return true // Cycle detected
    if (visited.has(nodeId)) return false

    visited.add(nodeId)
    recursionStack.add(nodeId)

    const deps = taskMap.get(nodeId) || []
    for (const dep of deps) {
      if (dfs(dep)) return true
    }

    recursionStack.delete(nodeId)
    return false
  }

  // If the graph was acyclic before, we only need to check from the modified node
  return dfs(taskId)
}

/**
 * Performs a topological sort of the given tasks based on their dependencies.
 * Returns null if a cycle is detected.
 */
export function topologicalOrder(tasks: PlanningTask[]): string[] | null {
  const inDegree = new Map<string, number>()
  const adjList = new Map<string, string[]>()

  // Initialize
  for (const t of tasks) {
    inDegree.set(t.id, 0)
    adjList.set(t.id, [])
  }

  // Build graph
  for (const t of tasks) {
    const deps = t.dependsOn || []
    for (const dep of deps) {
      if (!inDegree.has(dep)) {
        inDegree.set(dep, 0)
        adjList.set(dep, [])
      }
      // Edge from dep -> t (t depends on dep)
      adjList.get(dep)!.push(t.id)
      inDegree.set(t.id, inDegree.get(t.id)! + 1)
    }
  }

  const queue: string[] = []
  for (const [id, degree] of inDegree.entries()) {
    if (degree === 0) queue.push(id)
  }

  const order: string[] = []

  while (queue.length > 0) {
    const current = queue.shift()!
    order.push(current)

    const neighbors = adjList.get(current) || []
    for (const neighbor of neighbors) {
      inDegree.set(neighbor, inDegree.get(neighbor)! - 1)
      if (inDegree.get(neighbor) === 0) {
        queue.push(neighbor)
      }
    }
  }

  // If order length != number of unique nodes, there's a cycle
  if (order.length !== inDegree.size) {
    return null
  }

  return order
}

/**
 * Checks if a task is ready to be dispatched.
 * A task is ready if:
 * 1. Its status is "planned"
 * 2. Its startAt time (if any) is in the past
 * 3. All its dependencies are "done"
 */
export function isReady(task: PlanningTask, allTasks: PlanningTask[], now: Date): boolean {
  if (task.status !== "planned" && task.status !== "ready") {
    return false
  }

  // Check start time
  if (task.startAt) {
    const startTime = new Date(task.startAt)
    if (startTime > now) {
      return false
    }
  }

  // Check dependencies
  if (task.dependsOn && task.dependsOn.length > 0) {
    for (const depId of task.dependsOn) {
      const depTask = allTasks.find((t) => t.id === depId)
      if (!depTask || depTask.status !== "done") {
        return false
      }
    }
  }

  return true
}
