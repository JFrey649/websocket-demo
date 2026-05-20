/**
 * WebSocket 教学服务端
 *
 * 演示的常见能力：
 * 1. 连接握手与 query 参数（如 ?name=xxx&room=general）
 * 2. 文本 / 二进制消息
 * 3. JSON 结构化协议（type 字段区分消息类型）
 * 4. 单播、广播、房间内广播
 * 5. 服务端 ping / 客户端 pong 心跳
 * 6. 优雅关闭与错误处理
 */

import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;

const app = express();
app.use(express.static(path.join(__dirname, '../public')));

const httpServer = createServer(app);

// 同一 HTTP 端口上挂载 WebSocket（常见生产写法）
const wss = new WebSocketServer({ server: httpServer });

/** @type {Map<WebSocket, { id: string, name: string, room: string }>} */
const clients = new Map();

let clientIdCounter = 0;

function broadcast(payload, filter = () => true) {
  const data = JSON.stringify(payload);
  for (const [ws, meta] of clients) {
    if (ws.readyState === ws.OPEN && filter(ws, meta)) {
      ws.send(data);
    }
  }
}

function sendTo(ws, payload) {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

function parseMessage(raw, isBinary) {
  if (isBinary) {
    return { type: 'binary', data: raw };
  }
  const text = raw.toString();
  try {
    return JSON.parse(text);
  } catch {
    return { type: 'text', data: text };
  }
}

wss.on('connection', (ws, req) => {
  const url = new URL(req.url || '/', `http://${req.headers.host}`);
  const name = url.searchParams.get('name') || `访客${++clientIdCounter}`;
  const room = url.searchParams.get('room') || 'general';
  const id = `c-${Date.now()}-${clientIdCounter}`;

  const meta = { id, name, room };
  clients.set(ws, meta);

  console.log(`[连接] ${name} (${id}) 加入房间 ${room}，当前在线: ${clients.size}`);

  // 欢迎消息：单播给新连接
  sendTo(ws, {
    type: 'welcome',
    message: `你好 ${name}，已连接到 WebSocket 教学服务器`,
    yourId: id,
    room,
    onlineCount: clients.size,
  });

  // 通知其他人：广播（排除自己）
  broadcast(
    {
      type: 'user-joined',
      user: { id, name, room },
      onlineCount: clients.size,
    },
    (targetWs) => targetWs !== ws
  );

  // 心跳：每 30 秒 ping，客户端应自动 pong（浏览器内置）
  ws.isAlive = true;
  ws.on('pong', () => {
    ws.isAlive = true;
  });

  ws.on('message', (raw, isBinary) => {
    const msg = parseMessage(raw, isBinary);

    // 二进制示例：原样回显并附带长度
    if (msg.type === 'binary') {
      sendTo(ws, {
        type: 'binary-echo',
        byteLength: msg.data.length,
        message: `收到二进制 ${msg.data.length} 字节，已回显`,
      });
      ws.send(msg.data, { binary: true });
      return;
    }

    // 纯文本（非 JSON）
    if (msg.type === 'text') {
      broadcast({
        type: 'chat',
        from: { id, name, room },
        text: msg.data,
        timestamp: Date.now(),
      });
      return;
    }

    // JSON 协议
    switch (msg.type) {
      case 'chat':
        broadcast({
          type: 'chat',
          from: { id, name, room },
          text: msg.text ?? '',
          timestamp: Date.now(),
        });
        break;

      case 'room-message':
        // 仅同房间广播
        broadcast(
          {
            type: 'room-message',
            room: msg.room ?? room,
            from: { id, name, room },
            text: msg.text ?? '',
            timestamp: Date.now(),
          },
          (_targetWs, m) => m.room === (msg.room ?? room)
        );
        break;

      case 'private':
        // 单播给指定 id
        for (const [targetWs, m] of clients) {
          if (m.id === msg.toId) {
            sendTo(targetWs, {
              type: 'private',
              from: { id, name },
              text: msg.text ?? '',
              timestamp: Date.now(),
            });
            sendTo(ws, {
              type: 'private-sent',
              toId: msg.toId,
              text: msg.text ?? '',
            });
            return;
          }
        }
        sendTo(ws, { type: 'error', message: `未找到用户 ${msg.toId}` });
        break;

      case 'ping':
        sendTo(ws, { type: 'pong', serverTime: Date.now(), clientTime: msg.time });
        break;

      case 'list-users':
        sendTo(ws, {
          type: 'user-list',
          users: [...clients.values()].map((u) => ({
            id: u.id,
            name: u.name,
            room: u.room,
          })),
        });
        break;

      default:
        sendTo(ws, { type: 'error', message: `未知消息类型: ${msg.type}` });
    }
  });

  ws.on('close', (code, reason) => {
    clients.delete(ws);
    console.log(`[断开] ${name} code=${code} reason=${reason || '(无)'}`);
    broadcast({
      type: 'user-left',
      user: { id, name },
      onlineCount: clients.size,
    });
  });

  ws.on('error', (err) => {
    console.error(`[错误] ${name}:`, err.message);
  });
});

// 定时检测死连接（未响应 ping 的客户端）
const heartbeatInterval = setInterval(() => {
  for (const ws of wss.clients) {
    if (ws.isAlive === false) {
      const meta = clients.get(ws);
      console.log(`[心跳] 终止无响应连接: ${meta?.name ?? 'unknown'}`);
      return ws.terminate();
    }
    ws.isAlive = false;
    ws.ping();
  }
}, 30000);

wss.on('close', () => clearInterval(heartbeatInterval));

httpServer.listen(PORT, () => {
  console.log(`HTTP + WebSocket: http://localhost:${PORT}`);
  console.log(`打开浏览器访问上述地址开始学习`);
});
