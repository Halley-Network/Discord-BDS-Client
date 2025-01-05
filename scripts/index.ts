import { HttpRequest, HttpRequestMethod, http } from "@minecraft/server-net";
import config from "./config";
import runCommand from "./eval";
import type { MessageQueue } from "./types";
import { system, world } from "@minecraft/server";
import getTime from "./utils/time";
let lastTime = getTime(config.timeZone).getTime()
system.runInterval(async () => {
    const req = new HttpRequest(`${config.botServer}/messages?since=${lastTime}`)
    req.method = HttpRequestMethod.GET
    const res = await http.request(req)
    lastTime = getTime(config.timeZone).getTime()
    const dataArray: MessageQueue[] = JSON.parse(res.body)
    for (const data of dataArray) {
        switch (data.type) {
            case "message": {
                world.sendMessage(`[${data.author}]: ${data.content}`)
                break;
            }
            case "eval": {
                const result = await runCommand(data.content)
                const req = new HttpRequest(`${config.botServer}/eval`)
                req.method = HttpRequestMethod.POST
                req.body = JSON.stringify({
                    id: data.id,
                    status: result.status
                })
                req.addHeader("Content-Type", "application/json")
                http.request(req)
                break;
            }
            case "list": {
                const players = world.getAllPlayers().map(player => player.name)
                const req = new HttpRequest(`${config.botServer}/list`)
                req.method = HttpRequestMethod.POST
                req.body = JSON.stringify({
                    id: data.id,
                    players: players,
                    max: config.maxPlayers
                })
                req.addHeader("Content-Type", "application/json")
                http.request(req)
                break;
            }
        }
    }
//}, config.checkMessagesInterval)
})

world.afterEvents.chatSend.subscribe((ev) => {
    ev.sender.runCommand(`say ChatSend`)
    const author = ev.sender.name
    const content = ev.message
    const req = new HttpRequest(`${config.botServer}/send`)
    req.method = HttpRequestMethod.POST
    req.body = JSON.stringify({
        author,
        content
    })
    req.addHeader("Content-Type", "application/json")
    http.request(req)
})

world.afterEvents.playerSpawn.subscribe((ev) => {
    console.log(`afterEvents: ${Object.keys(world.afterEvents)}`);
    const player = ev.player
    const req = new HttpRequest(`${config.botServer}/join`)
    req.method = HttpRequestMethod.POST
    req.body = JSON.stringify({
        player: player.name
    })
    req.addHeader("Content-Type", "application/json")
    http.request(req)
})

world.afterEvents.playerLeave.subscribe((ev) => {
    const player = ev.playerName
    const req = new HttpRequest(`${config.botServer}/leave`)
    req.method = HttpRequestMethod.POST
    req.body = JSON.stringify({
        player: player
    })
    req.addHeader("Content-Type", "application/json")
    http.request(req)
})
