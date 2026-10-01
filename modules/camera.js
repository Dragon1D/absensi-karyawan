// =========================================================================
// MODULE: CAMERA SERVICE (modules/camera.js) - ENTERPRISE HARDENED
// Includes: Watermarking, Memory Cleanup, Auto-Downscale, & Defensive Checks
// =========================================================================

let streamInstance = null;
let photoBase64 = '';
let currentFacingMode = 'user';

export const CameraService = {
    // Cek status keaktifan kamera
    isCameraActive() {
        return streamInstance !== null && streamInstance.active;
    },

    // Getter untuk mengambil data foto Base64
    getPhotoBase64() {
        return photoBase64;
    },

    // Toggle Nyalakan / Matikan Kamera
    async toggleCamera(videoId, btnToggleId) {
        if (this.isCameraActive()) {
            this.stopWebcam(videoId, btnToggleId);
            return false;
        } else {
            return await this.startWebcam(videoId, btnToggleId);
        }
    },

    // Nyalakan Kamera dengan Guard Handling
    async startWebcam(videoId, btnToggleId, facing = 'user') {
        const video = document.getElementById(videoId);
        const btnToggle = document.getElementById(btnToggleId);
        if (!video) return false;

        // GUARD 1: Cek Secure Context (HTTPS)
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            alert("⚠️ Akses kamera hanya diperbolehkan pada koneksi aman (HTTPS).");
            return false;
        }

        try {
            if (streamInstance) this.stopWebcam(videoId, btnToggleId);

            currentFacingMode = facing;
            const constraints = {
                video: {
                    width: { ideal: 1280 },
                    height: { ideal: 720 },
                    facingMode: facing
                },
                audio: false
            };

            streamInstance = await navigator.mediaDevices.getUserMedia(constraints);
            video.srcObject = streamInstance;
            
            // Intelligent Mirroring: Mirror hanya untuk kamera depan ('user')
            video.style.objectFit = 'cover';
            video.style.transform = (facing === 'user') ? 'scaleX(-1)' : 'none';

            await video.play();

            if (btnToggle) {
                btnToggle.innerHTML = '<i class="fa-solid fa-power-off mr-1.5"></i> Matikan Kamera';
                btnToggle.className = 'px-3 py-1.5 rounded-lg text-xs font-bold bg-red-100 text-red-700 hover:bg-red-200 transition';
            }
            return true;
        } catch (err) {
            console.error("Gagal membuka kamera:", err);
            
            // GUARD 2: Error Handling Spesifik & Ramah User
            if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
                alert("🔒 Izin kamera ditolak! Silakan klik ikon gembok/pengaturan di address bar browser Anda untuk mengizinkan kamera.");
            } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
                alert("⚠️ Kamera sedang digunakan oleh aplikasi lain (Zoom/Meet/Kamera HP). Tutup aplikasi tersebut terlebih dahulu.");
            } else if (err.name === 'OverconstrainedError') {
                return await this.startWebcamFallback(videoId, btnToggleId);
            } else {
                alert("Gagal membuka kamera: " + err.message);
            }
            return false;
        }
    },

    // Fallback untuk HP Spesifikasi Rendah
    async startWebcamFallback(videoId, btnToggleId) {
        const video = document.getElementById(videoId);
        try {
            streamInstance = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
            video.srcObject = streamInstance;
            await video.play();
            return true;
        } catch (e) {
            alert("Kamera perangkat Anda tidak dapat diakses.");
            return false;
        }
    },

    // Matikan Kamera
    stopWebcam(videoId, btnToggleId) {
        if (streamInstance) {
            streamInstance.getTracks().forEach(track => track.stop());
            streamInstance = null;
        }
        const video = document.getElementById(videoId);
        if (video) {
            video.srcObject = null;
            video.style.transform = 'none';
        }
        const btnToggle = document.getElementById(btnToggleId);
        if (btnToggle) {
            btnToggle.innerHTML = '<i class="fa-solid fa-camera mr-1.5"></i> Nyalakan Kamera';
            btnToggle.className = 'px-3 py-1.5 rounded-lg text-xs font-bold bg-indigo-100 text-indigo-700 hover:bg-indigo-200 transition';
        }
    },

    // Ambil Foto (Downscale, Watermarking GPS & Anti-Crash Memory)
    async takeSnapshot(videoId, canvasId, gpsLocationText = '-') {
        const video = document.getElementById(videoId);
        const canvas = document.getElementById(canvasId);

        if (!video || !canvas || !this.isCameraActive()) {
            alert("Nyalakan kamera terlebih dahulu!");
            return null;
        }

        const origW = video.videoWidth || 640;
        const origH = video.videoHeight || 480;

        // GUARD 3: Downscaling maksimal lebar 1024px agar payload file ringan (<150KB)
        const maxW = 1024;
        let scale = 1;
        if (origW > maxW) {
            scale = maxW / origW;
        }
        const targetW = Math.round(origW * scale);
        const targetH = Math.round(origH * scale);

        canvas.width = targetW;
        canvas.height = targetH;

        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, targetW, targetH);

        // Render Gambar
        ctx.save();
        if (currentFacingMode === 'user') {
            ctx.translate(targetW, 0);
            ctx.scale(-1, 1);
        }
        ctx.drawImage(video, 0, 0, targetW, targetH);
        ctx.restore();

        // GUARD 4: Lukis Watermark Waktu & GPS di Atas Foto (Anti-Tamper)
        this.applyWatermark(ctx, targetW, targetH, gpsLocationText);

        // Export ke Base64 JPEG Quality 0.80
        photoBase64 = canvas.toDataURL('image/jpeg', 0.80);

        // Matikan kamera setelah jepretan berhasil
        this.stopWebcam(videoId, 'btnToggleCamera');

        return photoBase64;
    },

    // Helper Watermark Banner
    applyWatermark(ctx, width, height, gpsText) {
        const bannerHeight = Math.max(36, Math.round(height * 0.08));
        
        ctx.fillStyle = "rgba(0, 0, 0, 0.65)";
        ctx.fillRect(0, height - bannerHeight, width, bannerHeight);

        const now = new Date();
        const dateStr = now.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
        const timeStr = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) + " WIB";
        const line1 = `📌 PRESENSI STORE | ${dateStr} - ${timeStr}`;
        const line2 = `📍 GPS: ${gpsText}`;

        ctx.fillStyle = "#FFFFFF";
        ctx.font = `bold ${Math.max(10, Math.round(bannerHeight * 0.32))}px sans-serif`;
        ctx.textBaseline = "middle";

        ctx.fillText(line1, 12, height - (bannerHeight * 0.62));
        ctx.font = `${Math.max(9, Math.round(bannerHeight * 0.28))}px sans-serif`;
        ctx.fillText(line2, 12, height - (bannerHeight * 0.25));
    },

    // Reset Camera & Memory Cleanup (iOS Anti-Crash)
    resetCamera(canvasId = 'photoCanvas') {
        photoBase64 = '';
        const canvas = document.getElementById(canvasId);
        if (canvas) {
            const ctx = canvas.getContext('2d');
            if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
            canvas.width = 0;
            canvas.height = 0;
        }
    }
};

// GUARD 5: Listener Otomatis Matikan Kamera jika HP Terkunci / Pindah Aplikasi
document.addEventListener('visibilitychange', () => {
    if (document.hidden && CameraService.isCameraActive()) {
        CameraService.stopWebcam('webcam', 'btnToggleCamera');
    }
});
