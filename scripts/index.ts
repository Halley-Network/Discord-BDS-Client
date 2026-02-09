import { HttpRequest, HttpRequestMethod, http, HttpHeader, HttpResponse } from "@minecraft/server-net";
import { system, world, Player } from "@minecraft/server";
import config from "./config";
import runCommand from "./eval";
import type { MessageQueue } from "./types";
import getTime from "./utils/time";

let lastTime: number = getTime(config.timeZone).getTime();

if (!config.server_port) {
    console.warn("server_port is not set in config.js.");
}

const ConnectServer: string = `${config.botServer}/${config.server_port}`;

// --- メインループ (Polling) ---
system.runInterval(async () => {
    try {
        const req = new HttpRequest(`${ConnectServer}/messages?since=${lastTime}`);
        req.method = HttpRequestMethod.Get;
        
        // サーバーからの指示を確認
        const res: HttpResponse = await http.request(req);
        lastTime = getTime(config.timeZone).getTime();
        const dataArray: MessageQueue[] = JSON.parse(res.body);

        for (const data of dataArray) {
            switch (data.type) {
                // Discordからのチャットを表示
                case "message": {
                    world.sendMessage(`§b[Discord] <${data.author}> §f${data.content}`);
                    break;
                }

                // 汎用コマンド実行 (stop以外のコマンド用)
                case "eval": {
                    // Manager方式では "stop" はここに来ないが、念のため除外
                    if (data.content === "stop") break; 

                    const result = await runCommand(data.content);
                    
                    // 結果をDiscordに返す
                    const evalResReq = new HttpRequest(`${ConnectServer}/eval`);
                    evalResReq.method = HttpRequestMethod.Post;
                    evalResReq.body = JSON.stringify({ id: data.id, status: result.status });
                    evalResReq.headers = [new HttpHeader("Content-Type", "application/json")];
                    http.request(evalResReq);
                    break;
                }

                // オンラインプレイヤーリストの要求に応答
                case "list": {
                    const playerNames = world.getAllPlayers().map(p => p.name);
                    const listReq = new HttpRequest(`${ConnectServer}/list`);
                    listReq.method = HttpRequestMethod.Post;
                    listReq.body = JSON.stringify({
                        id: data.id,
                        players: playerNames,
                        max: config.maxPlayers
                    });
                    listReq.headers = [new HttpHeader("Content-Type", "application/json")];
                    http.request(listReq);
                    break;
                }
            }
        }
    } catch (e) {
        // サーバー再起動中などは接続エラーになるため無視
    }
}, config.checkMessagesInterval);

// --- イベント同期 (Minecraft -> Discord) ---

// チャット送信
world.afterEvents.chatSend.subscribe((ev) => {
    const { sender, message } = ev;
    const req = new HttpRequest(`${ConnectServer}/send`);
    req.method = HttpRequestMethod.Post;
    req.body = JSON.stringify({ author: sender.name, content: message });
    req.headers = [new HttpHeader("Content-Type", "application/json")];
    http.request(req);
});

// 参加通知
world.afterEvents.playerSpawn.subscribe((ev) => {
    if (!ev.initialSpawn) return;
    const req = new HttpRequest(`${ConnectServer}/join`);
    req.method = HttpRequestMethod.Post;
    req.body = JSON.stringify({ player: ev.player.name });
    req.headers = [new HttpHeader("Content-Type", "application/json")];
    http.request(req);
});

// 退出通知
world.afterEvents.playerLeave.subscribe((ev) => {
    const req = new HttpRequest(`${ConnectServer}/leave`);
    req.method = HttpRequestMethod.Post;
    req.body = JSON.stringify({ player: ev.playerName });
    req.headers = [new HttpHeader("Content-Type", "application/json")];
    http.request(req);
});