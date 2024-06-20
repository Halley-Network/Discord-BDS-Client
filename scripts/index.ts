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
                break;
            }
            case "list": {
                break;
            }
        }
    }
}, config.checkMessagesInterval)