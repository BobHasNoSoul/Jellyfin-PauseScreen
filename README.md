# Jellyfin-PauseScreen
a pause screen for jellyfin that adds the logo and the disc and the description when paused that dissapears when playback is resumed or the video is exited.

![vlcsnap-2025-03-07-18h57m35s122](https://github.com/user-attachments/assets/c449b0ed-f0c7-438b-b2a0-35703c3f8e16)
![vlcsnap-2025-03-07-18h57m11s706](https://github.com/user-attachments/assets/fb28c8a1-06e4-443d-8d6c-7036f1bfa944)
![vlcsnap-2025-03-07-18h56m56s818](https://github.com/user-attachments/assets/b73f7218-df89-409b-8970-ac2341fff2d7)
![vlcsnap-2025-03-07-18h56m38s578](https://github.com/user-attachments/assets/b487d7d9-bc27-408b-8546-61962c32cd03)
![vlcsnap-2025-03-07-18h56m23s810](https://github.com/user-attachments/assets/3edc7e02-895e-4495-9a5e-ebd8a3516d64)


oh no... i did it again, got bored did some things and now here is a project 

basically it is able to pick the items logo and the items plot and then from there also grab the items disc and put them on the screen when paused. It does however have fallbacks so lets say you dont put a disc for every item, thats fine it will go to season and then if there isnt one there it will get the series disc image, same for the logo.. the only thing i didnt do like that is the plot.. because that could go very badly.

# Requirements

since this is a addition mod this will require either a mod that adds the jellyfin credentials to local_storage (i will cover this manually further down) or if you already have the media bar plugin https://github.com/IAmParadox27/jellyfin-plugin-media-bar/tree/main 

this is tested mainly on ubuntu and windows installs.. if you run this in docker steps may be different and other systems may or may not work.. i dont own a mac so your mileage may vary.

# Installation

open the web root for your install (please check your jellyfin logs for your web folders exact location before you open a ticket asking about it)
`sudo nano index.html` and now before the `</head>` tag add this line `<script defer src="pausescreen.js"></script>`

now we need to simply copy `pausescreen.js` into your webroot and clear your cache and reload the page.

add the following to your custom css for the better styling by myself. (there is a default styling but it is trash imo.. yes i am being critical of myself). just use this custom theme for it.. makes it super nice.

### With Disc, best version

````
#overlay-disc {
  position: absolute !important;  
  top: calc(50vh - (26vw / 2)) !important;
  right: 7% !important;
  width: 26vw !important;
  height: auto !important;
  display: block !important;
  animation: 30s linear infinite spin !important;
  z-index: -1 !important;
  filter: brightness(80%) !important;
}

#overlay-plot {
  top: 61% !important;
  max-width: 54% !important;
  height: 50vh !important;
  display: block !important;
  right: 41vw !important;
  position: absolute !important;
  font-size: 21px !important;
}

#overlay-logo {
    position: absolute !important;
    max-width: 50vw !important; /* Max width is half the viewport width */
    max-height: 23vh !important; /* Limits the height */
    width: auto !important; /* Ensures no forced stretching */
    height: auto !important; /* Preserves aspect ratio */
    top: 25vh !important; /* Places it at a quarter of the viewport height */
    left: 19vw !important; /* Centers within the left half */
    transform: translateX(-50%) !important; /* Ensures true centering */
    display: block !important;
	margin-left: 12vw !important;
    object-fit: contain; /* Prevents cropping/stretching */
}
````

however some people say they DO NOT want the disc because it is "too large" or "too ugly" then you just need to add this version of the custom css

### Discless

````
#overlay-disc {
  position: absolute !important;  
  top: calc(50vh - (26vw / 2)) !important;
  right: 7% !important;
  width: 26vw !important;
  height: auto !important;
  display: none !important;
  animation: 30s linear infinite spin !important;
  z-index: -1 !important;
  filter: brightness(80%) !important;
}

#overlay-plot {
  top: 61% !important;
  max-width: 54% !important;
  height: 50vh !important;
  display: block !important;
  right: 41vw !important;
  position: absolute !important;
  font-size: 21px !important;
}

#overlay-logo {
    position: absolute !important;
    max-width: 50vw !important; /* Max width is half the viewport width */
    max-height: 23vh !important; /* Limits the height */
    width: auto !important; /* Ensures no forced stretching */
    height: auto !important; /* Preserves aspect ratio */
    top: 25vh !important; /* Places it at a quarter of the viewport height */
    left: 19vw !important; /* Centers within the left half */
    transform: translateX(-50%) !important; /* Ensures true centering */
    display: block !important;
	margin-left: 12vw !important;
    object-fit: contain; /* Prevents cropping/stretching */
}

````

# Manual injection requirement

lets say you didnt install the media bar plugin for the easiest method of injection

you then just need to do this

edit your index.html and add the following 

````
const saveJellyfinCredentials = (serverId, accessToken) => {
    const credentials = {
        Servers: [{ Id: serverId, AccessToken: accessToken }],
    };

    try {
        localStorage.setItem("jellyfin_credentials", JSON.stringify(credentials));
        console.log("Jellyfin credentials saved successfully.");
    } catch (e) {
        console.error("Error saving Jellyfin credentials", e);
    }
};
````

this is updated from sessionstorage to match the same standards that were updated with MakD and IAmParadox27 versions of the media bar allowing it to be easier to maintain and be more compatible 

enjoy

-BobHasNoSoul




upcoming new mod is extrafanart ressurection (yes with fluid injection for that nice sleek retainable mod) and avatars injection script, changename script that changes the page title whenever it sees the word Jellyfin and last but not least an attempt at a plugin with the file transformation plugin that will hopefully give users global overrides for almost all of the defaults in jellyfins usually per user settings 

