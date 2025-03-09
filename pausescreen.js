(function() {
    let userId = null;
    let token = null;
    let currentItemId = null; // Track the currently paused item

    const getJellyfinCredentials = () => {
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

    const credentials = getJellyfinCredentials();
    if (!credentials) return;
    userId = credentials.userId;
    token = credentials.token;

    console.log("Using UserID:", userId);

    const overlay = document.createElement("div");
    overlay.id = "video-overlay";
    overlay.style = `
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

    const overlayContent = document.createElement("div");
    overlayContent.id = "overlay-content";
    overlayContent.style = "display: flex; align-items: center; justify-content: center; text-align: center;";

    const overlayLogo = document.createElement("img");
    overlayLogo.id = "overlay-logo";
    overlayLogo.style = "width: 50vw; height: auto; margin-right: 50vw; display: none;";

    const overlayPlot = document.createElement("div");
    overlayPlot.id = "overlay-plot";
    overlayPlot.style = "top: 38vh; max-width: 40%; height: 50vh; display: block; right: 5vw; position: absolute;";

    overlayContent.appendChild(overlayLogo);
    overlayContent.appendChild(overlayPlot);
    overlay.appendChild(overlayContent);

    const overlayDisc = document.createElement("img");
    overlayDisc.id = "overlay-disc";
    overlayDisc.style = `
        position: absolute;
        top: 5vh;
        right: 4vw;
        width: 10vw;
        height: auto;
        display: none;
        animation: spin 10s linear infinite;
    `;
    overlay.appendChild(overlayDisc);

    const discStyle = document.createElement("style");
    discStyle.textContent = `
        @keyframes spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
        }
    `;
    document.head.appendChild(discStyle);

    document.body.appendChild(overlay);

    const styleOverride = document.createElement("style");
    styleOverride.textContent = `
        .videoOsdBottom {
            z-index: 1 !important;
        }
        video {
            z-index: -1 !important;
        }
    `;
    document.head.appendChild(styleOverride);

    function clearOverlay() {
        overlay.style.display = "none";
        overlayLogo.src = "";
        overlayLogo.style.display = "none";
        overlayDisc.src = "";
        overlayDisc.style.display = "none";
        overlayPlot.textContent = "";
        overlayPlot.style.display = "none";
        currentItemId = null; // Reset current item tracking
    }

    async function fetchImage(url) {
        try {
            const response = await fetch(url, { method: 'HEAD' });
            return response.ok ? url : null;
        } catch {
            return null;
        }
    }

    async function fetchItemDetails(itemId) {
        if (currentItemId === itemId) return; // Prevent redundant fetches

        clearOverlay(); // Clear old item data before fetching new

        console.log("Fetching details for item:", itemId);
        try {
            const response = await fetch(`${window.location.origin}/Users/${userId}/Items/${itemId}`, {
                headers: {
                    Authorization: `MediaBrowser Client="Jellyfin Web", Device="YourDeviceName", DeviceId="YourDeviceId", Version="YourClientVersion", Token="${token}"`
                }
            });
            if (!response.ok) throw new Error("Failed to fetch item details");

            const item = await response.json();
            currentItemId = item.Id; // Update currently displayed item

            // Fetch images with prioritization
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
                Promise.all(imageSources.map(fetchImage)),
                Promise.all(discSources.map(fetchImage))
            ]);

            const logoUrl = logoResults.find(url => url !== null);
            const discUrl = discResults.find(url => url !== null);

            if (logoUrl) {
                overlayLogo.src = logoUrl;
                overlayLogo.style.display = "block";
            } else {
                overlayLogo.style.display = "none";
            }

            if (discUrl) {
                overlayDisc.src = discUrl;
                overlayDisc.style.display = "block";
            } else {
                overlayDisc.style.display = "none";
            }

            overlayPlot.textContent = item.Overview || 'No overview available';
            overlayPlot.style.display = "block";
        } catch (error) {
            console.error("API fetch error:", error);
        }
    }

    function monitorPlaybackState() {
        setInterval(() => {
            const videoPlayer = document.querySelector('video');
            if (!videoPlayer) return;

            if (videoPlayer.paused && window.location.href.includes("/web/index.html#/video")) {
                overlay.style.display = 'flex';
            } else {
                overlay.style.display = 'none';
                currentItemId = null; // Ensure overlay clears when exiting video
            }
        }, 500);
    }

    function interceptNetworkRequests() {
        const originalFetch = window.fetch;
        window.fetch = async function(...args) {
            const response = await originalFetch(...args);
            if (args[0].includes("/Users/") && args[0].includes("/Items/")) {
                const match = args[0].match(/Items\/(\w{32})/);
                if (match) {
                    const itemId = match[1];
                    fetchItemDetails(itemId);
                }
            }
            return response;
        };
    }

    function monitorURLChange() {
        let lastURL = window.location.href;
        setInterval(() => {
            if (window.location.href !== lastURL) {
                lastURL = window.location.href;
                if (!window.location.href.includes("/web/index.html#/video")) {
                    clearOverlay();
                }
            }
        }, 500);
    }

function handleOverlayClick(event) {
    if (event.target === overlay) { // Ensure only clicks directly on the overlay trigger it
        overlay.style.display = "none";
        const videoPlayer = document.querySelector('video');
        if (videoPlayer && videoPlayer.paused) {
            videoPlayer.play();
        }
    }
}

overlay.addEventListener("click", handleOverlayClick);

    interceptNetworkRequests();
    monitorPlaybackState();
    monitorURLChange();
})();
