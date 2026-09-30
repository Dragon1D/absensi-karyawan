// =========================================================================
// MODULE: CAMERA SERVICE (modules/camera.js)
// Handles WebRTC Stream, Snapshot Capture, Canvas Compression & Memory Release
// =========================================================================

export const CameraService = {
    videoStream: null,
    capturedBase64: '',

    // 1. Inisialisasi & Jalankan WebRTC Webcam Stream
    async startWebcam(videoElementId, canvasElementId, btnCaptureId, btnRetakeId) {
        this.stopWebcam(videoElementId);

        const video = document.getElementById(videoElementId);
        const canvas = document.getElementById(canvasElementId);
        const btnCapture = document.getElementById(btnCaptureId);
        const btnRetake = document.getElementById(btnRetakeId);

        if (video) video.classList.remove('hidden');
        if (canvas) canvas.classList.add('hidden');
        if (btnCapture) btnCapture.classList.remove('hidden');
        if (btnRetake) btnRetake.classList.add('hidden');

        try {
            this.videoStream = await navigator.mediaDevices.getUserMedia({
                video: {
                    width: { ideal: 1280 },
                    height: { ideal: 720 },
                    facingMode: 'user'
                },
                audio: false
            });
            if (video) video.srcObject = this.videoStream;
            return true;
        } catch (err) {
            console.warn("Gagal membuka kamera:", err);
            return false;
        }
    },

    // 2. Hentikan & Lepaskan Resource Hardware Kamera
    stopWebcam(videoElementId) {
        if (this.videoStream) {
            this.videoStream.getTracks().forEach(track => track.stop());
            this.videoStream = null;
        }
        if (videoElementId) {
            const video = document.getElementById(videoElementId);
            if (video) video.srcObject = null;
        }
    },

    // 3. Tangkap Snapshot & Kompres Gambar via Canvas (<100 KB)
    takeSnapshot(videoElementId, canvasElementId, btnCaptureId, btnRetakeId) {
        const video = document.getElementById(videoElementId);
        const canvas = document.getElementById(canvasElementId);
        if (!video || !canvas) return null;

        const ctx = canvas.getContext('2d');
        canvas.width = 640;
        canvas.height = 480;

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        // Kompresi JPEG Kualitas 0.5
        this.capturedBase64 = canvas.toDataURL('image/jpeg', 0.5);

        // Matikan sensor kamera setelah jepret
        this.stopWebcam(videoElementId);

        // Switch tampilan dari Video Stream ke Hasil Foto Canvas
        video.classList.add('hidden');
        canvas.classList.remove('hidden');

        const btnCapture = document.getElementById(btnCaptureId);
        const btnRetake = document.getElementById(btnRetakeId);
        if (btnCapture) btnCapture.classList.add('hidden');
        if (btnRetake) btnRetake.classList.remove('hidden');

        return this.capturedBase64;
    },

    // 4. Reset Foto & Buka Kembali Kamera Stream
    resetCamera(videoElementId, canvasElementId, btnCaptureId, btnRetakeId) {
        this.capturedBase64 = '';
        return this.startWebcam(videoElementId, canvasElementId, btnCaptureId, btnRetakeId);
    },

    // 5. Getter Data Base64 Foto Terakhir
    getPhotoBase64() {
        return this.capturedBase64;
    },

    // 6. Bersihkan Objek Foto
    clearPhoto() {
        this.capturedBase64 = '';
    }
};
