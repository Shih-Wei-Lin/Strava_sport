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
                id: run.id,
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
                <div class="run-info" style="flex: 1;">
                    <h3>${run.name}</h3>
                    <div class="run-metrics">
                        <div class="metric">🏃‍♂️ <span>${run.distance_km}</span> km</div>
                        <div class="metric">⏱️ <span>${run.moving_time_minutes}</span> min</div>
                        <div class="metric">❤️ <span>${run.average_heartrate || '--'}</span> bpm</div>
                        <div class="metric">📈 <span>${run.total_elevation_gain_m || 0}</span> m</div>
                    </div>
                </div>
                <div class="run-pace" style="display:flex; flex-direction:column; align-items:flex-end; gap:0.5rem;">
                    <div class="metric">配速: <span>${pace}</span> /km</div>
                    <button class="btn download-run-btn" data-id="${run.id}" style="padding: 0.4rem 0.8rem; font-size: 0.85rem; background: rgba(192, 132, 252, 0.2); border: 1px solid #c084fc; color: #e9d5ff;">📥 原始感測資料</button>
                    <div class="download-status" id="dl-status-${run.id}" style="font-size: 0.8rem; color: #4ade80; display: none;">打包中..</div>
                </div>
            `;
            runsList.appendChild(card);
        });

        // Add event listeners for individual download buttons
        document.querySelectorAll(".download-run-btn").forEach(btn => {
            btn.addEventListener("click", async (e) => {
                const runId = e.target.getAttribute("data-id");
                await downloadSingleRunData(runId);
            });
        });
    }

    // Individual Run Data Export
    async function downloadSingleRunData(runId) {
        const run = runsData.find(r => r.id.toString() === runId.toString());
        if (!run) return;

        const downloadBtn = document.querySelector(`.download-run-btn[data-id="${runId}"]`);
        const statusText = document.getElementById(`dl-status-${runId}`);

        downloadBtn.style.display = "none";
        statusText.style.display = "block";

        const token = localStorage.getItem("strava_access_token");

        const exportData = {
            activity_id: run.id,
            name: run.name,
            summary: {
                distance_km: parseFloat(run.distance_km),
                moving_time_minutes: parseFloat(run.moving_time_minutes),
                average_heartrate: run.average_heartrate || null,
                average_speed_m_s: run.average_speed_m_s,
                total_elevation_gain_m: run.total_elevation_gain_m || 0
            },
            streams: {}
        };

        try {
            // Fetch high-resolution streams
            const streamResp = await fetch(`https://www.strava.com/api/v3/activities/${run.id}/streams/time,distance,heartrate,velocity_smooth,altitude,cadence?key_by_type=true`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (streamResp.ok) {
                const streamData = await streamResp.json();

                if (streamData.time) exportData.streams.time_seconds = streamData.time.data;
                if (streamData.distance) exportData.streams.distance_meters = streamData.distance.data;
                if (streamData.heartrate) exportData.streams.heartrate_bpm = streamData.heartrate.data;
                if (streamData.velocity_smooth) exportData.streams.velocity_m_s = streamData.velocity_smooth.data;
                if (streamData.altitude) exportData.streams.altitude_meters = streamData.altitude.data;
                if (streamData.cadence) exportData.streams.cadence_spm = streamData.cadence.data;
            } else {
                statusText.innerText = "❌ 抓取失敗";
                statusText.style.color = "#ef4444";
                setTimeout(() => { downloadBtn.style.display = "block"; statusText.style.display = "none"; }, 3000);
                return;
            }
        } catch (err) {
            console.warn("Failed to fetch stream data for run", run.id, err);
            statusText.innerText = "❌ 網路錯誤";
            statusText.style.color = "#ef4444";
            setTimeout(() => { downloadBtn.style.display = "block"; statusText.style.display = "none"; }, 3000);
            return;
        }

        statusText.innerText = "✅ 完成！";

        // Create Blob and Download
        const jsonString = JSON.stringify(exportData, null, 2);
        const blob = new Blob([jsonString], { type: "application/json" });
        const url = URL.createObjectURL(blob);

        const a = document.createElement("a");
        a.href = url;
        // Clean up the name for file systems
        const safeName = run.name.replace(/[^a-z0-9]/gi, '_').toLowerCase();
        a.download = `strava_${safeName}_${run.id}.json`;
        document.body.appendChild(a);
        a.click();

        setTimeout(() => {
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            statusText.style.display = "none";
            downloadBtn.style.display = "block";
        }, 2000);
    }

    // 5. Prompt Generation
    async function generateCoachPrompt(model) {
        promptContainer.classList.remove("hidden");
        copyToast.style.display = "none";
        promptContainer.style.borderLeftColor = model === 'openai' ? 'var(--openai-color)' : 'var(--gemini-color)';

        if (runsData.length === 0) {
            coachPrompt.value = "目前沒有找到近期的跑步紀錄。快去動一動吧！";
            return;
        }

        coachPrompt.value = "正在向 Strava 獲取您每公里的詳細配速與心率曲線資料，請稍候...";
        const ai_name = model === 'openai' ? "ChatGPT" : "Gemini";
        const token = localStorage.getItem("strava_access_token");

        let prompt = `你好 ${ai_name}，我希望你擔任我的專業馬拉松教練。以下是我最近透過 Strava 紀錄的訓練數據。\n`;
        prompt += `因為我需要進階的分析，我提供了「整體平均數據」與「每公里分段數據 (Splits)」，這代表了我在整趟訓練中的配速與心率變化曲線。\n\n`;

        // Take top 3 runs max to avoid making prompt too huge for phone memory
        const recentRuns = runsData.slice(0, 3);

        for (const run of recentRuns) {
            const hr = run.average_heartrate || '未知';
            const elev = run.total_elevation_gain_m || 0;
            const avgSpeed = parseFloat(run.average_speed_m_s);
            const avgPace = avgSpeed > 0 ? (1000 / 60 / avgSpeed).toFixed(2).replace('.', '\'') : "0'00";

            prompt += `🏃‍♂️ 【${run.name}】\n`;
            prompt += `整體表現：距離 ${run.distance_km} km，移動時間 ${run.moving_time_minutes} 分鐘，平均配速 ${avgPace}/km，平均心率 ${hr} bpm，總爬升 ${elev} 公尺。\n`;

            // Fetch detailed activity for splits (curves)
            try {
                const detailResp = await fetch(`https://www.strava.com/api/v3/activities/${run.id}`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });

                if (detailResp.ok) {
                    const detailData = await detailResp.json();
                    if (detailData.splits_metric && detailData.splits_metric.length > 0) {
                        prompt += `📍 每公里分段變化 (曲線數據)：\n`;
                        detailData.splits_metric.forEach(split => {
                            // Don't log small remaining fractional kilometers if they are too short (e.g. 0.01km)
                            if (split.distance < 100 && split.split > run.distance_km) return;

                            const spd = parseFloat(split.average_speed);
                            const paceStr = spd > 0 ? (1000 / 60 / spd).toFixed(2).replace('.', '\'') : "0'00";
                            const splitHr = split.average_heartrate ? `${Math.round(split.average_heartrate)} bpm` : '未知';
                            const splitElev = split.elevation_difference ? `${split.elevation_difference}m` : '0m';

                            prompt += `  - 第 ${split.split} 公里: 配速 ${paceStr}/km, 心率 ${splitHr}, 爬升/下降 ${splitElev}\n`;
                        });
                    }
                }
            } catch (err) {
                console.warn("Failed to fetch splits for run", run.id, err);
            }
            prompt += `\n`;
        }

        prompt += `👉 教練指令：\n`;
        prompt += `請根據以上包含「分段曲線」的數據詳細分析我的表現。幫我看看：\n`;
        prompt += `1. 我的配速策略是否穩定？前半段與後半段是否有掉速？\n`;
        prompt += `2. 心率的發展曲線是否合理？是否在特定公里數飄高？\n`;
        prompt += `3. 爬升路段對我的心率/配速造成的影響？\n`;
        prompt += `幫我綜合評估後，給我下一次訓練的建議。請用繁體中文且帶有專業但鼓勵的語氣回答我。`;

        coachPrompt.value = prompt;
    }

    copyBtn.addEventListener("click", () => {
        if (!coachPrompt.value || coachPrompt.value.includes("目前沒有找到") || coachPrompt.value.includes("正在向")) {
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

    // 6. DB Export (Stream Data for Individual DB Export)
    async function downloadSingleRunData(runId) {
        const run = runsData.find(r => r.id.toString() === runId.toString());
        if (!run) return;

        const downloadBtn = document.querySelector(`.download-run-btn[data-id="${runId}"]`);
        const statusText = document.getElementById(`dl-status-${runId}`);

        downloadBtn.style.display = "none";
        statusText.style.display = "block";

        const token = localStorage.getItem("strava_access_token");

        const exportData = {
            activity_id: run.id,
            name: run.name,
            summary: {
                distance_km: parseFloat(run.distance_km),
                moving_time_minutes: parseFloat(run.moving_time_minutes),
                average_heartrate: run.average_heartrate || null,
                average_speed_m_s: run.average_speed_m_s,
                total_elevation_gain_m: run.total_elevation_gain_m || 0
            },
            streams: {}
        };

        try {
            // Fetch high-resolution streams
            const streamResp = await fetch(`https://www.strava.com/api/v3/activities/${run.id}/streams/time,distance,heartrate,velocity_smooth,altitude,cadence?key_by_type=true`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (streamResp.ok) {
                const streamData = await streamResp.json();

                if (streamData.time) exportData.streams.time_seconds = streamData.time.data;
                if (streamData.distance) exportData.streams.distance_meters = streamData.distance.data;
                if (streamData.heartrate) exportData.streams.heartrate_bpm = streamData.heartrate.data;
                if (streamData.velocity_smooth) exportData.streams.velocity_m_s = streamData.velocity_smooth.data;
                if (streamData.altitude) exportData.streams.altitude_meters = streamData.altitude.data;
                if (streamData.cadence) exportData.streams.cadence_spm = streamData.cadence.data;
            } else {
                statusText.innerText = "❌ 失敗";
                statusText.style.color = "#ef4444";
                setTimeout(() => { downloadBtn.style.display = "block"; statusText.style.display = "none"; }, 3000);
                return;
            }
        } catch (err) {
            console.warn("Failed to fetch stream data for run", run.id, err);
            statusText.innerText = "❌ 錯誤";
            statusText.style.color = "#ef4444";
            setTimeout(() => { downloadBtn.style.display = "block"; statusText.style.display = "none"; }, 3000);
            return;
        }

        statusText.innerText = "✅ 成功";

        // Create Blob and Download
        const jsonString = JSON.stringify(exportData, null, 2);
        const blob = new Blob([jsonString], { type: "application/json" });
        const url = URL.createObjectURL(blob);

        const a = document.createElement("a");
        a.href = url;
        const safeName = run.name.replace(/[^a-z0-9\u4e00-\u9fa5]/gi, '_').toLowerCase();
        a.download = `strava_${safeName}_${run.id}.json`;
        document.body.appendChild(a);
        a.click();

        setTimeout(() => {
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            statusText.style.display = "none";
            downloadBtn.style.display = "block";
        }, 2000);
    }

    initApp();
});
