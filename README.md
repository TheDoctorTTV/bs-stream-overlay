# BS Stream Overlay

BS Stream Overlay is an open-source, customizable Beat Saber browser overlay powered by [DataPuller](https://github.com/ReadieFur/BSDataPuller). It can display live song and performance information, including cover art, song title, difficulty, BPM, NJS, score, combo, rank, accuracy, misses, and health.

## Requirements

- DataPuller installed in Beat Saber
- Streaming software that supports browser sources, such as OBS Studio, Streamlabs Desktop, Meld Studio, or similar software

## Font selection compatibility

Selecting from locally installed system fonts requires a Chromium-based browser, such as Google Chrome, Microsoft Edge, Brave, or Opera/OperaGX.

## Create your overlay

1. Install [DataPuller](https://github.com/ReadieFur/BSDataPuller) in Beat Saber.
2. Start Beat Saber and make sure DataPuller is running.
3. Open [bs-overlay.thetimevortex.net](https://bs-overlay.thetimevortex.net).
4. Use the settings panel to choose the overlay position and the information you want to display.
5. Select **Copy overlay URL** at the top of the page.
6. Add a browser source in OBS, Streamlabs, Meld, or another supported streaming application.
7. Paste the copied URL into the browser source.

Your selected settings are stored in the generated URL, so the browser source will use the same layout and visible fields. To edit an existing overlay, select **Load settings** on the settings page and paste its URL.
