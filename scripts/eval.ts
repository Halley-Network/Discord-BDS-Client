import { world } from "@minecraft/server"
export default async function runCommand(command: string): Promise<{ status: boolean, result: string }> {
    return { status: false, result: "stub" }
}
