(function() {
    let currentVideo = null;
    let currentItemId = null;
    let userId = null;
    let token = null;
    let lastItemIdCheck = 0;
    let cleanupListeners = null;

    // Create overlay with all styling
    const overlay = document.createElement("div");
    overlay.id = "video-overlay";
    overlay.style.cssText = `
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
    overlayContent.style.cssText = "display: flex; align-items: center; justify-content: center; text-align: center;";

    const overlayLogo = document.createElement("img");
    overlayLogo.id = "overlay-logo";
    overlayLogo.style.cssText = "width: 50vw; height: auto; margin-right: 50vw; display: none;";

    const overlayPlot = document.createElement("div");
    overlayPlot.id = "overlay-plot";
    overlayPlot.style.cssText = "top: 38vh; max-width: 40%; height: 50vh; display: block; right: 5vw; position: absolute;";

    overlayContent.appendChild(overlayLogo);
    overlayContent.appendChild(overlayPlot);
    overlay.appendChild(overlayContent);

    const overlayDisc = document.createElement("img");
    overlayDisc.id = "overlay-disc";
    overlayDisc.style.cssText = `
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

    // Click handler for overlay
    overlay.addEventListener('click', function(event) {
        if (event.target === overlay) {
            overlay.style.display = "none";
            if (currentVideo && currentVideo.paused) {
                currentVideo.play();
            }
        }
    });

    const getCredentials = () => {
        const creds = localStorage.getItem("jellyfin_credentials");
        if (!creds) return null;
        try {
            const parsed = JSON.parse(creds);
            const server = parsed.Servers[0];
            return { token: server.AccessToken, userId: server.UserId };
        } catch {
            return null;
        }
    };

    const clearDisplayData = () => {
        overlayPlot.textContent = "";
        overlayLogo.src = "";
        overlayLogo.style.display = "none";
        overlayDisc.src = "";
        overlayDisc.style.display = "none";
    };

    const fetchItemInfo = async (itemId) => {
        clearDisplayData(); // Clear old data before fetching new
        
        try {
            const domain = window.location.origin;
            
            // First fetch basic item info
            const itemResp = await fetch(`${domain}/Items/${itemId}`, {
                headers: { "X-Emby-Token": token }
            });
            const item = await itemResp.json();

            overlayPlot.textContent = item.Overview || "No description available";
            
            // Try to get logo image
            if (item.ImageTags && item.ImageTags.Logo) {
                overlayLogo.src = `${domain}/Items/${itemId}/Images/Logo?tag=${item.ImageTags.Logo}`;
                overlayLogo.style.display = "block";
            } else {
                // Also try parent items for logo if current item doesn't have one
                const logoUrls = [
                    item.ParentId ? `${domain}/Items/${item.ParentId}/Images/Logo` : null,
                    item.SeriesId ? `${domain}/Items/${item.SeriesId}/Images/Logo` : null
                ].filter(Boolean);

                for (const url of logoUrls) {
                    try {
                        const img = new Image();
                        img.src = url;
                        await new Promise((resolve, reject) => {
                            img.onload = resolve;
                            img.onerror = reject;
                            setTimeout(() => reject(), 1000);
                        });
                        overlayLogo.src = url;
                        overlayLogo.style.display = "block";
                        break;
                    } catch {
                        continue;
                    }
                }
            }

            // Try disc image sources in order
            const tryDiscImage = async (url) => {
                try {
                    const img = new Image();
                    img.src = url;
                    await new Promise((resolve, reject) => {
                        img.onload = resolve;
                        img.onerror = reject;
                        setTimeout(() => reject(), 1000);
                    });
                    return url;
                } catch {
                    return null;
                }
            };

            const discUrls = [
                `${domain}/Items/${itemId}/Images/Disc`,
                item.ParentId ? `${domain}/Items/${item.ParentId}/Images/Disc` : null,
                item.SeriesId ? `${domain}/Items/${item.SeriesId}/Images/Disc` : null
            ].filter(Boolean);

            for (const url of discUrls) {
                const validUrl = await tryDiscImage(url);
                if (validUrl) {
                    overlayDisc.src = validUrl;
                    overlayDisc.style.display = "block";
                    break;
                }
            }

        } catch (e) {
            console.error("Error fetching item info:", e);
            overlayPlot.textContent = "Unable to fetch item info.";
            overlayLogo.style.display = "none";
            overlayDisc.style.display = "none";
        }
    };

    // Optimized item ID check
    const checkForItemId = (force = false) => {
        const now = Date.now();
        if (!force && now - lastItemIdCheck < 500) {
            return currentItemId;
        }
        lastItemIdCheck = now;

        const selectors = [
            '.videoOsdBottom-hidden > div:nth-child(1) > div:nth-child(4) > button:nth-child(3)',
            'div.page:nth-child(3) > div:nth-child(3) > div:nth-child(1) > div:nth-child(4) > button:nth-child(3)',
            '.btnUserRating'
        ];
        
        for (const selector of selectors) {
            const ratingButton = document.querySelector(selector);
            if (ratingButton && ratingButton.getAttribute('data-id')) {
                return ratingButton.getAttribute('data-id');
            }
        }
        
        return null;
    };

    const attachVideoListeners = (video) => {
        const handlePause = () => {
            if (video === currentVideo && !video.ended) {
                const newItemId = checkForItemId(true);
                if (newItemId && newItemId !== currentItemId) {
                    currentItemId = newItemId;
                    fetchItemInfo(newItemId);
                }
                overlay.style.display = "flex";
            }
        };

        const handlePlay = () => {
            if (video === currentVideo) {
                overlay.style.display = "none";
            }
        };

        video.addEventListener("pause", handlePause);
        video.addEventListener("play", handlePlay);

        return () => {
            video.removeEventListener("pause", handlePause);
            video.removeEventListener("play", handlePlay);
        };
    };

    const clearState = () => {
        overlay.style.display = "none";
        clearDisplayData();
        if (cleanupListeners) {
            cleanupListeners();
            cleanupListeners = null;
        }
        currentItemId = null;
        currentVideo = null;
    };

    const scanLoop = async () => {
        const video = document.querySelector(".videoPlayerContainer video");
        const itemId = checkForItemId();

        if (video && video !== currentVideo) {
            clearState();
            currentVideo = video;
            cleanupListeners = attachVideoListeners(video);
            
            const newItemId = checkForItemId(true);
            if (newItemId) {
                currentItemId = newItemId;
                await fetchItemInfo(newItemId);
            }
        }

        if (video && itemId && itemId !== currentItemId) {
            currentItemId = itemId;
            await fetchItemInfo(itemId);
        }

        if (!video && currentVideo) {
            clearState();
        }

        requestAnimationFrame(scanLoop);
    };

    // Initialize
    const creds = getCredentials();
    if (!creds) {
        console.error("Jellyfin credentials not found");
        return;
    }
    userId = creds.userId;
    token = creds.token;

    requestAnimationFrame(scanLoop);
})();
