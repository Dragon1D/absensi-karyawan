// =========================================================================
// MODULE: CAMERA SERVICE (modules/camera.js)
// Handles Webcam Stream, Manual ON/OFF Toggle & Anti-Distortion Aspect Ratio
// =========================================================================

let streamInstance = null;
let photoBase64 = '';

export const CameraService = {
    // Cek apakah stream kamera sedang aktif
    isCameraActive() {
        return streamInstance !== null && streamInstance.active;
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

    // Nyalakan Kamera
    async startWebcam(videoId, btnToggleId) {
        const video = document.getElementById(videoId);
        const btnToggle = document.getElementById(btnToggleId);
        if (!video) return false;

        try {
            if (streamInstance) this.stopWebcam(videoId, btnToggleId);

            const constraints = {
                video: {
                    width: { ideal: 1280 },
                    height: { ideal: 720 },
                    facingMode: "user"
                },
                audio: false
            };

            streamInstance = await navigator.mediaDevices.getUserMedia(constraints);
            video.srcObject = streamInstance;
            video.style.objectFit = 'cover'; // Anti-gepeng pada preview video
            await video.play();

            if (btnToggle) {
                btnToggle.innerHTML = '<i class="fa-solid fa-power-off mr-1.5"></i> Matikan Kamera';
                btnToggle.className = 'px-3 py-1.5 rounded-lg text-xs font-bold bg-red-100 text-red-700 hover:bg-red-200 transition';
            }
            return true;
        } catch (err) {
            console.error("Gagal membuka kamera:", err);
            alert("Gagal membuka kamera. Pastikan izin kamera sudah diberikan.");
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
        }
        const btnToggle = document.getElementById(btnToggleId);
        if (btnToggle) {
            btnToggle.innerHTML = '<i class="fa-solid fa-camera mr-1.5"></i> Nyalakan Kamera';
            btnToggle.className = 'px-3 py-1.5 rounded-lg text-xs font-bold bg-indigo-100 text-indigo-700 hover:bg-indigo-200 transition';
        }
    },

    // Ambil Foto (Preserve Native Aspect Ratio - Anti Gepeng)
    takeSnapshot(videoId, canvasId) {
        const video = document.getElementById(videoId);
        const canvas = document.getElementById(canvasId);

        if (!video || !canvas || !this.isCameraActive()) {
            alert("Nyalakan kamera terlebih dahulu!");
            return null;
        }

        // KUNCI ANTI GEPENG: Disamakan dengan resolusi asli sensor kamera
        const vWidth = video.videoWidth || 640;
        const vHeight = video.videoHeight || 480;

        canvas.width = vWidth;
        canvas.height = vHeight;

        const ctx = canvas.getContext('2d');
        
        // Mirroring kamera depan agar hasil foto tidak terbalik
        ctx.save();
        ctx.translate(canvas.width, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(video, 0, 0, vWidth, vHeight);
        ctx.restore();

        // Export ke Base64 (JPEG Quality 0.75 agar ringan di bawah 100KB)
        photoBase64 = canvas.toDataURL('image/jpeg', 0.75);

        // Otomatis matikan stream kamera setelah foto berhasil diambil
        this.stopWebcam(videoId, 'btnToggleCamera');

        return photoBase64;
    },

    resetCamera() {
        photoBase64 = '';
    },

    getPhotoBase64() {
        return photoBase64;
    }
};
