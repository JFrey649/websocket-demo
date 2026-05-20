/**
 * WebSocket 教学客户端
 * 演示：连接生命周期、JSON 协议、二进制、应用层 ping、自动重连
 */

const $ = (id) => document.getElementById(id);

const els = {
  name: $('name'),
  room: $('room'),
  btnConnect: $('btnConnect'),
  btnDisconnect: $('btnDisconnect'),
  status: $('status'),
  wsUrl: $('wsUrl'),
  chatInput: $('chatInput'),
  btnChat: $('btnChat'),
  btnRoom: $('btnRoom'),
  btnPlain: $('btnPlain'),
  privateTo: $('privateTo'),
  privateText: $('privateText'),
  btnPrivate: $('btnPrivate'),
  btnListUsers: $('btnListUsers'),
  btnAppPing: $('btnAppPing'),
  btnBinary: $('btnBinary'),
  btnReconnect: $('btnReconnect'),
  autoReconnect: $('autoReconnect'),
  btnClearLog: $('btnClearLog'),
  log: $('log'),
};

let ws = null;
let myId = null;
let reconnectAttempts = 0;
let reconnectTimer = null;
let intentionalClose = false;

const MAX_RECONNECT = 5;

function buildWsUrl() {
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const params = new URLSearchParams({
    name: els.name.value.trim() || '匿名',
    room: els.room.value.trim() || 'general',
  });
  return `${protocol}//${location.host}?${params}`;
}

function setConnected(connected) {
  els.status.textContent = connected ? '已连接' : '未连接';
  els.status.className = `badge ${connected ? 'online' : 'offline'}`;
  els.btnConnect.disabled = connected;
  els.btnDisconnect.disabled = !connected;
  const actionButtons = [
    els.btnChat,
    els.btnRoom,
    els.btnPlain,
    els.btnPrivate,
    els.btnListUsers,
    els.btnAppPing,
    els.btnBinary,
    els.btnReconnect,
  ];
  actionButtons.forEach((b) => (b.disabled = !connected));
  els.name.disabled = connected;
  els.room.disabled = connected;
}

function log(label, data) {
  const time = new Date().toLocaleTimeString();
  const line =
    typeof data === 'string'
      ? `[${time}] ${label}: ${data}`
      : `[${time}] ${label}:\n${JSON.stringify(data, null, 2)}`;
  els.log.textContent = `${line}\n\n${els.log.textContent}`;
}

function sendJson(obj) {
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    log('错误', '未连接，无法发送');
    return;
  }
  ws.send(JSON.stringify(obj));
}

function connect() {
  intentionalClose = false;
  clearTimeout(reconnectTimer);

  const url = buildWsUrl();
  els.wsUrl.textContent = url;
  log('连接中', url);

  ws = new WebSocket(url);

  // 可选：子协议协商（服务端未强制时可省略）
  // ws = new WebSocket(url, ['chat-v1']);

  ws.binaryType = 'arraybuffer';

  ws.onopen = () => {
    reconnectAttempts = 0;
    setConnected(true);
    log('open', '连接已建立 (readyState=OPEN)');
  };

  ws.onmessage = (event) => {
    if (event.data instanceof ArrayBuffer) {
      log('binary 收到', `${event.data.byteLength} 字节`);
      return;
    }
    try {
      const msg = JSON.parse(event.data);
      if (msg.type === 'welcome' && msg.yourId) {
        myId = msg.yourId;
        log('welcome', msg);
      } else {
        log(msg.type || 'message', msg);
      }
    } catch {
      log('text 收到', event.data);
    }
  };

  ws.onerror = () => {
    log('error', '连接发生错误（详情见 onclose）');
  };

  ws.onclose = (event) => {
    setConnected(false);
    log('close', {
      code: event.code,
      reason: event.reason || '(无)',
      wasClean: event.wasClean,
    });

    if (!intentionalClose && els.autoReconnect.checked && reconnectAttempts < MAX_RECONNECT) {
      const delay = Math.min(1000 * 2 ** reconnectAttempts, 10000);
      reconnectAttempts += 1;
      log('重连', `${delay}ms 后第 ${reconnectAttempts} 次尝试…`);
      reconnectTimer = setTimeout(connect, delay);
    }
  };
}

function disconnect() {
  intentionalClose = true;
  clearTimeout(reconnectTimer);
  if (ws) {
    ws.close(1000, '用户主动断开');
    ws = null;
  }
  setConnected(false);
}

els.btnConnect.addEventListener('click', connect);
els.btnDisconnect.addEventListener('click', disconnect);

els.btnChat.addEventListener('click', () => {
  const text = els.chatInput.value.trim();
  if (!text) return;
  sendJson({ type: 'chat', text });
  els.chatInput.value = '';
});

els.btnRoom.addEventListener('click', () => {
  const text = els.chatInput.value.trim() || '房间测试消息';
  sendJson({ type: 'room-message', room: els.room.value, text });
});

els.btnPlain.addEventListener('click', () => {
  const text = els.chatInput.value.trim() || '纯文本消息';
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(text);
    log('发送 plain', text);
  }
});

els.btnPrivate.addEventListener('click', () => {
  sendJson({
    type: 'private',
    toId: els.privateTo.value.trim(),
    text: els.privateText.value.trim(),
  });
});

els.btnListUsers.addEventListener('click', () => sendJson({ type: 'list-users' }));

els.btnAppPing.addEventListener('click', () => {
  sendJson({ type: 'ping', time: Date.now() });
});

els.btnBinary.addEventListener('click', () => {
  const bytes = new Uint8Array([0x48, 0x69, 0x21]); // "Hi!"
  ws.send(bytes.buffer);
  log('发送 binary', `${bytes.length} 字节`);
});

els.btnReconnect.addEventListener('click', () => {
  log('模拟', '主动 close 后依赖自动重连');
  if (ws) ws.close(4000, '模拟断线');
});

els.btnClearLog.addEventListener('click', () => {
  els.log.textContent = '';
});

els.chatInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    els.btnChat.click();
  }
});

els.wsUrl.textContent = buildWsUrl();
setConnected(false);
