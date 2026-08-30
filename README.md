<p align="center">
  <img src="assets/icons/bs-overlay-icon.png" alt="BS Stream Overlay icon" width="180">
</p>

# BS Stream Overlay

**Launch the overlay:** [https://bs-overlay.thetimevortex.net](https://bs-overlay.thetimevortex.net)

BS Stream Overlay is an open-source, customizable Beat Saber browser overlay powered by [DataPuller](https://github.com/WentTheFox/BSDataPuller) or [Beat Saber Plus](https://github.com/hardcpp/BeatSaberPlus)'s Song Overlay module (BS+ SO). It can display live song and performance information, including cover art, song title, difficulty, BPM, NJS, BSR code, score, combo, rank, accuracy, misses, and health. An optional heart-rate readout can use [HRCounter](https://github.com/qe201020335/HRCounter), with paid Pulsoid or free HypeRate integration as a fallback, and appear with the song overlay or as a separately positioned element.

## Preview

### Song and performance details

![BS Stream Overlay showing song details, score, combo, rank, accuracy, and health](docs/images/song-overlay.png)

### Optional standalone heart rate

![BS Stream Overlay with a standalone heart-rate readout in the top-right corner](docs/images/standalone-heart-rate.png)

## Optional heart rate

Heart-rate support is completely optional and is disabled by default. Enable **Show heart rate** in the settings panel to read live BPM data from [HRCounter](https://github.com/qe201020335/HRCounter). You can display it in either of two ways:

- **With song overlay** attaches the heart icon and current heart rate to the main song and performance panel.
- **On its own** separates the heart-rate readout from the song panel and lets you place it in the top-left, top-right, bottom-left, or bottom-right corner.

The heart icon pulses at the reported rate and changes color as your heart rate rises:

- **120 BPM or lower:** green (`#58e88a`)
- **121–149 BPM:** gradually changes from green to yellow
- **150 BPM:** yellow (`#ffd34d`)
- **151–179 BPM:** gradually changes from yellow to red
- **180 BPM or higher:** red (`#ff4860`)

To use this feature, install HRCounter, enable its HTTP server, and enter its port in the overlay settings. You can also select **Pulsoid** or **HypeRate** as a fallback.

**Pulsoid** It uses one-click account authorization with the `data:heart_rate:read` scope, and the Pulsoid account connecting to the overlay must have BRO plan. Select **Pulsoid**, choose **Connect Pulsoid**, approve BS Overlay, and you will return to the settings page automatically.

**HypeRate** It only requires the ID that you device will show.

## Requirements

- DataPuller or BS+ SO installed and enabled in Beat Saber
- HRCounter installed and its HTTP server enabled (optional, for heart rate)
- A Pulsoid BRO plan account or public HypeRate ID for the optional heart-rate fallback
- Streaming software that supports browser sources, such as OBS Studio, Streamlabs Desktop, Meld Studio, or similar software

## Font selection compatibility

Chromium-based browsers, such as Google Chrome, Microsoft Edge, Brave, or Opera/OperaGX, can request access to locally installed system fonts and show them in the font picker. Browsers without local font-list access, including Firefox, show a curated selection of free Google Fonts instead; you can also enter the exact family name of an installed font and press Enter to use it.

## Create your overlay

1. Install [DataPuller](https://github.com/WentTheFox/BSDataPuller) or [Beat Saber Plus](https://github.com/hardcpp/BeatSaberPlus) in Beat Saber. If using BS+, enable its Song Overlay module.
2. Start Beat Saber and make sure your selected data provider is running.
3. Open [bs-overlay.thetimevortex.net](https://bs-overlay.thetimevortex.net).
4. The overlay automatically uses the available provider. If both are detected, choose **DataPuller** or **BS+ SO** in the connection card, then configure the overlay position and information you want to display. Enabling only one provider is recommended for best performance.
5. Optional: enable **Show heart rate**, choose **With song overlay** or **On its own**, configure HRCounter's port, and select either paid Pulsoid or free HypeRate as a cloud fallback if you want heart rate to continue in menus.
6. Select **Copy overlay URL** at the top of the page.
7. Add a browser source in OBS, Streamlabs, Meld, or another supported streaming application.
8. Paste the copied URL into the browser source.

Your selected settings are stored in the generated URL, so the browser source will use the same layout, scale, one-color or two-color accent, corner shadow, and visible fields. Two-color accents render as a horizontal gradient from color 1 on the left to color 2 on the right. To edit an existing overlay, select **Load settings** on the settings page and paste its URL.

DataPuller exposes some fields that BS+ SO does not, including NJS and (depending on the map) a BSR key. Unavailable values are shown as a dash or hidden when using BS+.
