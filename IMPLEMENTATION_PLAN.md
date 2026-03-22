# AI 馬拉松教練 - GitHub Pages 部署版 (Serverless)

因應部署至 **GitHub Pages** 的需求，系統架構將從「Python 後端 + 前端」轉變為 **100% 純前端網頁應用程式 (SPA)**。所有 Strava 資料的獲取與 Prompt 的生成都會直接在使用者的瀏覽器 (iPhone/手機端) 中完成。

## 為什麼這樣設計？
GitHub Pages 只支援靜態檔案 (HTML/CSS/JS)，無法運行 Python 伺服器且不適合將 App Secret 寫死在程式碼中。
因此，我們採用 **「本地端金鑰儲存 (Local Storage)」** 的做法：
1. 使用者第一次打開您的 GitHub Pages 網頁時，在畫面上輸入自己的 `Strava Client ID` 與 `Client Secret`。
2. 這些金鑰會安全地存在**您的手機瀏覽器本地 (*localStorage*)**，絕不會上傳到任何伺服器。
3. 往後只需要按「登入 Strava」，網頁會直接使用瀏覽器與 Strava API 進行金鑰交換與資料存取。

## 預計修改項目

### 1. 移除無用檔案 (Backend Cleanup)
刪除不需要的 Python 檔案，因為 GitHub Pages 用不到：
- `main.py`
- `requirements.txt`
- `services/` 目錄
- `tests/` 目錄
- `.env.example`

### 2. 重構前端核心邏輯 (Frontend Rewrite)
我們將所有的邏輯移至 `docs/` 或專案根目錄，方便 GitHub Pages 讀取。
- **`index.html`**: 加入「設定 API Key」的表單，以及原本的跑者儀表板。
- **`app.js`**: 
  - 實作 OAuth 2.0 PKCE 或一般的 Authorization Code Flow 交換。
  - 直接透過 `fetch()` 向 Strava 取得 `access_token` 與跑步紀錄。
  - 在前端 Javascript 實作 `PromptGenerator` 邏輯。
- **`style.css`**: 加入設定表單的高質感排版。

## 驗證計畫
1. 在本機以 Live Server (或簡單的 `python -m http.server`) 測試。
2. 打開瀏覽器，輸入 Client ID / Secret，授權後驗證是否能拿到數據。
3. 準備就緒後，直接將這些 HTML/JS/CSS push 到 GitHub `main` 分支並開啟 GitHub Pages 即可。
