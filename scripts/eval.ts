import { world } from "@minecraft/server"
export default async function runCommand(command: string): Promise<{ status: boolean }> {
    try {
        const result = await world.getDimension("overworld").runCommandAsync(command)
        if (result.successCount == 0) return { status: false }
        else return { status: true }
    } catch {
        return { status: false }
    }
}
