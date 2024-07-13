import { HttpRequest, HttpRequestMethod, http } from "@minecraft/server-net";
import config from "./config";
import runCommand from "./eval";
import { MessageQueue } from "./types";
import { system, world } from "@minecraft/server";
import getTime from "./utils/time";
let lastTime = getTime(config.timeZone).getTime()
system.runInterval(async () => {
    const req = new HttpRequest(`${config.botServer}/messages`)
    req.method = HttpRequestMethod.Get
    req.body = JSON.stringify({
        since: lastTime
    })
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
                req.method = HttpRequestMethod.Post
                req.body = JSON.stringify({
                    id: data.id,
                    status: result.status
                })
                http.request(req)
                break;
            }
            case "list": {
                const players = world.getAllPlayers().map(player => player.name)
                const req = new HttpRequest(`${config.botServer}/list`)
                req.method = HttpRequestMethod.Post
                req.body = JSON.stringify({
                    id: data.id,
                    players: players,
                    max: config.maxPlayers
                })
                http.request(req)
                break;
            }
        }
    }
}, config.checkMessagesInterval)
