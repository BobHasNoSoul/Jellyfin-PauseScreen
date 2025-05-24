(function() {
    let PAUSESCREEN_userId = null;
    let PAUSESCREEN_token = null;
    let PAUSESCREEN_currentItemId = null; // Track the currently paused item

    const PAUSESCREEN_getJellyfinCredentials = () => {
        const jellyfinCreds = localStorage.getItem("jellyfin_credentials");
        try {
            const serverCredentials = JSON.parse(jellyfinCreds);
            const firstServer = serverCredentials.Servers[0];
            if (!firstServer) {
                console.error("Could not find credentials for the client");
                return;
            }
            return { token: firstServer.AccessToken, userId: firstServer.UserId };
        } catch (e) {
            console.error("Could not parse jellyfin credentials", e);
        }
    };

    const PAUSESCREEN_credentials = PAUSESCREEN_getJellyfinCredentials();
    if (!PAUSESCREEN_credentials) return;
    PAUSESCREEN_userId = PAUSESCREEN_credentials.userId;
    PAUSESCREEN_token = PAUSESCREEN_credentials.token;

    console.log("Using UserID:", PAUSESCREEN_userId);

    const PAUSESCREEN_overlay = document.createElement("div");
    PAUSESCREEN_overlay.id = "video-overlay";
    PAUSESCREEN_overlay.style = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.7);
        z-index: 0;
        display: none;
        align-items: center;
        justify-content: center;
        color: white;
    `;

    const PAUSESCREEN_overlayContent = document.createElement("div");
    PAUSESCREEN_overlayContent.id = "overlay-content";
    PAUSESCREEN_overlayContent.style = "display: flex; align-items: center; justify-content: center; text-align: center;";

    const PAUSESCREEN_overlayLogo = document.createElement("img");
    PAUSESCREEN_overlayLogo.id = "overlay-logo";
    PAUSESCREEN_overlayLogo.style = "width: 50vw; height: auto; margin-right: 50vw; display: none;";

    const PAUSESCREEN_overlayPlot = document.createElement("div");
    PAUSESCREEN_overlayPlot.id = "overlay-plot";
    PAUSESCREEN_overlayPlot.style = "top: 38vh; max-width: 40%; height: 50vh; display: block; right: 5vw; position: absolute;";

    PAUSESCREEN_overlayContent.appendChild(PAUSESCREEN_overlayLogo);
    PAUSESCREEN_overlayContent.appendChild(PAUSESCREEN_overlayPlot);
    PAUSESCREEN_overlay.appendChild(PAUSESCREEN_overlayContent);

    const PAUSESCREEN_overlayDisc = document.createElement("img");
    PAUSESCREEN_overlayDisc.id = "overlay-disc";
    PAUSESCREEN_overlayDisc.style = `
        position: absolute;
        top: 5vh;
        right: 4vw;
        width: 10vw;
        height: auto;
        display: none;
        animation: PAUSESCREEN_spin 10s linear infinite;
    `;
    PAUSESCREEN_overlay.appendChild(PAUSESCREEN_overlayDisc);

    const PAUSESCREEN_discStyle = document.createElement("style");
    PAUSESCREEN_discStyle.textContent = `
        @keyframes PAUSESCREEN_spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
        }
    `;
    document.head.appendChild(PAUSESCREEN_discStyle);

    document.body.appendChild(PAUSESCREEN_overlay);

    const PAUSESCREEN_styleOverride = document.createElement("style");
    PAUSESCREEN_styleOverride.textContent = `
        .videoOsdBottom {
            z-index: 1 !important;
        }
        video {
            z-index: -1 !important;
        }
    `;
    document.head.appendChild(PAUSESCREEN_styleOverride);

    function PAUSESCREEN_clearOverlay() {
        PAUSESCREEN_overlay.style.display = "none";
        PAUSESCREEN_overlayLogo.src = "";
        PAUSESCREEN_overlayLogo.style.display = "none";
        PAUSESCREEN_overlayDisc.src = "";
        PAUSESCREEN_overlayDisc.style.display = "none";
        PAUSESCREEN_overlayPlot.textContent = "";
        PAUSESCREEN_overlayPlot.style.display = "none";
        PAUSESCREEN_currentItemId = null;
    }

    async function PAUSESCREEN_fetchImage(url) {
        try {
            const response = await fetch(url, { method: 'HEAD' });
            return response.ok ? url : null;
        } catch {
            return null;
        }
    }

    async function PAUSESCREEN_fetchItemDetails(itemId) {
        if (PAUSESCREEN_currentItemId === itemId) return; // Prevent redundant fetches

        PAUSESCREEN_clearOverlay();

        console.log("Fetching details for item:", itemId);
        try {
            const response = await fetch(`${window.location.origin}/Users/${PAUSESCREEN_userId}/Items/${itemId}`, {
                headers: {
                    Authorization: `MediaBrowser Client="Jellyfin Web", Device="YourDeviceName", DeviceId="YourDeviceId", Version="YourClientVersion", Token="${PAUSESCREEN_token}"`
                }
            });
            if (!response.ok) throw new Error("Failed to fetch item details");

            const item = await response.json();
            PAUSESCREEN_currentItemId = item.Id;

            const imageSources = [
                `${window.location.origin}/Items/${item.Id}/Images/Logo`,
                item.ParentId ? `${window.location.origin}/Items/${item.ParentId}/Images/Logo` : null,
                item.SeriesId ? `${window.location.origin}/Items/${item.SeriesId}/Images/Logo` : null
            ].filter(Boolean);

            const discSources = [
                `${window.location.origin}/Items/${item.Id}/Images/Disc?maxWidth=480`,
                item.ParentId ? `${window.location.origin}/Items/${item.ParentId}/Images/Disc?maxWidth=480` : null,
                item.SeriesId ? `${window.location.origin}/Items/${item.SeriesId}/Images/Disc?maxWidth=480` : null
            ].filter(Boolean);

            const [logoResults, discResults] = await Promise.all([
                Promise.all(imageSources.map(PAUSESCREEN_fetchImage)),
                Promise.all(discSources.map(PAUSESCREEN_fetchImage))
            ]);

            const logoUrl = logoResults.find(url => url !== null);
            const discUrl = discResults.find(url => url !== null);

            if (logoUrl) {
                PAUSESCREEN_overlayLogo.src = logoUrl;
                PAUSESCREEN_overlayLogo.style.display = "block";
            } else {
                PAUSESCREEN_overlayLogo.style.display = "none";
            }

            if (discUrl) {
                PAUSESCREEN_overlayDisc.src = discUrl;
                PAUSESCREEN_overlayDisc.style.display = "block";
            } else {
                PAUSESCREEN_overlayDisc.style.display = "none";
            }

            PAUSESCREEN_overlayPlot.textContent = item.Overview || 'No overview available';
            PAUSESCREEN_overlayPlot.style.display = "block";
        } catch (error) {
            console.error("API fetch error:", error);
        }
    }

    function PAUSESCREEN_monitorPlaybackState() {
        setInterval(() => {
            const videoPlayer = document.querySelector('video');
            if (!videoPlayer) return;

            if (videoPlayer.paused && window.location.href.includes("/web/index.html#/video")) {
                PAUSESCREEN_overlay.style.display = 'flex';
            } else {
                PAUSESCREEN_overlay.style.display = 'none';
                PAUSESCREEN_currentItemId = null;
            }
        }, 500);
    }

    function PAUSESCREEN_extractMediaSourceId(url) {
        try {
            const urlObj = new URL(url, window.location.origin);
            return urlObj.searchParams.get("MediaSourceId");
        } catch {
            return null;
        }
    }

    function PAUSESCREEN_interceptFetch() {
        const originalFetch = window.fetch;
        window.fetch = async function(...args) {
            const requestUrl = args[0];
            if (typeof requestUrl === 'string') {
                const mediaSourceId = PAUSESCREEN_extractMediaSourceId(requestUrl);
                if (mediaSourceId) {
                    PAUSESCREEN_fetchItemDetails(mediaSourceId);
                }
            }
            return originalFetch.apply(this, args);
        };
    }

    function PAUSESCREEN_interceptXHR() {
        const originalOpen = XMLHttpRequest.prototype.open;
        XMLHttpRequest.prototype.open = function(method, url, async, user, password) {
            const mediaSourceId = PAUSESCREEN_extractMediaSourceId(url);
            if (mediaSourceId) {
                PAUSESCREEN_fetchItemDetails(mediaSourceId);
            }
            return originalOpen.apply(this, arguments);
        };
    }

    function PAUSESCREEN_monitorURLChange() {
        let lastURL = window.location.href;
        setInterval(() => {
            if (window.location.href !== lastURL) {
                lastURL = window.location.href;
                if (!window.location.href.includes("/web/index.html#/video")) {
                    PAUSESCREEN_clearOverlay();
                }
            }
        }, 500);
    }

    function PAUSESCREEN_handleOverlayClick(event) {
        if (event.target === PAUSESCREEN_overlay) {
            PAUSESCREEN_overlay.style.display = "none";
            const videoPlayer = document.querySelector('video');
            if (videoPlayer && videoPlayer.paused) {
                videoPlayer.play();
            }
        }
    }

    PAUSESCREEN_overlay.addEventListener("click", PAUSESCREEN_handleOverlayClick);

    PAUSESCREEN_interceptFetch();
    PAUSESCREEN_interceptXHR();
    PAUSESCREEN_monitorPlaybackState();
    PAUSESCREEN_monitorURLChange();
})();
