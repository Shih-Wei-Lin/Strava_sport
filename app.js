document.addEventListener("DOMContentLoaded", () => {
    // DOM Elements
    const settingsSection = document.getElementById("settings-section");
    const authSection = document.getElementById("auth-section");
    const dashboard = document.getElementById("dashboard");
    const runsList = document.getElementById("runs-list");

    const clientIdInput = document.getElementById("client-id");
    const clientSecretInput = document.getElementById("client-secret");
    const saveSettingsBtn = document.getElementById("save-settings-btn");
    const settingsMsg = document.getElementById("settings-msg");
    const resetSettingsBtn = document.getElementById("reset-settings-btn");

    const loginBtn = document.getElementById("login-btn");
    const openaiBtn = document.getElementById("get-openai-btn");
    const geminiBtn = document.getElementById("get-gemini-btn");

    const promptContainer = document.getElementById("prompt-container");
    const coachPrompt = document.getElementById("coach-prompt");
    const copyBtn = document.getElementById("copy-btn");
    const copyToast = document.getElementById("copy-toast");

    let runsData = []; // Store fetched runs

    // 1. App Initialization & Routing
    async function initApp() {
        const urlParams = new URLSearchParams(window.location.search);
        const code = urlParams.get('code');

        // If coming back from Strava auth
        if (code) {
            // Remove code from URL for clean UI
            window.history.replaceState({}, document.title, window.location.pathname);
            await exchangeToken(code);
            return;
        }

        const clientId = localStorage.getItem("strava_client_id");
        const clientSecret = localStorage.getItem("strava_client_secret");
        const accessToken = localStorage.getItem("strava_access_token");

        if (!clientId || !clientSecret) {
            // Need API keys
            settingsSection.classList.remove("hidden");
            authSection.classList.add("hidden");
            dashboard.classList.add("hidden");
        } else if (!accessToken) {
            // Need to login
            settingsSection.classList.add("hidden");
            authSection.classList.remove("hidden");
            dashboard.classList.add("hidden");
        } else {
            // We have token, try to fetch data
            settingsSection.classList.add("hidden");
            authSection.classList.add("hidden");
            dashboard.classList.remove("hidden");
            await loadRuns();
        }
    }

    // 2. Settings Management
    saveSettingsBtn.addEventListener("click", () => {
        const cid = clientIdInput.value.trim();
        const csec = clientSecretInput.value.trim();
        if (!cid || !csec) {
            alert("請填寫 Client ID 與 Client Secret");
            return;
        }
        localStorage.setItem("strava_client_id", cid);
        localStorage.setItem("strava_client_secret", csec);

        settingsMsg.innerText = "✅ 儲存成功！將安全存放在您的手機瀏覽器中。";
        settingsMsg.style.display = "block";

        setTimeout(() => {
            settingsSection.classList.add("hidden");
            authSection.classList.remove("hidden");
        }, 1500);
    });

    resetSettingsBtn.addEventListener("click", () => {
        if (confirm("確定要清除瀏覽器中的設定與登入狀態嗎？")) {
            localStorage.clear();
            location.reload();
        }
    });

    // 3. Strava Login Flow
    loginBtn.addEventListener("click", () => {
        const clientId = localStorage.getItem("strava_client_id");
        if (!clientId) return alert("請先設定 Client ID");

        const redirectUri = encodeURIComponent(window.location.origin + window.location.pathname);
        const authUrl = `https://www.strava.com/oauth/authorize?client_id=${clientId}&response_type=code&redirect_uri=${redirectUri}&approval_prompt=force&scope=read,activity:read_all`;
        window.location.href = authUrl;
    });

    async function exchangeToken(code) {
        document.body.innerHTML = "<h2 style='color:white; text-align:center; margin-top:50px;'>正在與 Strava 交換密鑰...</h2>";
        const clientId = localStorage.getItem("strava_client_id");
        const clientSecret = localStorage.getItem("strava_client_secret");

        try {
            const response = await fetch('https://www.strava.com/oauth/token', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    client_id: clientId,
                    client_secret: clientSecret,
                    code: code,
                    grant_type: 'authorization_code'
                })
            });

            if (!response.ok) throw new Error("Token exchange failed");

            const data = await response.json();
            localStorage.setItem("strava_access_token", data.access_token);
            localStorage.setItem("strava_refresh_token", data.refresh_token);
            location.reload(); // Reload to hit the dashboard
        } catch (error) {
            alert("Strava 授權失敗，請確認 Client Secret 是否正確。");
            console.error(error);
            localStorage.removeItem("strava_access_token");
            location.reload();
        }
    }

    // 4. Fetch Data
    async function loadRuns() {
        const token = localStorage.getItem("strava_access_token");
        try {
            const response = await fetch('https://www.strava.com/api/v3/athlete/activities?per_page=15', {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (response.status === 401) {
                // Token likely expired. For simplicity, force re-login.
                localStorage.removeItem("strava_access_token");
                alert("登入已過期，請重新登入 Strava");
                location.reload();
                return;
            }

            if (!response.ok) throw new Error("Failed to fetch runs");

            const activities = await response.json();

            // Filter and extract
            const runs = activities.filter(act => act.type === "Run" || act.sport_type === "Run");
            runsData = runs.map(run => ({
                name: run.name,
                distance_km: (run.distance / 1000).toFixed(2),
                moving_time_minutes: (run.moving_time / 60).toFixed(2),
                average_heartrate: run.average_heartrate,
                average_speed_m_s: run.average_speed,
                total_elevation_gain_m: run.total_elevation_gain
            }));

            renderRuns(runsData);
        } catch (error) {
            console.error(error);
            runsList.innerHTML = `<p class="loading">❌ 載入失敗: ${error.message}</p>`;
        }
    }

    function renderRuns(runs) {
        if (!runs || runs.length === 0) {
            runsList.innerHTML = `<p class="loading">沒有找到近期的跑步紀錄。</p>`;
            return;
        }

        runsList.innerHTML = "";
        runs.forEach(run => {
            const speed = parseFloat(run.average_speed_m_s);
            const pace = speed > 0 ? (1000 / 60 / speed).toFixed(2).replace('.', '\'') : "0'00";

            const card = document.createElement("div");
            card.className = "run-card";
            card.innerHTML = `
                <div class="run-info">
                    <h3>${run.name}</h3>
                    <div class="run-metrics">
                        <div class="metric">🏃‍♂️ <span>${run.distance_km}</span> km</div>
                        <div class="metric">⏱️ <span>${run.moving_time_minutes}</span> min</div>
                        <div class="metric">❤️ <span>${run.average_heartrate || '--'}</span> bpm</div>
                        <div class="metric">📈 <span>${run.total_elevation_gain_m || 0}</span> m</div>
                    </div>
                </div>
                <div class="run-pace">
                    <div class="metric">配速: <span>${pace}</span> /km</div>
                </div>
            `;
            runsList.appendChild(card);
        });
    }

    // 5. Prompt Generation
    function generateCoachPrompt(model) {
        promptContainer.classList.remove("hidden");
        copyToast.style.display = "none";
        promptContainer.style.borderLeftColor = model === 'openai' ? 'var(--openai-color)' : 'var(--gemini-color)';

        if (runsData.length === 0) {
            coachPrompt.value = "目前沒有找到近期的跑步紀錄。快去動一動吧！";
            return;
        }

        const ai_name = model === 'openai' ? "ChatGPT" : "Gemini";

        // Take top 5 runs max for prompt
        let prompt = `你好 ${ai_name}，我希望你擔任我的專業馬拉松教練。以下是我最近透過 Strava 紀錄的訓練數據：\n\n`;

        runsData.slice(0, 5).forEach(run => {
            const hr = run.average_heartrate || '未知';
            const elev = run.total_elevation_gain_m || 0;
            prompt += `- 【${run.name}】: 距離 ${run.distance_km} km，移動時間 ${run.moving_time_minutes} 分鐘，平均心率 ${hr} bpm，總爬升 ${elev} 公尺。\n`;
        });

        prompt += `\n請根據以上這些數據分析我的表現。給我一些具體的進步肯定，指出可以改善的地方，並給予我下一次訓練的建議（例如配速控制、心率區間或訓練課表調整）。請用繁體中文且帶有專業但鼓勵的語氣回答我。`;

        coachPrompt.value = prompt;
    }

    copyBtn.addEventListener("click", () => {
        if (!coachPrompt.value || coachPrompt.value.includes("目前沒有找到")) {
            return;
        }
        navigator.clipboard.writeText(coachPrompt.value).then(() => {
            copyToast.style.display = "block";
            setTimeout(() => {
                copyToast.style.display = "none";
            }, 3000);
        });
    });

    openaiBtn.addEventListener("click", () => generateCoachPrompt("openai"));
    geminiBtn.addEventListener("click", () => generateCoachPrompt("gemini"));

    initApp();
});
