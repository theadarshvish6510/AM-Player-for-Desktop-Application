# 🎬 Adarsh's Media Player (AM Player) v2.1.1
> **Industrial-grade, high-performance multimedia workstation built with Native LibVLC, Rust Accelerated Core, Direct3D11/DXVA2 hardware decoding, 16D Cinematic Spatial Audio DSP, Split-View Lecture Workstation with KaTeX Math Subtitles, Universal Smart Thumbnail Generation, and Google Material 3 Expressive design.**

[![Version](https://img.shields.io/badge/version-2.1.1-blue.svg)](package.json)
[![Release](https://img.shields.io/badge/Release-Windows_.exe-00FF66.svg?logo=windows)](https://github.com/theadarshvish6510/am-player/releases)
[![GitHub Stars](https://img.shields.io/github/stars/theadarshvish6510/am-player?style=social)](https://github.com/theadarshvish6510/am-player)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Electron](https://img.shields.io/badge/Electron-33.2.1-47848F.svg?logo=electron)](https://www.electronjs.org/)
[![Material Design](https://img.shields.io/badge/Material_Design-M3_Expressive-6750A4.svg)](https://m3.material.io/)
[![Audio Engine](https://img.shields.io/badge/Audio_Engine-16D_Spatial_DSP-orange.svg)](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API)
[![Storage](https://img.shields.io/badge/Storage-IndexedDB_Persistent-00C853.svg)](idb-storage.js)

---

### ⭐ Show Some Love & Star the Repo!
If you find **Adarsh's Media Player (AM Player)** helpful, fun, or useful for your daily music, movie, or lecture sessions:
* Please give this repository a **⭐ Star on GitHub**! It motivates us to keep building and shipping exciting new features.
* **Fork** the repo to customize it or contribute back with Pull Requests.
* Share it with your friends, classmates, and fellow developers! 💖

---

## 💾 Download Windows Software (.exe) & Standalone Releases

Aap AM Player ko direct apne Windows PC par normal software ki tarah download aur install kar sakte hain:

| Package Type | File Name | Description | Direct Download |
| :--- | :--- | :--- | :--- |
| **Windows Installer (Setup)** | `AM-Player-Setup-2.1.1.exe` | Standard NSIS installer with desktop shortcut, Start Menu entry, protocol handler & uninstaller. | [📥 Download Setup .exe](https://github.com/theadarshvish6510/am-player/releases/latest) |
| **Portable Version** | `AM-Player-Portable-2.1.1.exe` | Zero installation required. Ek single standalone `.exe` jisko aap USB drive ya kisi bhi folder se direct run kar sakte hain. | [📦 Download Portable .exe](https://github.com/theadarshvish6510/am-player/releases/latest) |
| **Web / PWA Application** | Online Web App | Chrome / Edge me khol kar address bar se **1-Click Install** karein bina kisi download ke. | [🌐 Open Live App](https://github.com/theadarshvish6510/am-player) |

### 🚀 Windows PC par Install karne ka Tareeqa:
1. **GitHub Releases** page se `AM-Player-Setup-2.1.1.exe` download karein.
2. File par double-click karein. (Agar Windows SmartScreen alert aaye to *"More info"* -> *"Run anyway"* par click karein).
3. Installation automatically complete ho jayegi aur aapke Desktop aur Start Menu par **AM Player** ka brand icon (`am-icon.ico`) create ho jayega.
4. App open karein aur seamless 4K/120FPS playback enjoy karein!

---

## 📑 Table of Contents
1. [🌟 Overview & Core Philosophy](#-overview--core-philosophy)
2. [💾 Download Windows Executables (.exe)](#-download-windows-software-exe--standalone-releases)
3. [⭐ Show Love & Star the Repo](#-show-some-love--star-the-repo)
4. [🚀 High-Throughput Engine & Streaming Pipeline](#-high-throughput-engine--streaming-pipeline)
   - [Zero-Copy Local HTTP 206 Streaming](#zero-copy-local-http-206-streaming)
   - [Direct3D11, DXVA2 & Rust Acceleration](#direct3d11-dxva2--rust-acceleration)
   - [Zero-Lag Smart Buffering HUD (`am-loading-video.webm`)](#zero-lag-smart-buffering-hud)
   - [Instant App Launch Splash Screen](#instant-app-launch-splash-screen)
5. [📁 Folder Browser & Media History Workflow](#-folder-browser--media-history-workflow)
   - [Folder Toggle & Video-Only Filtering](#folder-toggle--video-only-filtering)
   - [One-Tap Fold Back to Media History](#one-tap-fold-back-to-media-history)
   - [Unified History Tracking & Resume Playback](#unified-history-tracking--resume-playback)
6. [🖼️ Universal Smart Thumbnail Generation Engine](#-universal-smart-thumbnail-generation-engine)
   - [3 Strategy Selector (First Frame @ 1.0s, Percentage, Hybrid)](#3-strategy-selector)
   - [Universal Thumbnail Pipeline (Folders, Recents, Music, Video)](#universal-thumbnail-pipeline)
   - [High-Performance IndexedDB Caching](#high-performance-indexeddb-caching)
7. [🎨 Google Material Design 3 (M3) Expressive UI](#-google-material-design-3-m3-expressive-ui)
   - [Dynamic Material You Theme Palette](#dynamic-material-you-theme-palette)
   - [Dual Workstation Views (Default vs. Material Workstation)](#dual-workstation-views)
   - [Verified Production Assets Suite (`am-icon.ico`, `am-icon.png`)](#verified-production-assets-suite)
8. [🎧 16D Cinematic Spatial Audio & Acoustic DSP Engine](#-16d-cinematic-spatial-audio--acoustic-dsp-engine)
   - [16D Dynamic Orbit & HRTF Ear-Flip Rotation](#16d-dynamic-orbit--hrtf-ear-flip-rotation)
   - [Acoustic Tail & DearVR Reverb Reflections](#acoustic-tail--dearvr-reverb-reflections)
   - [10-Band Graphic Equalizer & Acoustic Presets](#10-band-graphic-equalizer--acoustic-presets)
   - [200% Volume Booster & Limiter Compressor](#200-volume-booster--limiter-compressor)
   - [Auto Loudness Normalization & Audio Focus](#auto-loudness-normalization--audio-focus)
9. [🖥️ Specialized Multimedia Workstations](#️-specialized-multimedia-workstations)
   - [🎓 1. Lecture Mode (Split-View PDF + KaTeX Math + Silence Skipping)](#1--lecture-mode)
   - [🍿 2. Theater Mode (Ambilight Canvas + Image Enhancer)](#2--theater-mode)
   - [🎵 3. Music Mode (Vinyl Visualizers + Background Tray Playback)](#3--music-mode)
   - [📂 4. Playlist & Media Explorer Mode](#4--playlist--media-explorer-mode)
   - [🎬 5. Playback Completion & Post-Watch Dialog](#5--playback-completion--post-watch-dialog)
10. [📝 Advanced Subtitle & KaTeX Math Rendering Engine](#-advanced-subtitle--katex-math-rendering-engine)
11. [⚡ Touch, Mouse & Gesture Controls](#-touch-mouse--gesture-controls)
12. [🛡️ Privacy, Auto-Purge TTL & Storage Management](#️-privacy-auto-purge-ttl--storage-management)
13. [⌨️ Complete Keyboard Shortcuts Cheat Sheet](#️-complete-keyboard-shortcuts-cheat-sheet)
14. [📦 Supported Formats & Codecs](#-supported-formats--codecs)
15. [🛠️ Installation, Development & Building from Source](#️-installation-development--building-from-source)
16. [📋 Changelog & Release Notes](#-changelog--release-notes)
17. [📄 License & Author](#-license--author)

---

## 🌟 Overview & Core Philosophy

**AM Player (Adarsh's Media Player)** ek industrial-grade, privacy-first multimedia workstation hai jise heavy 4K/8K HDR, 10-bit HEVC/H.265 videos, continuous educational lectures, lossless hi-res music, aur massive media libraries ko bina kisi buffer lag, memory spike ya frame drop ke chalane ke liye engineer kiya gaya hai.

Traditional Chromium ya standard web players 10GB–50GB+ files ko memory (RAM) mein dump karne ki koshish karte hain, jisse browser tab crash ya freezing hoti hai. **AM Player** is limitation ko **Local Zero-Copy HTTP 206 Streaming Engine**, **Direct3D11 GPU Decoding**, aur **IndexedDB Persistent Storage** ke through completely eliminate karta hai.

---

## 🚀 High-Throughput Engine & Streaming Pipeline

### Zero-Copy Local HTTP 206 Streaming
* **Internal Streaming Microservice:** Electron backend ek lightweight HTTP daemon run karta hai jo disk par stored massive video files ko instant streamable URLs (`http://127.0.0.1:PORT/stream?path=...`) mein expose karta hai.
* **HTTP 206 Partial Content (Range Requests):** Poori file RAM mein load karne ke bajaye sirf active viewport aur agle 4MB–8MB video buffer ko fetch karta hai.
* **Instant 50GB+ Playback:** 50GB se badi raw 4K BluRay file bhi click karte hi 0.1 second ke andar play hoti hai.

### Direct3D11, DXVA2 & Rust Acceleration
* **VLC & Rust Core Engine v2.1.0:** Hardware-accelerated zero-copy frame pointer processing with an ultra-lean memory footprint (< 35 MB RAM), calibrated for 120 FPS / 4K Ultra HD compositing.
* Chromium hardware acceleration flags (`--enable-accelerated-video-decode`, `--enable-zero-copy`, `--enable-features=DirectCompositionVideoOverlays`) ke sath configured.
* Decoding workload ko CPU se utha kar dedicated GPU video memory (VRAM) par transfer karta hai, jisse CPU usage 80% tak kam hoti hai aur laptops thande aur silent rehte hain.
* True 10-bit color depth aur 60fps/120fps high refresh rate displays ke liye calibrated.

### Zero-Latency Keyframe Scrubbing
* `HTMLVideoElement.fastSeek()` ke sath synchronized timeline scrubber jo direct nearest video keyframe par latch karta hai, allowing smooth scrubbing bina spinning loaders ke.

### Zero-Lag Smart Buffering HUD (`am-loading-video.webm`)
* Traditional generic CSS spinners ke bajaye AM Player high-efficiency circular-masked WebM animation (`am-loading-video.webm`) use karta hai jo stream stalls, network hiccups ya keyframe sync ke dauran instant visual feedback deta hai.
* Anti-Stall Nudge Watchdog 1.2 seconds me decoder buffer ko awaken karta hai taaki stream kabhi freeze na ho.
* Settings panel ke "About" tab me **"Test Loading Animation"** button ke zariye aap live animation ko anytime preview kar sakte hain.

### Instant App Launch Splash Screen
* Application open hote hi modern cinematic launch splash screen initialize hota hai, jisme circular glowing border ke andar `am-loading-video.webm` looping animation, brand icon (`am-icon.png`), aur version badge (`v2.1.1`) display hota hai aur DOM ready hote hi 400ms me smooth fade-out ho jata hai.

---

## 📁 Folder Browser & Media History Workflow

AM Player ka folder explorer aur media history system intuitive navigation ke liye optimize kiya gaya hai:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ 📂 Added Folders:  [ 📁 Movies ]  [ 📁 Lectures (ACTIVE) ]  [ 📁 Music ]    │
├─────────────────────────────────────────────────────────────────────────────┤
│ 🎥 Lectures (5 Videos)                 [Click Active Folder Again to Fold]  │
│ ┌───────────────┐ ┌───────────────┐ ┌───────────────┐ ┌───────────────────┐ │
│ │  Video 1.mp4  │ │  Video 2.mp4  │ │  Video 3.mp4  │ │   Video 4.mp4     │ │
│ │ [Thumb @ 1.0s]│ │ [Thumb @ 1.0s]│ │ [Thumb @ 1.0s]│ │  [Thumb @ 1.0s]   │ │
│ └───────────────┘ └───────────────┘ └───────────────┘ └───────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
                               ▲
                 (Tap active chip again to Fold)
                               ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 🕒 Media History & Library (All Recently Played Songs & Videos Restored)    │
│ ┌───────────────┐ ┌───────────────┐ ┌───────────────┐ ┌───────────────────┐ │
│ │ Lecture 1.mp4 │ │ Song Track.mp3│ │ 4K Trailer.mkv│ │ Math Class.mp4    │ │
│ └───────────────┘ └───────────────┘ └───────────────┘ └───────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Folder Toggle & Video-Only Filtering
* **Tap to Expand:** Jab aap kisi bhi custom folder chip par click karte hain, to AM Player folder ko scan karta hai aur us folder ke andar ke **sirf video files** (`.mp4`, `.mkv`, `.webm`, `.avi`, `.mov`, `.flv`, `.ts`, `.wmv`) ko explorer grid mein render karta hai.
* Audio files ya non-video elements custom folder view se automatically filter out ho jate hain taaki folder clean aur focused rahe.

### One-Tap Fold Back to Media History
* **Click to Fold:** Agar aap usi active folder chip par dobara click karte hain, to folder instantly **fold (collapse)** ho jata hai.
* Active selection clear ho jata hai aur screen par automatically **Media History & Recent Library** wapas display hone lagti hai.
* Agar kisi folder ke andar koi video file na mile, to clear guidance card display hota hai: *"No video files found in this folder. Tap the folder chip above to fold it back to Media History."*

### Unified History Tracking & Resume Playback
* Har played song ya video (local files, folder scans, ya network streams) automatically persistent history mein save hota hai.
* Last played position, duration, audio/video type, aur thumbnail automatically IndexedDB (`am-player-db` -> `recent_history`) mein sync hote hain.
* File par click karte hi instant playback resume ho jata hai jahan se aapne choda tha.

---

## 🖼️ Universal Smart Thumbnail Generation Engine

AM Player har media type ke liye consistent aur fast thumbnail rendering provide karta hai.

### 3 Strategy Selector
Settings panel (`Settings -> Media Explorer & Engine Settings -> Thumbnail Strategy`) se user apni pasand ki thumbnail extraction strategy select kar sakte hain:

1. **⏱️ First Frame (1.0s Accurate Capture):**
   - Video ke shuruat ke blank/black intro screen ko avoid karne ke liye exact **1.0 second** mark par frame seek karke crisp snapshot render karta hai.
   - User requirement ke mutabiq 0s se 1s calibrated hai taaki har video ka first clear visual frame capture ho.
2. **📊 Duration Percentage (33% Keyframe):**
   - Video duration ka ek-tihaai (33%) hissa calculate karta hai aur movie ya lecture ke mid-point se iconic keyframe capture karta hai.
3. **⚡ Hybrid Smart Scan (Default):**
   - Pehle 1.0 second par frame capture karta hai.
   - Canvas pixel luminance analyzer automatically run hota hai. Agar frame 90%+ pure black ho (intro fade-in), to automatically 33% timestamp par seek karke clean frame nikalta hai.

### Universal Thumbnail Pipeline
* **Sabhi Media ke Liye Ek Samaan:**
  - Chahe media **History** se aaye, **Custom Folder** se load ho, koi **Song** baje ya **Video** play ho:
  - **Thumbnail pehle se ho to turant dikhe:** Agar file ya database mein thumbnail pehle se cached hai, to zero latency ke sath instant render hoti hai.
  - **Thumbnail na ho to generate hoke dikhe:** Agar missing ho, to background video/audio canvas pipeline selected strategy ke according turant generate karke UI aur database dono mein persist karta hai.
* **Audio Track Cover Generation:**
  - Embedded ID3 album art ko native byte tags se extract karta hai.
  - Agar audio mein picture tag na ho, to clean procedural vinyl record artwork procedural color gradient ke sath auto-generate karta hai.

### High-Performance IndexedDB Caching
* Har extracted thumbnail base64 data URL ke roop mein `idb-storage.js` ke `thumbnails` aur `media_files` object store mein save hota hai.
* App restart ya folder re-open karne par expensive canvas seeking dobara nahi karni padti; memory aur battery consumption minimal rehti hai.

---

## 🎨 Google Material Design 3 (M3) Expressive UI

AM Player Google ke latest **Material Design 3 (Material You)** design guidelines ko follow karta hai:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ 🎬 AM PLAYER v2.1 - Material 3 Expressive Workstation                       │
├───────────────────────────────┬─────────────────────────────────────────────┤
│ 🔍 Quick Search Bar           │ 📌 Quick Links & Bookmarks (Add Shortcut)   │
│ 📁 Choose Media Mode:         ├─────────────────────────────────────────────┤
│   [🎵 Music]   [📚 Lecture]   │ 📂 5-Folder Directory Watcher & Explorer:   │
│   [🎬 Theater] [📂 Playlist]  │   [Study] [Movies] [Anime] [Music] [Recents]│
│ 🔗 Network Stream URL Input   │   ▶ Live Thumbnails • Progress Bar • Badges │
└───────────────────────────────┴─────────────────────────────────────────────┘
```

### Dynamic Material You Theme Palette
* **Automatic Dominant Color Extraction:** Video frame ya music cover art se real-time dominant color tones extract hote hain.
* Primary accents, surface elevation, control slider buttons, aur ambient background dynamically match hote hain.
* **Dark OLED, Light Daylight, aur High Contrast** modes ka full support.

### Dual Workstation Views
* **1. Default Clean View:** Distraction-free, centered cinema viewport. Minimalist media playback ke liye best.
* **2. Material Workstation View:** Multi-column productivity layout. Left side mein search aur mode selector chips, right side mein persistent folder chips, quick links, aur media explorer grid.

### Verified Production Assets Suite
* **Full Multi-Resolution Icon Suite:** Standard `am-icon.ico` (16x16, 32x32, 48x48, 256x256), `am-icon.png` (512x512 Master), `am-icon-192.png`, `am-icon-512.png`, aur `am-icon-180.png` (Apple Touch Icon).
* **Settings -> About Interactive Test:** Settings ke About tab me verified production assets card included hai, jahan se user directly WebM circular animation aur icon specifications live test kar sakta hai.

---

## 🎧 16D Cinematic Spatial Audio & Acoustic DSP Engine

AM Player standard 2-channel stereo ko binaural 3D acoustic field mein transform karta hai:

```
                     [ Pinna Elevation Filter ]
                                 │
 [ Audio Source ] ──► [ 16D HRTF Panner ] ──► [ DearVR Reverb Tail ] ──► [ Headphone Output ]
                                 │
                     [ Orbit Distance Engine ]
                     (0.8m ◄──────────► 4.2m)
```

### 16D Dynamic Orbit & HRTF Ear-Flip Rotation
* **HRTF (Head-Related Transfer Function):** Human ear pinna acoustic resonance ko simulate karta hai, allowing realistic left-to-right, front-to-back, aur up-and-down 3D sound positioning.
* **Sinusoidal Distance Orbit:** Sound source listener ke paas (0.8m) se door (4.2m) ek smooth 3.2s elliptical cycle mein move karta hai bina vertigo ya motion sickness ke.

### Acoustic Tail & DearVR Reverb Reflections
* Convolver acoustic impulse responses real-world spaces (Studio, Hall, Cinema Hall, Cathedral) ko simulate karte hain.

### 10-Band Graphic Equalizer & Acoustic Presets
* 10 dedicated linear-phase biquad filters:
  `32Hz`, `64Hz`, `125Hz`, `250Hz`, `500Hz`, `1kHz`, `2kHz`, `4kHz`, `8kHz`, `16kHz`.
* **Instant Presets:** Bass Boost (Subwoofer punch), Vocal Boost (Clear lecture dialogues), Rock, Pop, Jazz, Electronic, Classical, Flat.

### 200% Volume Booster & Limiter Compressor
* Dheemi recordings aur quiet lectures ke liye 100% se lekar 200% tak hardware volume booster.
* Peak audio par soft-knee limiter compressor digital distortion aur speaker damage ko rokta hai.

### Auto Loudness Normalization & Audio Focus
* **EBU R128 Loudness:** Sudden action scene volume bursts aur whisper scenes ke beech sound balance maintain karta hai.
* **Audio Focus Protection:** Headphone jack unplug hone par ya Bluetooth disconnect hote hi media instantly pause ho jata hai.

---

## 🖥️ Specialized Multimedia Workstations

### 🎓 1. Lecture Mode
Online study, competitive exams, aur long college lectures ke liye built:
* **Split-View Screen:** Ek taraf video lecture chalta hai aur parallel side panel mein PDF textbook/slides open hoti hain.
* **Continuous PDF Scroll Viewport:** Mouse wheel se seamless continuous reading bina page load flickers ke.
* **PDF Themes:** Normal White, Sepia (Eye comfort for night study), Dark Mode, High Contrast.
* **Synchronized Timestamped Notes:** Lecture sunte waqt `Ctrl+N` dabakar notes likhein. Notes mein click karte hi video usi timestamp par rewind ho jati hai.
* **Export Notes:** Apne study notes ko `.md` (Markdown) ya `.txt` format mein ek click mein save karein.
* **Auto-Skip Silence:** Teacher ke pauses aur blank silence ko 2.5x speed par fast-forward karta hai bina pitch distortion ke.

---

### 🍿 2. Theater Mode
Movie enthusiasts ke liye immersive cinema experience:
* **Dynamic Ambilight Canvas:** Screen borders ke colors real-time video edges se sample hokar living room LED projection jaisa soft glow create karte hain.
* **Image Enhancer & Unsharp Masking:** 720p aur 1080p videos ko 4K displays par sharp aur detailed dikhane ke liye real-time shader filter.
* **Aspect Ratio Modes:** 16:9, 4:3, 21:9 Cinematic Ultrawide, Stretch to Fit, Center Crop.

---

### 🎵 3. Music Mode
Hi-Fi audio listening aur library organization:
* **ID3 Album Art & Lyrics Extraction:** MP3/FLAC metadata se artist, album, aur cover images auto-load.
* **Procedural Vinyl Record Animation:** Agar cover art na ho, to dynamic rotating vinyl record with color grading.
* **Multi-Style Realtime Visualizers:**
  * 🌈 **Rainbow Wave:** Smooth continuous audio frequencies.
  * ⚡ **Neon Pillars:** Fast-reacting frequency bars.
  * 🌌 **Aurora Borealis:** Bass-reactive fluid color mist.
* **System Tray Background Playback:** Main window minimize ya close karne par bhi background music continuous chalta rehta hai.

---

### 📂 4. Playlist & Media Explorer Mode
* **Natural Alphanumeric Sorting:** Files ko logical order mein sort karta hai (`Lecture 1.mp4`, `Lecture 2.mp4` ... `Lecture 10.mp4`).
* **Next / Previous Episode Auto-Latch:** Current playing file ke folder se agle episode ka automatic detection.
* **Grid Mode vs. Compact List Mode:** Visual large posters ya compact file table view.

---

### 🎬 5. Playback Completion & Post-Watch Dialog
Video ya lecture complete hone par AM Player intelligent Material 3 end screen trigger karta hai:
* **Next Episode Instant Play:** Folder ke agle video ko highlight karke one-tap continue playback provide karta hai.
* **Replay Current Video:** Ek click me start frame se dubara lecture revise karein.
* **Previous Video Card:** Agar peeche ka episode dekhna ho to direct backward navigation card.
* **Complete & Delete File Option:** Finished video file ko direct confirmation prompt ke sath disk se unlink karne ka option (storage conscious users ke liye).

---

## 📝 Advanced Subtitle & KaTeX Math Rendering Engine

* **Universal Subtitle Support:** `.srt`, `.vtt`, `.ass`, aur `.ssa` subtitles ko drag-and-drop ya upload karein.
* **Auto-Detect Subtitles:** Video file ke folder mein agar matching name ki `.srt` ya `.vtt` file ho, to automatic load aur sync hoti hai.
* **KaTeX Scientific Math Subtitles:** Physics aur Math lectures ke subtitles mein LaTeX expressions (e.g. `$E = mc^2$` ya `$$\int_{a}^{b} f(x)dx$$`) textbook-quality math typography mein render hote hain.
* **Custom Styling:** Subtitle Font Size (14px – 48px), Color, Background Opacity, Outline/Shadow, aur Vertical Position.
* **Audio & Subtitle Offset Sync:** ±5.0 seconds tak millisecond precision ke sath subtitle delay adjust karein.

---

## ⚡ Touch, Mouse & Gesture Controls

| Gesture / Action | Action Description | Visual Feedback |
| :--- | :--- | :--- |
| **Double Click / Tap Left** | 10s Rewind | Left side ripple wave with `-10s` badge |
| **Double Click / Tap Right** | 10s Fast-Forward | Right side ripple wave with `+10s` badge |
| **Hold Left Click / Long Press** | 2.0x Instant Turbo Playback | Top center pill displaying `2.0x Speed` |
| **Vertical Swipe Left Half** | Display Brightness (0% – 200%) | Left floating vertical brightness slider |
| **Vertical Swipe Right Half** | Volume Level (0% – 200%) | Right floating vertical volume slider |
| **Horizontal Drag / Swipe** | Precise timeline frame scrubbing | Time position badge (`00:15:32 / 01:45:00`) |
| **Pinch-to-Zoom (Touch/Trackpad)**| Video viewport scaling up to 400% | Smooth pan & scale viewport matrix |
| **Scroll Wheel over Video** | Fast volume increase / decrease | Step volume HUD |

---

## 🛡️ Privacy, Auto-Purge TTL & Storage Management

* **6-Hour Auto-Purge TTL Engine:** Watched history, temporal video blobs, generated canvas thumbnails, aur PDF temporary buffers 6 ghante baad automatically background mein expire/clean ho jate hain.
* **Permanent Disk File Deletion:** Video complete hone par dialog prompt se file ko direct recycle bin/trash ya permanent disk unlink karne ka option milta hai.
* **Custom Cache Directory:** App Settings mein jakar application cache folder ko kisi bhi hard drive/SSD partition par switch kar sakte hain.
* **One-Click Storage Purge:** Settings panel se ek click mein poora cache calculate karke instant free-up karne ka switch.

---

## ⌨️ Complete Keyboard Shortcuts Cheat Sheet

| Key | Function |
| :--- | :--- |
| `Space` or `k` | Play / Pause video or audio |
| `Left Arrow` or `j` | Skip backward (Configurable: 5s, 10s, 15s, 30s) |
| `Right Arrow` or `l` | Skip forward (Configurable: 5s, 10s, 15s, 30s) |
| `Up Arrow` | Increase Volume by 5% |
| `Down Arrow` | Decrease Volume by 5% |
| `m` | Mute / Unmute Audio |
| `f` | Toggle Fullscreen Mode |
| `[` | Decrease Playback Speed by 0.25x |
| `]` | Increase Playback Speed by 0.25x |
| `\` | Reset Playback Speed to 1.0x Normal |
| `,` (Comma) | Step 1 frame backward (Frame-by-frame analysis) |
| `.` (Period) | Step 1 frame forward (Frame-by-frame analysis) |
| `p` | Toggle Picture-in-Picture (PiP) Window |
| `s` | Take instant high-resolution frame screenshot (.png) |
| `c` | Toggle Subtitles On / Off |
| `a` | Toggle 16D Spatial Audio Orbit mode |
| `e` | Open Equalizer & DSP Panel |
| `Ctrl + n` | Open Split-View Lecture Notes Editor |
| `Esc` | Exit Fullscreen / Close active dialog modals |

---

## 📦 Supported Formats & Codecs

### Video Formats
* **Containers:** `.mp4`, `.mkv`, `.webm`, `.avi`, `.flv`, `.mov`, `.ts`, `.m2ts`, `.wmv`, `.m4v`, `.3gp`
* **Video Codecs:** H.264 (AVC), H.265 (HEVC Main & Main 10), VP8, VP9, AV1, MPEG-4, Theora

### Audio Formats
* **Codecs & Formats:** `.mp3`, `.wav`, `.flac` (Lossless 24-bit/96kHz), `.aac`, `.m4a`, `.ogg`, `.opus`, `.wma`

### Subtitle Formats
* **File Types:** `.srt` (SubRip), `.vtt` (WebVTT), `.ass` (Advanced SubStation Alpha), `.ssa`

### Document Formats (Lecture Mode)
* **Documents:** `.pdf` (Portable Document Format with vector rendering)

---

## 🛠️ Installation, Development & Building from Source

### 🌐 Method 1: Instant PWA Install (No Build Tools Required)
AM Player is a production-certified **Progressive Web App (PWA)**:
1. Open the app URL in **Google Chrome**, **Microsoft Edge**, or **Brave**.
2. Click the **Install** icon (laptop / plus icon) in the browser's address bar.
3. Click **Install**.
4. That's it! AM Player will launch in its own native desktop window with a taskbar icon, offline capabilities, and instant startup.

---

### 💻 Method 2: Standalone Windows .exe Install (GitHub Releases)
Simply go to the **[GitHub Releases](https://github.com/theadarshvish6510/am-player/releases)** page:
* Download `AM-Player-Setup-2.1.1.exe` for the full installer.
* Or download `AM-Player-Portable-2.1.1.exe` for a single-file portable version that runs without installation.

---

### 🔨 Method 3: Build From Source & Create Your Own .exe

#### Prerequisites
* [Node.js](https://nodejs.org/) (Version 18.0 or higher)
* Git

#### 1. Clone & Install Dependencies
```bash
# Clone the repository
git clone https://github.com/theadarshvish6510/am-player.git

# Navigate into the project folder
cd am-player

# Install all dependencies
npm install
```

#### 2. Run Locally in Development
```bash
# Start Native Desktop App with Electron & Hardware Acceleration
npm start
# or:
npm run electron:start

# Run local Web / PWA Server
npm run dev
```

#### 3. Package Windows Executables (.exe)
AM Player comes with pre-configured `electron-builder` configurations:

```bash
# 1. Build standard NSIS Windows Installer (Setup .exe with desktop icon & uninstaller)
npm run dist:win

# 2. Build Portable Single-File Executable (.exe without installation)
npm run dist:portable

# (Optional) Build for macOS (.dmg) or Linux (.AppImage)
npm run dist:mac
npm run dist:linux
```
Sabhi generated `.exe` binaries **`dist/`** folder ke andar save ho jayengi.

#### 4. How to Publish the .exe to GitHub Releases:
1. Apne repo ko GitHub par push karein:
   ```bash
   git add .
   git commit -m "Release v2.1.1 Production Stable"
   git push origin main
   ```
2. GitHub repository par jayein -> Right sidebar me **Releases** -> **"Draft a new release"** par click karein.
3. Tag version dalein: `v2.1.1`.
4. `dist/` folder se `AM-Player-Setup-2.1.1.exe` aur `AM-Player-Portable-2.1.1.exe` ko **Attach binaries by dropping them here** area me drag & drop karein.
5. **Publish release** par click karein! Ab koi bhi direct aapke GitHub se `.exe` download kar sakta hai! 🚀

---

## 📋 Changelog & Release Notes

### 🚀 v2.1.1 (Current Stable Production Release)
* **Official Windows .exe Packaging:** Pre-configured electron-builder NSIS and Portable release pipelines for one-click Windows desktop installation.
* **Verified Production Assets Suite:** Full high-res icon pack (`am-icon.ico`, `am-icon.png`, `180px`, `192px`, `512px`), tested and cached across Web, PWA, and Electron.
* **Cinematic App Launch Splash Screen:** Startup animation loop powered by circular-masked `am-loading-video.webm` and brand typography with smooth 400ms DOM dismissal.
* **Zero-Lag Smart Buffering HUD:** Replaced legacy CSS spinners with native `am-loading-video.webm` looping engine and watchdog auto-nudge against stream stalls.
* **Settings "About" Developer & Asset Showcase:** Added interactive "Test Loading Animation" control and direct links to GitHub profile and repository.
* **Service Worker Invalidation (`media-app-shell-v2.1.1`):** Upgraded 3-Tier cache namespace so existing PWA and web installs receive prompt auto-refresh and instant asset synchronization.
* **Lecture Mode Standardization:** Unified all video playback terminology under "Lecture Mode" for study, note-taking, and scientific PDF workflows.

### 🌟 v2.1.0
* **Playback Completion Modal Dialog:** Material 3 finished watching end screen with Next, Current Replay, Previous episode cards, and Complete & Delete workflow with prompt confirmation.
* **LibVLC Engine & GPU Decoders:** Direct3D11/DXVA2 hardware accelerated pipelines.
* **KaTeX Math Subtitle Rendering:** Physics & Mathematics LaTeX equation rendering in real-time subtitles.

---

## 💖 Community, Support & Feedback

Agar aapko AM Player pasand aaya ho ya aapki study / entertainment routine ko aasan banaya ho, to please apna support dikhayein:
* ⭐ **Star this repository on GitHub** - Ye sabse badi help hai project ki reach badhane ke liye!
* 🐛 **Report Bugs & Suggest Features** via [GitHub Issues](https://github.com/theadarshvish6510/am-player/issues).
* 🤝 **Pull Requests** are always welcome! Feel free to contribute.

---

## 📄 License & Author

* **Architect & Developer:** **Adarsh Vishwakarma (Tillu Sarkar)**
* **GitHub Profile:** [@theadarshvish6510](https://github.com/theadarshvish6510)
* **Email Contact:** thetilludoggy6510@gmail.com
* **Project Repository:** [Adarsh's Media Player (AM Player)](https://github.com/theadarshvish6510/am-player)
* **License:** Distributed under the permissive [MIT License](LICENSE). Feel free to inspect, customize, and extend for your own multimedia and educational needs!
