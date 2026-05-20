# WebSocket 教学项目

用 **Node.js + ws** 做服务端，**浏览器原生 WebSocket API** 做客户端，覆盖日常开发中最常见的 WebSocket 用法。

## 快速开始

```bash
npm install
npm start
```

浏览器打开：**http://localhost:3000**

建议再开一个**无痕窗口**或第二个标签页，换不同昵称，方便观察广播、房间、私聊。

开发时可用热重载：

```bash
npm run dev
```

---

## WebSocket 是什么？

HTTP 是「请求-响应」：客户端问一句，服务器答一句。  
WebSocket 在 **一次 HTTP 升级握手** 之后，变成 **全双工、长连接**：双方都可以随时主动发消息，适合聊天、实时行情、协同编辑、游戏状态同步等。

```
浏览器                         服务器
   |---- HTTP Upgrade -------->|
   |<--- 101 Switching --------|
   |==== 持久 WebSocket =======|
   |<-------- 消息 ------------>|
```

---

## 本项目对应的功能地图

| 功能 | 服务端 | 客户端 UI | 说明 |
|------|--------|-----------|------|
| 建立连接 | `wss.on('connection')` | 「连接」按钮 | `readyState`: CONNECTING → OPEN |
| URL 参数 | 解析 `?name=&room=` | 昵称/房间输入框 | 握手时带业务参数很常见 |
| 文本消息 | `chat` / 纯文本 | 广播聊天 / 纯文本 | JSON 便于扩展字段 |
| 二进制 | `isBinary` 判断 | 「发送二进制」 | 传图片、Protobuf 等 |
| 广播 | `broadcast()` | 多标签页观察 | 发给所有在线连接 |
| 房间 | `room-message` + filter | 「房间消息」 | 只发给同 room 的人 |
| 单播/私聊 | `private` + `toId` | 私聊 + 用户列表 | 点对点，不打扰其他人 |
| 应用层心跳 | `ping` / `pong` JSON | 「应用层 ping」 | 与 TCP/WebSocket 层 ping 不同 |
| 协议层心跳 | `ws.ping()` / `pong` 事件 | 自动（浏览器） | 检测死连接 |
| 关闭连接 | `close` 事件 | 「断开」 | `code` + `reason` 有规范含义 |
| 自动重连 | — | 勾选 + 模拟断线 | 生产环境必备 |
| 错误处理 | `error` 事件 | 日志区 | 通常接着会 `close` |

---

## 消息协议（JSON）

客户端与服务端约定 `type` 字段：

```json
{ "type": "chat", "text": "大家好" }
{ "type": "room-message", "room": "general", "text": "仅房间内可见" }
{ "type": "private", "toId": "c-xxx", "text": "悄悄话" }
{ "type": "ping", "time": 1710000000000 }
{ "type": "list-users" }
```

服务端推送示例：

```json
{ "type": "welcome", "yourId": "c-...", "onlineCount": 2 }
{ "type": "user-joined", "user": { "id", "name", "room" } }
{ "type": "chat", "from": { ... }, "text": "...", "timestamp": ... }
```

扩展新功能时：**只加 type，不破坏旧字段**，是常见做法。

---

## 核心 API 速查

### 浏览器

```javascript
const ws = new WebSocket('ws://localhost:3000?name=小明&room=general');

ws.onopen = () => ws.send(JSON.stringify({ type: 'chat', text: 'hi' }));
ws.onmessage = (e) => console.log(e.data);
ws.onclose = (e) => console.log(e.code, e.reason);
ws.onerror = () => console.log('error');

ws.send('纯文本');
ws.send(new Uint8Array([1, 2, 3]).buffer);
ws.close(1000, '正常关闭');
```

`readyState`：`0 CONNECTING` · `1 OPEN` · `2 CLOSING` · `3 CLOSED`

### Node (ws 库)

```javascript
import { WebSocketServer } from 'ws';

const wss = new WebSocketServer({ server: httpServer });

wss.on('connection', (ws, req) => {
  ws.send('hello');
  ws.on('message', (data, isBinary) => { /* ... */ });
  ws.on('close', (code, reason) => { /* ... */ });
  ws.ping(); // 协议层心跳
});
```

---

## 关闭码 Code 简要说明

| Code | 含义 |
|------|------|
| 1000 | 正常关闭 |
| 1001 | 端点离开（如页面关闭） |
| 1006 | 异常断开（未收到 close 帧，常见于网络中断） |
| 4000+ | 应用自定义（需在 4000–4999 范围） |

---

## 推荐练习顺序

1. **单页连接**：点连接，看 `welcome` 和 `yourId`。
2. **双页广播**：两标签不同昵称，发聊天，两边都收到 `chat`。
3. **房间**：一个改 room 为 `dev`，发房间消息，只有同房间收到。
4. **私聊**：A 点「刷新在线用户」，复制 B 的 `id`，发私聊。
5. **二进制**：点发送，日志里看 `binary-echo` 和回显字节。
6. **应用层 ping**：看 `pong` 里的 `serverTime`。
7. **重连**：勾选自动重连 →「模拟断线重连」，观察退避重连日志。

---

## 与生产环境的差距（了解即可）

- 需要 **WSS**（`wss://`）+ 反向代理（Nginx/Caddy）做 TLS。
- 多机部署要用 **Redis Pub/Sub** 或消息队列做跨节点广播。
- 鉴权常在握手阶段校验 **Cookie / JWT**（`req.headers`）。
- 大流量要考虑 **背压**、消息队列、限流。
- 移动端注意省电与弱网下的重连策略。

---

## 目录结构

```
websocket-test/
├── server/index.js    # WebSocket 服务端逻辑
├── public/
│   ├── index.html     # 教学 UI
│   ├── client.js      # 浏览器端 WebSocket
│   └── style.css
├── package.json
└── README.md
```
