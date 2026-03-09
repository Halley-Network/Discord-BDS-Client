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

// --- 10秒ごとに現在の人数をマネージャーに自動報告する処理を追加 ---
system.runInterval(() => {
    try {
        const allPlayers = world.getAllPlayers();
        const playerCount = allPlayers.length;

        const listReq = new HttpRequest(`${ConnectServer}/list`);
        listReq.method = HttpRequestMethod.Post;
        
        // マネージャー側が期待しているのは「数値」なので、lengthを送る
        listReq.body = JSON.stringify({
            players: playerCount 
        });
        
        listReq.headers = [
            new HttpHeader("Content-Type", "application/json")
        ];

        http.request(listReq);
    } catch (e) {
        // エラー時は無視
    }
}, 200); // 200 ticks = 約10秒

// status command
world.afterEvents.chatSend.subscribe(async (ev) => {
    const { message, sender } = ev;

    // "!status [port]" の形式かチェック
    if (message.startsWith("!status ")) {
        const args = message.split(" ");
        const targetPort = args[1]; // ポート番号を取得

        if (!targetPort || !/^\d+$/.test(targetPort)) {
            return sender.sendMessage("§c使用法: !status [ポート番号]");
        }

        try {
            // マネージャーに問い合わせ
            const req = new HttpRequest(`${ConnectServer}/status-of/${targetPort}`);
            req.method = HttpRequestMethod.Get;

            const response = await http.request(req);
            
            if (response.status === 200) {
                const srv = JSON.parse(response.body);
                
                const statusColor = srv.status === "online" ? "§a" : "§c";
                const statusIcon = srv.status === "online" ? "●" : "○";

                // 結果を整形して表示
                sender.sendMessage(`§e--- Server Report: ${targetPort} ---`);
                sender.sendMessage(`§f状態: ${statusColor}${statusIcon} ${srv.status.toUpperCase()}`);
                sender.sendMessage(`§f人数: §b${srv.count}人`);
                sender.sendMessage(`§f最終更新: §7${srv.lastUpdate}`);
                sender.sendMessage(`${srv.status.toUpperCase()}`)
                sender.sendMessage("§e----------------------------");
            } else {
                sender.sendMessage(`§cエラー: ポート ${targetPort} の情報は見つかりませんでした。`);
            }
        } catch (e) {
            sender.sendMessage("§cマネージャーとの通信に失敗しました。");
        }
    }
});

/*
function startServer(port: string) {
    const server = detectedServers[port];
    if (!server || activeProcesses[port]) return;

    const child = spawn(server.path, [], { cwd: server.cwd });
    activeProcesses[port] = child;
    saveState();

    const chatChannel = client.channels.cache.get(server.channelId) as TextChannel;
    const logChannel = client.channels.cache.get(config.logChannelId) as TextChannel;

    // --- 起動通知 ---
    if (chatChannel) {
        chatChannel.send({
            embeds: [{ title: "Server Status", description: `🚀 **Port:${port}** が起動しました。`, color: 0x00ff00 }]
        }).catch(() => {});
    }

    // 行バッファ（途切れたログを結合するため）
    let lineBuffer = "";

    child.stdout.on('data', (data) => {
        lineBuffer += data.toString();
        const lines = lineBuffer.split(/\r?\n/);
        
        // 最後の不完全な行をバッファに残す
        lineBuffer = lines.pop() || "";

        for (const line of lines) {
            const cleanLine = line.trim();
            if (!cleanLine) continue;

            // 1. ログチャンネルへ転送
            if (logChannel) {
                logChannel.send(`\`${new Date().toLocaleTimeString()}\` [**${port}**] \`\`\`\n${cleanLine}\n\`\`\``).catch(() => {});
            }

            // 2. 参加・退出の検知 (デバッグログ付き)
            if (chatChannel) {
                // BDSのログにはタイムスタンプ等が含まれるため、includes か test が確実です
                
                // 参加検知: "Player connected: 名前, xuid: ..."
                if (cleanLine.includes("Player connected:")) {
                    console.log(`[DEBUG] Join detected: ${cleanLine}`); // Node.js側に表示
                    const name = cleanLine.match(/Player connected: ([^,]+)/)?.[1];
                    if (name) {
                        chatChannel.send({
                            embeds: [{
                                title: "Join",
                                description: `**${name}** が参加しました!!!!!`,
                                color: 0x00ff00
                            }]
                        }).catch(() => {});
                    }
                }

                // 退出検知: "Player disconnected: 名前, xuid: ..."
                if (cleanLine.includes("Player disconnected:")) {
                    console.log(`[DEBUG] Leave detected: ${cleanLine}`); // Node.js側に表示
                    const name = cleanLine.match(/Player disconnected: ([^,]+)/)?.[1];
                    if (name) {
                        chatChannel.send({
                            embeds: [{
                                title: "Leave",
                                description: `**${name}** が退出しました!!!!!`,
                                color: 0xff0000
                            }]
                        }).catch(() => {});
                    }
                }
            }
        }
    });

    child.on('close', (code) => {
        delete activeProcesses[port];
        saveState();
        if (chatChannel) {
            chatChannel.send({
                embeds: [{ title: "Server Status", description: `🛑 **Port:${port}** が停止しました。`, color: 0xff0000 }]
            }).catch(() => {});
        }
    });
}
*/