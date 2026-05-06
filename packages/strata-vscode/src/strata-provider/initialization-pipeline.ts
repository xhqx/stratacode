export type InitStep = () => Promise<void> | void

export async function runInitializationPipeline(steps: InitStep[]): Promise<void> {
  for (const step of steps) {
    await step()
  }
}
