const WebSocket = require('ws');
const axios = require('axios');
const iconv = require('iconv-lite');

const PTT_ID = process.env.PTT_ID;
const PTT_PWD = process.env.PTT_PWD;
const N8N_WEBHOOK = process.env.N8N_WEBHOOK_URL;
const CHECK_INTERVAL = 60000;

let lastMailCount = null;
let ws;
let step = 0;
let mailBuffer = '';
let menuTimer = null;
let checkTimer = null;
let processed = false;

function send(str) {
  const encoded = iconv.encode(str + '\r\n', 'big5');
  ws.send(encoded);
}

function sendLeft() {
  ws.send(iconv.encode('\x1b[D', 'big5'));
}

function processMailBuffer() {
  if (processed) return;
  processed = true;
  const c = mailBuffer.replace(/\x1b\[[^A-Za-z]*[A-Za-z]/g, '');
  console.log('[mail] 畫面:', c.slice(0, 400));
  const nums = [...c.matchAll(/^\s*●?\s*(\d+)\s/gm)].map(m => parseInt(m[1]));
  const count = nums.length > 0 ? Math.max(...nums) : 0;
  console.log(`[mail] 最新信件編號: ${count}`);

  if (lastMailCount === null) {
    lastMailCount = count;
    console.log('[mail] 初始化完成:', count);
  } else if (count > lastMailCount) {
    console.log(`[mail] 有新信！從 ${lastMailCount} 增加到 ${count}`);
    const lines = c.split('\n');
    let latestTitle = '（無法取得標題）';
    for (const line of lines) {
      if (line.match(/^\s*●?\s*\d+\s/)) {
        const parts = line.trim().split(/\s+/);
        const titleStart = line.indexOf(parts[3]) + parts[3].length;
        const title = line.slice(titleStart).trim().replace(/^[◇◆\s]+/, '');
        if (title) latestTitle = title;
      }
    }

    // 台灣時間 UTC+8
    const now = new Date();
    const twTime = new Date(now.getTime() + 8 * 60 * 60 * 1000);
    const twTimeStr = twTime.toISOString().replace('T', ' ').slice(0, 19);

    axios.post(N8N_WEBHOOK, {
      title: latestTitle,
      date: twTimeStr
    }).catch(e => console.error('[webhook error]', e.message));
    lastMailCount = count;
  } else {
    console.log('[mail] 沒有新信');
  }

  // 連按三次左鍵回主功能表
  setTimeout(() => {
    sendLeft();
    setTimeout(() => sendLeft(), 800);
    setTimeout(() => sendLeft(), 1600);
    setTimeout(() => sendLeft(), 2400);
    step = 20;
    console.log(`[loop] ${CHECK_INTERVAL / 1000} 秒後再檢查`);
    checkTimer = setTimeout(() => goCheckMail(), CHECK_INTERVAL + 3000);
  }, 500);
}

function goCheckMail() {
  processed = false;
  mailBuffer = '';
  step = 10;
  console.log('[mail] 前往信箱');
  send('m');
  setTimeout(() => send(''), 1000);
}

function handleData(raw) {
  const text = iconv.decode(Buffer.from(raw), 'big5');
  const clean = text.replace(/\x1b\[[^A-Za-z]*[A-Za-z]/g, '').trim();
  if (clean) console.log(`[step=${step}]`, clean.slice(0, 100));

  if (step === 0 && text.includes('請輸入代號')) {
    step = 1;
    send(PTT_ID);

  } else if (step === 1 && text.includes('密碼')) {
    step = 2;
    send(PTT_PWD);

  } else if (step >= 2 && step < 10) {
    if (text.includes('其它連線') || text.includes('刪除其他重複登入')) {
      send('y');
    } else if (text.includes('Mail') || text.includes('私人信件')) {
      if (menuTimer) clearTimeout(menuTimer);
      menuTimer = setTimeout(() => {
        console.log('[login] 登入成功');
        goCheckMail();
      }, 1000);
    } else {
      sendLeft();
    }

  } else if (step === 10) {
    if (text.includes('我的信箱') || text.includes('(R)ead')) {
      step = 11;
      console.log('[mail] 電子郵件選單，直接按Enter');
//      setTimeout(() => send('r'), 500);
      setTimeout(() => send(''), 1200);
//      setTimeout(() => {
//        console.log('[mail] 送 $');
//        send('$');
//      }, 2500);
//      setTimeout(() => processMailBuffer(), 5000);
    }

  } else if (step === 11) {
    mailBuffer += text;
    if (text.includes('郵件選單') && !processed) {
      console.log('[mail] 偵測到郵件選單，送 $');
      mailBuffer = '';
      send('$');
      step = 12;
    }

  } else if (step === 12) {
    mailBuffer += text;
    if (text.includes('容量') && !processed) {
      setTimeout(() => processMailBuffer(), 500);
    }

  } else if (step === 20) {
    // 等待回到主功能表，不做任何事
  }
}

function connect() {
  console.log('[ws] connecting...');
  ws = new WebSocket('wss://ws.ptt.cc/bbs', {
    headers: { 'Origin': 'https://term.ptt.cc' }
  });

  ws.on('open', () => {
    console.log('[ws] connected');
    step = 0;
    mailBuffer = '';
    if (menuTimer) clearTimeout(menuTimer);
    if (checkTimer) clearTimeout(checkTimer);
  });

  ws.on('message', (data) => handleData(data));

  ws.on('close', () => {
    console.log('[ws] disconnected, reconnecting in 30s...');
    if (menuTimer) clearTimeout(menuTimer);
    if (checkTimer) clearTimeout(checkTimer);
    setTimeout(connect, 30000);
  });

  ws.on('error', (err) => console.error('[ws] error:', err.message));
}

connect();
