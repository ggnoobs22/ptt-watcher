# ptt-watcher

自動監控 PTT 站內信，收到新信件時透過 n8n 發送通知至 Telegram / LINE。

## 架構
```
PTT WebSocket
  → Node.js container (ptt-watcher)
      → 偵測到新站內信
          → POST 到 n8n Webhook
              → Telegram / LINE 通知
```

## 環境需求

- Docker
- Docker Compose
- n8n（已運行中）

## 安裝步驟

**1. Clone 專案**
```bash
git clone https://github.com/ggnoobs22/ptt-watcher.git
cd ptt-watcher
```

**2. 建立 .env 檔案**
```bash
cp .env.example .env
nano .env
```

填入以下內容：
```
PTT_ID=你的PTT帳號
PTT_PWD=你的PTT密碼
N8N_WEBHOOK_URL=http://n8n:5678/webhook/ptt-mail
```

**3. 確認 Docker network**
```bash
docker network ls
docker inspect n8n --format '{{json .NetworkSettings.Networks}}'
```

將 `docker-compose.yml` 裡的 network 改成 n8n 所在的 network。

**4. 啟動**
```bash
docker compose up -d --build
docker logs -f ptt-watcher
```

## n8n Webhook 設定

1. 新增 Workflow
2. 新增 **Webhook** 節點
   - Method：`POST`
   - Path：`ptt-mail`
   - Authentication：`None`
   - Respond：`Immediately`
3. 接上 **Telegram** 節點，訊息內容：
```
📬 PTT 新站內信

時間：{{ $json.body.date }}
```
4. 將 Workflow 設為 **Active**

## 運作說明

- 每 60 秒登入 PTT 信箱檢查一次
- 以信件列表最新編號判斷是否有新信
- 偵測到新信件時 POST 至 n8n Webhook 觸發通知
- 斷線後自動重連

## 注意事項

- `.env` 已加入 `.gitignore`，帳密不會上傳至 GitHub
- PTT 帳號請勿開啟二步驟驗證
