import { world, DimensionLocation, Dimension, DimensionType } from "@minecraft/server"
export default async function runCommand(command: string): Promise<{ status: boolean }> {
    try {
        const result = await runCommand(command)
        if (result.status == true) return { status: false }
        else return { status: true }
    } catch {
        return { status: false }
    }
}
