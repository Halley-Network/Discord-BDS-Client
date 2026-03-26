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

// --- メインループ (Polling: Discord -> Minecraft) ---
system.runInterval(async () => {
    try {
        const req = new HttpRequest(`${ConnectServer}/messages?since=${lastTime}`);
        req.method = HttpRequestMethod.Get;
        
        const res: HttpResponse = await http.request(req);
        lastTime = getTime(config.timeZone).getTime();
        const dataArray: MessageQueue[] = JSON.parse(res.body);

        for (const data of dataArray) {
            switch (data.type) {
                case "message": {
                    world.sendMessage(`§b[Discord] <${data.author}> §f${data.content}`);
                    break;
                }
                case "eval": {
                    if (data.content === "stop") break; 
                    const result = await runCommand(data.content);
                    
                    const evalResReq = new HttpRequest(`${ConnectServer}/eval`);
                    evalResReq.method = HttpRequestMethod.Post;
                    evalResReq.body = JSON.stringify({ id: data.id, status: result.status });
                    evalResReq.headers = [new HttpHeader("Content-Type", "application/json")];
                    http.request(evalResReq);
                    break;
                }
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
    } catch (e) {}
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

/**
 * ① データの送信部分 (修正)
 * 10秒ごとに現在の人数とプレイヤー名リストをマネージャーに報告する関数
 */
async function sendDebugPulse() {
    try {
        const allPlayers = world.getAllPlayers();
        
        const listReq = new HttpRequest(`${ConnectServer}/list`);
        listReq.method = HttpRequestMethod.Post;
        
        // 人数(players)と名前リスト(names)をJSONに含める
        listReq.body = JSON.stringify({
            players: allPlayers.length,
            names: allPlayers.map(p => p.name)
        });
        
        listReq.headers = [
            new HttpHeader("Content-Type", "application/json")
        ];

        await http.request(listReq);
    } catch (e) {
        // 通信エラー（マネージャー停止中など）は無視
    }
}

// --- 10秒周期の定期実行 ---
system.runInterval(() => {
    sendDebugPulse();
}, 200); // 200 ticks = 約10秒

// Minecraft内コマンド (!status / !user-list)
world.afterEvents.chatSend.subscribe(async (ev) => {
    const { message, sender } = ev;

    if (message.startsWith("!status ")) {
        const args = message.split(" ");
        const targetPort = args[1];

        if (!targetPort || !/^\d+$/.test(targetPort)) {
            return sender.sendMessage("§c使用法: !status [ポート番号]");
        }

        try {
            const req = new HttpRequest(`${ConnectServer}/status-of/${targetPort}`);
            req.method = HttpRequestMethod.Get;
            const response = await http.request(req);
            
            if (response.status === 200) {
                const srv = JSON.parse(response.body);
                const statusColor = srv.status === "online" ? "§a" : "§c";
                const statusIcon = srv.status === "online" ? "●" : "○";

                sender.sendMessage(`§e--- Server Report: ${targetPort} ---`);
                sender.sendMessage(`§f状態: ${statusColor}${statusIcon} ${srv.status.toUpperCase()}`);
                sender.sendMessage(`§f人数: §b${srv.count}人`);
                sender.sendMessage(`§f最終更新: §7${srv.lastUpdate}`);
                sender.sendMessage("§e----------------------------");
            } else {
                sender.sendMessage(`§cエラー: ポート ${targetPort} の情報は見つかりませんでした。`);
            }
        } catch (e) {
            sender.sendMessage("§cマネージャーとの通信に失敗しました。");
        }
    } else if (message.startsWith("!user-list ")) {
        const targetPort = message.split(" ")[1];
        if (!targetPort) return sender.sendMessage("§c使用法: !user-list [Port]");

        try {
            const response = await http.request(new HttpRequest(`${ConnectServer}/user-list/${targetPort}`));
            if (response.status === 200) {
                const data = JSON.parse(response.body);
                
                sender.sendMessage(`§e--- Port ${targetPort} Player List ---`);
                sender.sendMessage(`§f人数: §b${data.count} / ${data.max}`);
                
                if (data.names.length > 0) {
                    sender.sendMessage(`§f参加中: §7${data.names.join(", ")}`);
                } else {
                    sender.sendMessage("§f参加中: §oなし");
                }
                sender.sendMessage("§e-----------------------------");
            }
        } catch (e) { sender.sendMessage("§c通信失敗"); }
    }
});