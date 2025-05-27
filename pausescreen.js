(function () {
    // Configuration
    const POLL_INTERVAL = 1000; // 2 seconds
    const REQUEST_TIMEOUT = 5000; // 5 seconds
    const FADE_DURATION = 500; // 0.5 seconds

    // State variables
    let userId = null;
    let token = null;
    let currentItemId = null;
    let pollingInterval = null;
    let preloadedItemDetails = null;
    let activeRequests = [];
    let isOverlayVisible = false;

    // Get Jellyfin credentials from localStorage
    const getJellyfinCredentials = () => {
        try {
            const jellyfinCreds = localStorage.getItem("jellyfin_credentials");
            if (!jellyfinCreds) {
                console.error("No Jellyfin credentials found in localStorage");
                return null;
            }

            const serverCredentials = JSON.parse(jellyfinCreds);
            const firstServer = serverCredentials.Servers[0];
            if (!firstServer) {
                console.error("No servers configured in Jellyfin credentials");
                return null;
            }

            return { 
                token: firstServer.AccessToken, 
                userId: firstServer.UserId 
            };
        } catch (e) {
            console.error("Error parsing Jellyfin credentials:", e);
            return null;
        }
    };

    // Initialize credentials
    const credentials = getJellyfinCredentials();
    if (!credentials) {
        console.error("Failed to initialize - no valid credentials");
        return;
    }
    
    userId = credentials.userId;
    token = credentials.token;
    console.log("Jellyfin Pause Screen initialized for UserID:", userId);

    // ======================
    // UI ELEMENT CREATION
    // ======================

    // Create main overlay container
    const overlay = document.createElement("div");
    overlay.id = "jellyfin-pause-overlay";
    overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.85);
        z-index: 9998;
        display: flex;
        align-items: center;
        justify-content: center;
        color: white;
        opacity: 0;
        visibility: hidden;
        transition: opacity ${FADE_DURATION}ms ease, visibility 0s linear ${FADE_DURATION}ms;
        pointer-events: auto;
    `;

    // Create overlay content container
    const overlayContent = document.createElement("div");
    overlayContent.id = "overlay-content";
    overlayContent.style.cssText = `
        display: flex;
        align-items: center;
        justify-content: center;
        width: 100%;
        height: 100%;
        position: relative;
    `;

    // Create logo element
    const overlayLogo = document.createElement("img");
    overlayLogo.id = "overlay-logo";
    overlayLogo.style.cssText = `
        position: absolute;
        width: 50vw;
        height: auto;
        left: 5vw;
        top: 50%;
        transform: translateY(-50%);
        display: none;
        opacity: 0;
        transition: opacity 300ms ease 200ms;
        object-fit: contain;
    `;

    // Create disc image element
    const overlayDisc = document.createElement("img");
    overlayDisc.id = "overlay-disc";
    overlayDisc.style.cssText = `
        position: absolute;
        width: 12vw;
        height: auto;
        right: 5vw;
        top: 10vh;
        display: none;
        opacity: 0;
        transition: opacity 300ms ease 300ms;
        animation: spin 10s linear infinite;
        filter: drop-shadow(0 0 10px rgba(0,0,0,0.5));
    `;

    // Create plot text element
    const overlayPlot = document.createElement("div");
    overlayPlot.id = "overlay-plot";
    overlayPlot.style.cssText = `
        position: absolute;
        max-width: 40%;
        max-height: 60vh;
        right: 5vw;
        top: 30vh;
        display: none;
        opacity: 0;
        transition: opacity 300ms ease 400ms;
        font-size: 1.2rem;
        line-height: 1.6;
        text-shadow: 0 0 10px rgba(0,0,0,0.8);
        overflow: hidden;
        text-overflow: ellipsis;
    `;

    // Assemble overlay structure
    overlayContent.appendChild(overlayLogo);
    overlayContent.appendChild(overlayDisc);
    overlayContent.appendChild(overlayPlot);
    overlay.appendChild(overlayContent);

    // Add spin animation style
    const discStyle = document.createElement("style");
    discStyle.textContent = `
        @keyframes spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
        }
    `;
    document.head.appendChild(discStyle);

    // Add overlay to document
    document.body.appendChild(overlay);

    // Style overrides for Jellyfin UI
    const styleOverride = document.createElement("style");
    styleOverride.textContent = `
        .videoOsdBottom {
            z-index: 9999 !important;
        }
        video {
            z-index: 1 !important;
        }
        #jellyfin-pause-overlay.visible {
            opacity: 1 !important;
            visibility: visible !important;
            transition: opacity ${FADE_DURATION}ms ease !important;
        }
        #jellyfin-pause-overlay.visible #overlay-logo,
        #jellyfin-pause-overlay.visible #overlay-disc,
        #jellyfin-pause-overlay.visible #overlay-plot {
            opacity: 1 !important;
        }
    `;
    document.head.appendChild(styleOverride);

    // ======================
    // CORE FUNCTIONS
    // ======================

    function clearOverlayContent() {
        overlayLogo.style.display = "none";
        overlayLogo.style.opacity = "0";
        overlayLogo.src = "";

        overlayDisc.style.display = "none";
        overlayDisc.style.opacity = "0";
        overlayDisc.src = "";

        overlayPlot.style.display = "none";
        overlayPlot.style.opacity = "0";
        overlayPlot.textContent = "";

        preloadedItemDetails = null;
    }


    function abortActiveRequests() {
        activeRequests.forEach(controller => {
            if (controller && !controller.signal.aborted) {
                controller.abort("Cleaning up before new request");
            }
        });
        activeRequests = [];
    }

    function createRequestController() {
        const controller = new AbortController();
        activeRequests.push(controller);
        return controller;
    }

    async function fetchWithTimeout(url, options = {}, timeout = REQUEST_TIMEOUT) {
        const controller = createRequestController();
        const timeoutId = setTimeout(() => controller.abort("Request timeout"), timeout);
        
        try {
            const response = await fetch(url, {
                ...options,
                signal: controller.signal,
                headers: {
                    ...options.headers,
                    Authorization: `MediaBrowser Client="Jellyfin Web", Device="Jellyfin Pause Screen", DeviceId="PauseScreenExtension", Version="1.0", Token="${token}"`,
                    "Content-Type": "application/json"
                }
            });
            
            clearTimeout(timeoutId);
            
            if (!response.ok) {
                throw new Error(`HTTP error! Status: ${response.status}`);
            }
            
            return response;
        } catch (error) {
            clearTimeout(timeoutId);
            if (error.name === 'AbortError') {
                console.debug('Request aborted:', url, error.message);
            } else {
                console.error('Fetch error:', url, error.message);
            }
            throw error;
        } finally {
            activeRequests = activeRequests.filter(c => c !== controller);
        }
    }

    async function fetchImage(url) {
        try {
            const response = await fetchWithTimeout(url, { method: 'HEAD' }, 3000);
            return response.ok ? url : null;
        } catch {
            return null;
        }
    }

    async function fetchItemDetails(itemId) {
        if (preloadedItemDetails?.Id === itemId) {
            applyItemDetails(preloadedItemDetails);
            return;
        }

        clearOverlayContent(); // <-- Clear the old content first
        console.debug("PAUSESCREEN: Fetching details for item:", itemId);
        try {
            const response = await fetchWithTimeout(
                `${window.location.origin}/Users/${userId}/Items/${itemId}`,
                { method: 'GET' }
            );

            const item = await response.json();
            preloadedItemDetails = item;
            
            // Restored original image fetching logic
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

            // Apply the found images
            if (logoUrl) {
                item.LogoUrl = logoUrl;
            }
            if (discUrl) {
                item.DiscUrl = discUrl;
            }
            
            applyItemDetails(item);
        } catch (error) {
            console.error("Failed to fetch item details:", error.message);
            // Don't clear overlay on fetch errors
        }
    }

    function applyItemDetails(item) {
        if (!item) return;

        currentItemId = item.Id;

        // Set logo image using original logic
        if (item.LogoUrl) {
            overlayLogo.src = item.LogoUrl;
            overlayLogo.style.display = "block";
        } else {
            overlayLogo.style.display = "none";
        }

        // Set disc image using original logic
        if (item.DiscUrl) {
            overlayDisc.src = item.DiscUrl;
            overlayDisc.style.display = "block";
        } else {
            overlayDisc.style.display = "none";
        }

        // Set plot text
        overlayPlot.textContent = item.Overview || 'No overview available';
        overlayPlot.style.display = "block";

        // If overlay should be visible, show it with fade-in
        if (isOverlayVisible) {
            showOverlay();
        }
    }

    function showOverlay() {
        if (isOverlayVisible) return;
        
        isOverlayVisible = true;
        overlay.style.display = "flex";
        
        // Force reflow to ensure transition works
        void overlay.offsetHeight;
        
        overlay.classList.add("visible");
    }

    function clearOverlay() {
        if (!isOverlayVisible) return;
        
        isOverlayVisible = false;
        abortActiveRequests();
        
        // Instantly hide overlay without fade-out
        overlay.classList.remove("visible");
        overlay.style.transition = "none";
        
        // Reset elements
        overlayLogo.style.opacity = "0";
        overlayDisc.style.opacity = "0";
        overlayPlot.style.opacity = "0";
        
        // Restore transition after hiding
        setTimeout(() => {
            overlay.style.transition = `opacity ${FADE_DURATION}ms ease, visibility 0s linear ${FADE_DURATION}ms`;
        }, 10);
    }

    async function checkPlaybackStatus() {
        try {
            const response = await fetchWithTimeout(
                `${window.location.origin}/Sessions?ActiveWithinSeconds=30`,
                { method: 'GET' }
            );

            const sessions = await response.json();
            const userSession = sessions.find(session => session.UserId === userId);
            
            if (!userSession) {
                console.debug("No active session found for user");
                clearOverlay();
                preloadedItemDetails = null;
                return;
            }
            
            const nowPlayingItem = userSession.NowPlayingItem;
            const isPaused = userSession.PlayState?.IsPaused;
            
            if (nowPlayingItem) {
                // Preload details if this is a new item
                if (!preloadedItemDetails || preloadedItemDetails.Id !== nowPlayingItem.Id) {
                    fetchItemDetails(nowPlayingItem.Id).catch(e => {
                        console.error("Error preloading item:", e.message);
                    });
                }
                
                // Show/hide overlay based on pause state
                if (isPaused) {
                    showOverlay();
                } else {
                    clearOverlay();
                }
            } else {
                console.debug("No currently playing item");
                clearOverlay();
                preloadedItemDetails = null;
            }
        } catch (error) {
            console.error("Playback status check failed:", error.message);
            // Don't clear overlay on temporary errors
        }
    }

    function startPlaybackMonitoring() {
        stopPlaybackMonitoring();
        pollingInterval = setInterval(checkPlaybackStatus, POLL_INTERVAL);
        checkPlaybackStatus(); // Immediate first check
    }

    function stopPlaybackMonitoring() {
        if (pollingInterval) {
            clearInterval(pollingInterval);
            pollingInterval = null;
        }
        clearOverlay();
        abortActiveRequests();
    }

    function monitorURLChange() {
        let lastURL = window.location.href;
        const checkURL = () => {
            if (window.location.href !== lastURL) {
                lastURL = window.location.href;
                if (window.location.href.includes("/web/index.html#/video")) {
                    startPlaybackMonitoring();
                } else {
                    stopPlaybackMonitoring();
                }
            }
        };
        setInterval(checkURL, 500);
    }

    function handleOverlayClick(event) {
        if (event.target === overlay || event.target.closest('#jellyfin-pause-overlay')) {
            const videoPlayer = document.querySelector('video');
            if (videoPlayer?.paused) {
                videoPlayer.play().catch(e => {
                    console.error("Failed to resume playback:", e);
                });
            }
            clearOverlay();
        }
    }

    // ======================
    // EVENT LISTENERS
    // ======================

    overlay.addEventListener("click", handleOverlayClick);

    // Start monitoring if on video page
    if (window.location.href.includes("/web/index.html#/video")) {
        startPlaybackMonitoring();
    }
    
    monitorURLChange();

    // Cleanup on script reload
    window.addEventListener('beforeunload', () => {
        stopPlaybackMonitoring();
    });

    console.log("Jellyfin Pause Screen initialized successfully");
})();
