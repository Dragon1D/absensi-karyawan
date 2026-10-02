// =========================================================================
// APP CONTROLLER (app.js) - STRICT EVENT HANDLER & UI LOCK
// Safe Object Binding, Real-Time State Lock, & Accurate HR Approval Flow
// =========================================================================

import { ApiService } from './modules/api.js';
import { CameraService } from './modules/camera.js';
import { GeoService } from './modules/geo.js';

function getWibDateString(date = new Date()) {
    const wibDate = new Date(date.getTime() + (7 * 60 * 60 * 1000));
    return wibDate.toISOString().split('T')[0];
}

function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function showToast(message, type = 'success') {
    const container = document.getElementById('toastContainer');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `pointer-events-auto px-4 py-3 rounded-xl shadow-lg text-xs font-bold flex items-center space-x-2 text-white transition-all transform duration-300 translate-y-[-10px] opacity-0 ${type === 'success' ? 'bg-green-600' : 'bg-red-600'}`;
    toast.innerHTML = `<i class="fa-solid ${type === 'success' ? 'fa-circle-check' : 'fa-circle-exclamation'} text-base"></i><span>${escapeHtml(message)}</span>`;
    
    container.appendChild(toast);
    setTimeout(() => { toast.classList.remove('translate-y-[-10px]', 'opacity-0'); }, 10);
    setTimeout(() => {
        toast.classList.add('opacity-0', 'translate-y-[-10px]');
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

let currentMode = 'Clock In';
let currentAttachType = 'camera';
let masterStores = [];
let masterKaryawan = [];
let uploadedFileObj = null;
let selectedRowForReject = null;
let isCheckingStatus = false;
let hrLogsCache = [];
let selectedEmployeeSisaCuti = 12;

let localEmployeeDetailsCache = {};

async function initApp() {
    const today = getWibDateString();
    if (document.getElementById('filterStartDate')) document.getElementById('filterStartDate').value = today;
    if (document.getElementById('filterEndDate')) document.getElementById('filterEndDate').value = today;

    const data = await ApiService.fetchMasterData();
    masterStores = data.stores || [];
    masterKaryawan = data.karyawan || [];
    populateStoreDropdown();

    GeoService.initGeolocation('gpsLocationText');

    window.addEventListener('online', () => showToast('🌐 Koneksi terhubung kembali.', 'success'));
    window.addEventListener('offline', () => showToast('⚠️ Koneksi terputus!', 'error'));
}

if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', initApp);
} else {
    initApp();
}

window.addEventListener('beforeunload', () => {
    CameraService.stopWebcam('webcam', 'btnToggleCamera');
});

window.switchTab = async function(tab) {
    const salesSec = document.getElementById('tabSalesSection');
    const hrSec = document.getElementById('tabHrSection');
    const salesBtn = document.getElementById('tabSalesBtn');
    const hrBtn = document.getElementById('tabHrBtn');

    if (tab === 'sales') {
        salesSec.classList.remove('hidden');
        hrSec.classList.add('hidden');
        salesBtn.className = "px-3 py-1.5 rounded-lg transition-all duration-200 bg-white text-indigo-600 shadow-sm";
        hrBtn.className = "px-3 py-1.5 rounded-lg transition-all duration-200 text-gray-500 hover:text-gray-900";
        
        localEmployeeDetailsCache = {};
        const freshData = await ApiService.fetchMasterData();
        masterKaryawan = freshData.karyawan || [];
        await window.onKaryawanChange();
    } else {
        salesSec.classList.add('hidden');
        hrSec.classList.remove('hidden');
        hrBtn.className = "px-3 py-1.5 rounded-lg transition-all duration-200 bg-white text-indigo-600 shadow-sm";
        salesBtn.className = "px-3 py-1.5 rounded-lg transition-all duration-200 text-gray-500 hover:text-gray-900";
        CameraService.stopWebcam('webcam', 'btnToggleCamera');
        await window.loadHrLogs();
    }
};

function populateStoreDropdown() {
    const selectStore = document.getElementById('selectStore');
    if (!selectStore) return;
    selectStore.innerHTML = '<option value="">-- Pilih Cabang Store --</option>';
    masterStores.forEach(s => {
        const opt = document.createElement('option');
        opt.value = s.nama;
        opt.textContent = s.nama;
        opt.dataset.id = s.id;
        selectStore.appendChild(opt);
    });
}

window.onStoreChange = function() {
    const selectedStoreNama = document.getElementById('selectStore').value;
    const selectKaryawan = document.getElementById('selectKaryawan');
    selectKaryawan.innerHTML = '<option value="">-- Pilih Nama Sales --</option>';

    document.getElementById('badgeLiveStatus').textContent = 'Belum Dipilih';
    document.getElementById('badgeLiveStatus').className = 'px-2.5 py-1 rounded-full text-xs font-semibold bg-gray-100 text-gray-600';
    if (document.getElementById('badgeSisaCuti')) document.getElementById('badgeSisaCuti').classList.add('hidden');

    const selectedStoreObj = masterStores.find(s => s.nama.trim() === selectedStoreNama.trim());
    const storeId = selectedStoreObj ? selectedStoreObj.id : null;

    const filteredSales = masterKaryawan.filter(k => !storeId || k.storeId === storeId);
    filteredSales.forEach(k => {
        const opt = document.createElement('option');
        opt.value = k.nama;
        opt.textContent = `${k.nama} (${k.jabatan || 'Sales'})`;
        selectKaryawan.appendChild(opt);
    });
};

window.onKaryawanChange = async function() {
    const karyawanNama = document.getElementById('selectKaryawan').value;
    const storeNama = document.getElementById('selectStore').value;
    const badge = document.getElementById('badgeLiveStatus');
    const badgeCuti = document.getElementById('badgeSisaCuti');

    if (!karyawanNama) {
        badge.textContent = 'Belum Dipilih';
        badge.className = 'px-2.5 py-1 rounded-full text-xs font-semibold bg-gray-100 text-gray-600';
        if (badgeCuti) badgeCuti.classList.add('hidden');
        evaluateUiState({ status: 'Belum Dipilih', hasClockIn: false, hasClockOut: false, hasPengajuan: false, clockInShift: null, pengajuanType: null, approvalStatus: null });
        return;
    }

    isCheckingStatus = true;
    badge.textContent = 'Mengecek...';
    const detail = await ApiService.checkTodayStatusDetail(karyawanNama, storeNama);
    isCheckingStatus = false;

    // Nilai sisa cuti terhitung otomatis dari database Supabase
    selectedEmployeeSisaCuti = detail.sisaCuti !== undefined ? detail.sisaCuti : 12;

    if (badgeCuti) {
        badgeCuti.textContent = `🌴 Sisa Cuti: ${selectedEmployeeSisaCuti} Hari`;
        badgeCuti.className = `px-2.5 py-1 rounded-full text-xs font-bold ${selectedEmployeeSisaCuti > 0 ? 'bg-indigo-100 text-indigo-700' : 'bg-red-100 text-red-700'}`;
        badgeCuti.classList.remove('hidden');
    }

    window.calculateLeavePreview();

    if (detail.status !== 'ERROR_CHECKING') {
        const cacheKey = `${karyawanNama.trim()}_${storeNama.trim()}`;
        localEmployeeDetailsCache[cacheKey] = detail;
        evaluateUiState(detail);
    } else {
        badge.textContent = 'Gagal Cek Status';
        badge.className = 'px-2.5 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-700';
    }
};

window.onJenisPengajuanChange = function() {
    const jenis = document.getElementById('selectJenisPengajuan').value;
    const containerHari = document.getElementById('containerJumlahHari');

    if (jenis.includes('Cuti')) {
        containerHari.classList.remove('hidden');
        window.calculateLeavePreview();
    } else {
        containerHari.classList.add('hidden');
    }
};

window.calculateLeavePreview = function() {
    const inputHari = document.getElementById('inputJumlahHari');
    const previewText = document.getElementById('leaveCalcPreview');
    if (!inputHari || !previewText) return;

    let requestedDays = parseInt(inputHari.value) || 1;
    if (requestedDays < 1) {
        requestedDays = 1;
        inputHari.value = 1;
    }

    const estRemaining = selectedEmployeeSisaCuti - requestedDays;
    if (estRemaining >= 0) {
        previewText.innerHTML = `Estimasi Sisa Cuti Setelah ACC: <strong class="text-indigo-800">${estRemaining} Hari</strong>`;
        previewText.className = 'text-[11px] font-medium text-indigo-700 mt-1.5';
    } else {
        previewText.innerHTML = `⚠️ Melebihi Kuota! Kurang: <strong class="text-red-700">${Math.abs(estRemaining)} Hari</strong>`;
        previewText.className = 'text-[11px] font-bold text-red-600 mt-1.5';
    }
};

function evaluateUiState(detail) {
    const badge = document.getElementById('badgeLiveStatus');
    const selectShift = document.getElementById('selectShift');
    const selectJenisPengajuan = document.getElementById('selectJenisPengajuan');
    const inputJumlahHari = document.getElementById('inputJumlahHari');
    const textCatatan = document.getElementById('textCatatan');
    const st = detail.status;

    if (selectShift) {
        selectShift.disabled = false;
        selectShift.classList.remove('bg-gray-200', 'cursor-not-allowed');
    }
    if (selectJenisPengajuan) {
        selectJenisPengajuan.disabled = false;
        selectJenisPengajuan.classList.remove('bg-gray-200', 'cursor-not-allowed');
    }
    if (inputJumlahHari) {
        inputJumlahHari.disabled = false;
        inputJumlahHari.classList.remove('bg-gray-200', 'cursor-not-allowed');
    }
    if (textCatatan) {
        textCatatan.disabled = false;
        textCatatan.classList.remove('bg-gray-200', 'cursor-not-allowed');
    }

    badge.textContent = st === 'OFFLINE_UNKNOWN' ? 'Offline' : st;
    if (st === 'Clock In' || st.includes('Clock In')) badge.className = 'px-2.5 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-700';
    else if (st === 'Clock Out' || st.includes('Clock Out')) badge.className = 'px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-700';
    else if (st.includes('Pengajuan')) badge.className = 'px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-700';
    else badge.className = 'px-2.5 py-1 rounded-full text-xs font-semibold bg-gray-100 text-gray-600';

    if (currentMode === 'Clock Out' && detail.hasClockIn && detail.clockInShift) {
        if (selectShift) {
            selectShift.value = detail.clockInShift;
            selectShift.disabled = true;
            selectShift.classList.add('bg-gray-200', 'cursor-not-allowed');
        }
    }

    const cameraHeaderRow = document.getElementById('cameraHeaderRow');
    const containerCam = document.getElementById('containerCamera');
    const containerFile = document.getElementById('containerFileUpload');
    const btnSubmit = document.getElementById('btnSubmitPresensi');
    const cameraLockNotice = document.getElementById('cameraLockNotice');

    if (currentMode === 'Pengajuan' && detail.hasPengajuan) {
        if (selectJenisPengajuan) {
            selectJenisPengajuan.disabled = true;
            selectJenisPengajuan.classList.add('bg-gray-200', 'cursor-not-allowed');
        }
        if (inputJumlahHari) {
            inputJumlahHari.disabled = true;
            inputJumlahHari.classList.add('bg-gray-200', 'cursor-not-allowed');
        }
        if (textCatatan) {
            textCatatan.disabled = true;
            textCatatan.classList.add('bg-gray-200', 'cursor-not-allowed');
        }

        if (containerFile) containerFile.classList.add('hidden');
        if (cameraHeaderRow) cameraHeaderRow.classList.add('hidden');
        if (containerCam) containerCam.classList.add('hidden');

        const appStatus = detail.approvalStatus || 'Pending';
        let bannerBg = 'bg-amber-50 border-amber-200 text-amber-800';
        let statusBadge = `<span class="font-bold text-amber-700">Pending</span>`;
        let icon = '<i class="fa-solid fa-clock-rotate-left mr-1.5 text-amber-600"></i>';
        let titleMsg = 'Pengajuan Sudah Terkirim Hari Ini';

        if (appStatus === 'DI ACC' || appStatus === 'Auto-Approved' || appStatus === 'Approved') {
            bannerBg = 'bg-green-50 border-green-200 text-green-800';
            statusBadge = `<span class="font-bold text-green-700">DI ACC</span>`;
            icon = '<i class="fa-solid fa-circle-check mr-1.5 text-green-600"></i>';
            titleMsg = 'Pengajuan Telah Disetujui HR';
        } else if (appStatus === 'DI REJECT' || appStatus === 'Rejected') {
            bannerBg = 'bg-red-50 border-red-200 text-red-800';
            statusBadge = `<span class="font-bold text-red-700">DI REJECT</span>`;
            icon = '<i class="fa-solid fa-circle-xmark mr-1.5 text-red-600"></i>';
            titleMsg = 'Pengajuan Ditolak HR';
        }

        if (cameraLockNotice) {
            cameraLockNotice.innerHTML = `
                <div class="p-4 ${bannerBg} border rounded-2xl text-center space-y-1 shadow-sm">
                    <div class="text-xs font-bold">${icon} ${titleMsg}</div>
                    <div class="text-[11px]">Pengajuan <strong>${detail.pengajuanType || 'Cuti/Sakit'}</strong> Anda (Status: ${statusBadge}). Form pengajuan telah dikunci.</div>
                </div>
            `;
            cameraLockNotice.classList.remove('hidden');
        }
        if (btnSubmit) btnSubmit.disabled = true;

    } else if (currentMode === 'Clock In' && detail.hasClockIn) {
        if (textCatatan) {
            textCatatan.disabled = true;
            textCatatan.classList.add('bg-gray-200', 'cursor-not-allowed');
        }
        CameraService.stopWebcam('webcam', 'btnToggleCamera');
        if (cameraHeaderRow) cameraHeaderRow.classList.add('hidden');
        if (containerCam) containerCam.classList.add('hidden');
        if (cameraLockNotice) {
            cameraLockNotice.innerHTML = `
                <div class="p-4 bg-green-50 border border-green-200 rounded-2xl text-center space-y-1">
                    <div class="text-xs font-bold text-green-800"><i class="fa-solid fa-circle-check mr-1.5"></i> Anda Sudah Clock In Hari Ini</div>
                    <div class="text-[11px] text-green-600">Pilihan shift terunci: <strong>${detail.clockInShift || '-'}</strong>. Silakan klik tombol <strong>Clock Out</strong> di atas saat jam pulang toko.</div>
                </div>
            `;
            cameraLockNotice.classList.remove('hidden');
        }
        if (btnSubmit) btnSubmit.disabled = true;

    } else if (currentMode === 'Clock Out' && detail.hasClockOut) {
        if (textCatatan) {
            textCatatan.disabled = true;
            textCatatan.classList.add('bg-gray-200', 'cursor-not-allowed');
        }
        CameraService.stopWebcam('webcam', 'btnToggleCamera');
        if (cameraHeaderRow) cameraHeaderRow.classList.add('hidden');
        if (containerCam) containerCam.classList.add('hidden');
        if (cameraLockNotice) {
            cameraLockNotice.innerHTML = `
                <div class="p-4 bg-blue-50 border border-blue-200 rounded-2xl text-center space-y-1">
                    <div class="text-xs font-bold text-blue-800"><i class="fa-solid fa-circle-check mr-1.5"></i> Presensi Hari Ini Telah Lengkap</div>
                    <div class="text-[11px] text-blue-600">Anda sudah melakukan Clock In & Clock Out hari ini. Terima kasih!</div>
                </div>
            `;
            cameraLockNotice.classList.remove('hidden');
        }
        if (btnSubmit) btnSubmit.disabled = true;

    } else {
        if (cameraLockNotice) cameraLockNotice.classList.add('hidden');
        if (btnSubmit) btnSubmit.disabled = false;
        
        if (currentMode === 'Clock In' || currentMode === 'Clock Out') {
            window.setAttachType('camera');
        } else {
            window.setAttachType('file');
        }
    }
}

window.setAbsenMode = function(mode) {
    currentMode = mode;
    const btnIn = document.getElementById('btnClockIn');
    const btnOut = document.getElementById('btnClockOut');
    const btnPeng = document.getElementById('btnPengajuan');
    const secShift = document.getElementById('sectionShift');
    const secPeng = document.getElementById('sectionPengajuan');
    const attachToggle = document.getElementById('attachTypeToggle');

    [btnIn, btnOut, btnPeng].forEach(b => b.className = "py-2.5 px-3 rounded-xl border border-gray-200 bg-gray-50 text-gray-600 font-semibold text-xs flex flex-col items-center justify-center space-y-1 transition");

    if (mode === 'Clock In' || mode === 'Clock Out') {
        if (mode === 'Clock In') btnIn.className = "py-2.5 px-3 rounded-xl border border-indigo-200 bg-indigo-50 text-indigo-700 font-semibold text-xs flex flex-col items-center justify-center space-y-1 shadow-sm";
        else btnOut.className = "py-2.5 px-3 rounded-xl border border-indigo-200 bg-indigo-50 text-indigo-700 font-semibold text-xs flex flex-col items-center justify-center space-y-1 shadow-sm";
        
        secShift.classList.remove('hidden');
        secPeng.classList.add('hidden');
        attachToggle.classList.add('hidden');
    } else {
        btnPeng.className = "py-2.5 px-3 rounded-xl border border-amber-200 bg-amber-50 text-amber-700 font-semibold text-xs flex flex-col items-center justify-center space-y-1 shadow-sm";
        secShift.classList.add('hidden');
        secPeng.classList.remove('hidden');
        attachToggle.classList.add('hidden');
        if (document.getElementById('selectShift')) document.getElementById('selectShift').value = '-';
        window.onJenisPengajuanChange();
    }

    const karyawanNama = document.getElementById('selectKaryawan').value;
    const storeNama = document.getElementById('selectStore').value;
    const cacheKey = `${karyawanNama.trim()}_${storeNama.trim()}`;
    const detail = localEmployeeDetailsCache[cacheKey] || { status: 'Belum Absen', hasClockIn: false, hasClockOut: false, hasPengajuan: false, clockInShift: null, pengajuanType: null, approvalStatus: null };
    
    evaluateUiState(detail);
};

window.setAttachType = function(type) {
    currentAttachType = type;
    const containerCam = document.getElementById('containerCamera');
    const containerFile = document.getElementById('containerFileUpload');
    const cameraHeaderRow = document.getElementById('cameraHeaderRow');
    const labelAttachment = document.getElementById('labelAttachment');

    if (type === 'camera') {
        if (containerCam) containerCam.classList.remove('hidden');
        if (cameraHeaderRow) cameraHeaderRow.classList.remove('hidden');
        if (containerFile) containerFile.classList.add('hidden');
        if (labelAttachment) labelAttachment.innerHTML = 'Lampiran Foto Selfie <span class="text-red-500">*</span>';
    } else {
        if (containerFile) containerFile.classList.remove('hidden');
        if (containerCam) containerCam.classList.add('hidden');
        if (cameraHeaderRow) cameraHeaderRow.classList.add('hidden');
        if (labelAttachment) labelAttachment.innerHTML = 'Lampiran Bukti Dokumen <span class="text-red-500">*</span>';
        CameraService.stopWebcam('webcam', 'btnToggleCamera');
    }
};

window.updateCharCount = function() {
    const input = document.getElementById('textCatatan');
    if (input.value.length > 250) input.value = input.value.substring(0, 250);
    document.getElementById('charCounter').textContent = `${input.value.length}/250`;
};

window.initGeolocation = function() {
    GeoService.initGeolocation('gpsLocationText');
};

window.toggleCameraPower = async function() {
    await CameraService.toggleCamera('webcam', 'btnToggleCamera');
};

window.takeSnapshot = async function() {
    const gpsCoords = GeoService.getCoords();
    const result = await CameraService.takeSnapshot('webcam', 'photoCanvas', gpsCoords);
    if (result) {
        document.getElementById('webcam').classList.add('hidden');
        document.getElementById('photoCanvas').classList.remove('hidden');
        document.getElementById('btnCapture').classList.add('hidden');
        document.getElementById('btnRetake').classList.remove('hidden');
    }
};

window.resetCamera = function() {
    CameraService.resetCamera('photoCanvas');
    document.getElementById('photoCanvas').classList.add('hidden');
    document.getElementById('webcam').classList.remove('hidden');
    document.getElementById('btnCapture').classList.remove('hidden');
    document.getElementById('btnRetake').classList.add('hidden');
};

window.handleFileSelected = function(event) {
    const file = event.target.files[0];
    if (!file) return;

    const allowedTypes = ['image/jpeg', 'image/png', 'image/jpg', 'application/pdf'];
    if (!allowedTypes.includes(file.type)) {
        showToast('Format file harus PDF, JPG, atau PNG!', 'error');
        event.target.value = '';
        return;
    }

    if (file.size > 2 * 1024 * 1024) {
        showToast('Ukuran file maksimal 2 MB!', 'error');
        event.target.value = '';
        return;
    }

    const reader = new FileReader();
    reader.onload = function(e) {
        uploadedFileObj = { base64: e.target.result, name: file.name, type: file.type };
        document.getElementById('fileNameText').textContent = file.name;
        document.getElementById('filePreviewBadge').classList.remove('hidden');
        document.getElementById('filePreviewBadge').classList.add('flex');
    };
    reader.readAsDataURL(file);
};

window.clearSelectedFile = function() {
    uploadedFileObj = null;
    if (document.getElementById('filePicker')) document.getElementById('filePicker').value = '';
    document.getElementById('filePreviewBadge').classList.add('hidden');
    document.getElementById('filePreviewBadge').classList.remove('flex');
};

// SUBMIT PRESENSI
window.submitPresensi = async function() {
    if (!navigator.onLine) return showToast('⚠️ Koneksi terputus!', 'error');
    if (isCheckingStatus) return showToast('Mohon tunggu validasi...', 'error');

    const storeNama = document.getElementById('selectStore').value;
    const karyawanNama = document.getElementById('selectKaryawan').value;
    const selectShift = document.getElementById('selectShift');
    const shiftNama = selectShift ? selectShift.value : '-';
    const jenisPengajuan = document.getElementById('selectJenisPengajuan') ? document.getElementById('selectJenisPengajuan').value : '-';
    const catatan = document.getElementById('textCatatan').value;
    const btnSubmit = document.getElementById('btnSubmitPresensi');
    const btnText = document.getElementById('btnSubmitText');

    if (!storeNama || !karyawanNama) {
        showToast('Pilih Cabang Store dan Nama Sales!', 'error');
        return;
    }

    const cacheKey = `${karyawanNama.trim()}_${storeNama.trim()}`;
    const detailCached = localEmployeeDetailsCache[cacheKey] || { status: 'Belum Absen', hasClockIn: false, hasClockOut: false, hasPengajuan: false, clockInShift: null, pengajuanType: null, approvalStatus: null };

    if (currentMode === 'Clock In' && detailCached.hasClockIn) {
        showToast(`⚠️ Sales ${karyawanNama} SUDAH Clock In hari ini!`, 'error');
        return;
    }

    if (currentMode === 'Clock Out' && detailCached.hasClockOut) {
        showToast(`⚠️ Sales ${karyawanNama} SUDAH Clock Out hari ini!`, 'error');
        return;
    }

    if (currentMode === 'Pengajuan' && detailCached.hasPengajuan) {
        showToast(`⚠️ Sales ${karyawanNama} SUDAH mengajukan cuti/sakit/izin hari ini!`, 'error');
        return;
    }

    let jumlahHariPengajuan = 1;
    if (currentMode === 'Pengajuan' && jenisPengajuan.includes('Cuti')) {
        const inputHariElem = document.getElementById('inputJumlahHari');
        jumlahHariPengajuan = parseInt(inputHariElem ? inputHariElem.value : 1) || 1;

        if (jumlahHariPengajuan > selectedEmployeeSisaCuti) {
            showToast(`❌ Jumlah hari cuti (${jumlahHariPengajuan}) melebihi sisa cuti tersedia (${selectedEmployeeSisaCuti} Hari)!`, 'error');
            return;
        }
    }

    let fileDataToSend = '';
    let fileNameToSend = '';
    let fileMimeToSend = '';

    if (currentAttachType === 'camera') {
        fileDataToSend = CameraService.getPhotoBase64();
        if (!fileDataToSend) return showToast('Foto Selfie WAJIB diambil!', 'error');
    } else {
        if (!uploadedFileObj) return showToast('Lampiran Berkas / Dokumen WAJIB diunggah!', 'error');
        fileDataToSend = uploadedFileObj.base64;
        fileNameToSend = uploadedFileObj.name;
        fileMimeToSend = uploadedFileObj.type;
    }

    btnSubmit.disabled = true;
    btnText.textContent = 'MEMVALIDASI...';

    try {
        let isAnomaly = false;
        let finalStatusFormatted = (currentMode === 'Pengajuan') ? `Pengajuan ${jenisPengajuan} (${jumlahHariPengajuan} Hari)` : currentMode;
        let approvalDefault = finalStatusFormatted.includes("Pengajuan") ? "Pending" : "Auto-Approved";

        if (currentMode === 'Clock Out' && !detailCached.hasClockIn) {
            isAnomaly = true;
            finalStatusFormatted = 'Clock Out (Tanpa Clock In)';
            approvalDefault = 'Anomali - Butuh Koreksi';
            showToast('⚠️ Clock Out tanpa Clock In! Dikirim sebagai Anomali.', 'error');
        }

        btnText.textContent = 'MENGIRIM...';
        const isoTimestamp = new Date().toISOString();

        const supabasePayload = {
            timestamp: isoTimestamp,
            nama_store: storeNama.trim(),
            nama_karyawan: karyawanNama.trim(),
            jam_shift: (currentMode === 'Pengajuan') ? '-' : shiftNama,
            status_absen: finalStatusFormatted,
            jenis_pengajuan: (currentMode === 'Pengajuan') ? `${jenisPengajuan} (${jumlahHariPengajuan} Hari)` : '-',
            catatan_keterangan: catatan || (isAnomaly ? 'Anomali: Clock Out tanpa Clock In' : '-'),
            lokasi_gps: GeoService.getCoords(),
            foto_drive_url: "Uploading Drive...",
            status_approval_hr: approvalDefault,
            alasan_penolakan_hr: "-",
            is_anomaly: isAnomaly
        };

        const createdRecordId = await ApiService.submitToSupabase(supabasePayload);

        // Refresh status & recalculate sisa cuti dari server
        await window.onKaryawanChange();

        showToast('🎉 Presensi/Pengajuan Berhasil Tersimpan!', 'success');
        document.getElementById('textCatatan').value = '';
        window.clearSelectedFile();
        window.resetCamera();

        ApiService.submitToAppsScriptBackground({
            supabaseId: createdRecordId,
            timestamp: isoTimestamp,
            storeNama: storeNama.trim(),
            karyawanNama: karyawanNama.trim(),
            shiftNama: (currentMode === 'Pengajuan') ? '-' : shiftNama,
            status: finalStatusFormatted,
            jenisPengajuan: (currentMode === 'Pengajuan') ? `${jenisPengajuan} (${jumlahHariPengajuan} Hari)` : '-',
            catatan: catatan || (isAnomaly ? 'Anomali: Clock Out tanpa Clock In' : '-'),
            gps: GeoService.getCoords(),
            fileBase64: fileDataToSend,
            fileName: fileNameToSend,
            fileMimeType: fileMimeToSend,
            isAnomaly: isAnomaly
        });

    } catch (err) {
        showToast('Gagal mengirim: ' + err.message, 'error');
    } finally {
        btnSubmit.disabled = false;
        btnText.textContent = 'KIRIM PRESENSI SEKARANG';
    }
};

// PORTAL HR HANDLERS
window.verifyHrPin = async function() {
    const pin = document.getElementById('inputHrPin').value;
    if (!pin) return showToast('Masukkan PIN HR Admin!', 'error');

    const res = await ApiService.verifyHrPin(pin);
    if (res.status === 'success') {
        document.getElementById('hrAuthCard').classList.add('hidden');
        document.getElementById('hrDashboardContent').classList.remove('hidden');
        await window.loadHrLogs();
        showToast('Login HR Berhasil!', 'success');
    } else showToast('🔒 PIN HR Salah!', 'error');
};

window.loadHrLogs = async function() {
    const start = document.getElementById('filterStartDate').value;
    const end = document.getElementById('filterEndDate').value;
    const tbody = document.getElementById('tableHrLogsBody');
    tbody.innerHTML = '<tr><td colspan="6" class="text-center py-6 text-gray-500">Memuat Data...</td></tr>';

    hrLogsCache = await ApiService.fetchHrLogs(start, end);
    window.filterHrLogs();
};

window.filterHrLogs = function() {
    const searchVal = (document.getElementById('searchHrInput') ? document.getElementById('searchHrInput').value : '').toLowerCase();
    const tbody = document.getElementById('tableHrLogsBody');

    const filtered = hrLogsCache.filter(row => {
        const matchNama = String(row.nama_karyawan || '').toLowerCase().includes(searchVal);
        const matchStore = String(row.nama_store || '').toLowerCase().includes(searchVal);
        const matchStatus = String(row.status_absen || '').toLowerCase().includes(searchVal);
        return matchNama || matchStore || matchStatus;
    });

    if (document.getElementById('logCountBadge')) {
        document.getElementById('logCountBadge').textContent = `${filtered.length} Data`;
    }

    if (filtered.length > 0) renderHrLogsTable(filtered);
    else tbody.innerHTML = '<tr><td colspan="6" class="text-center py-6 text-gray-400">Tidak ada data.</td></tr>';
};

function renderHrLogsTable(logs) {
    const tbody = document.getElementById('tableHrLogsBody');
    tbody.innerHTML = '';
    logs.forEach(row => {
        const tr = document.createElement('tr');
        tr.className = "hover:bg-gray-50 transition border-b border-gray-100";
        const dateFormatted = new Date(row.timestamp).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' }) + " WIB";

        const isApproved = (row.status_approval_hr === 'DI ACC' || row.status_approval_hr === 'Auto-Approved' || row.status_approval_hr === 'Approved');
        const isRejected = (row.status_approval_hr === 'DI REJECT' || row.status_approval_hr === 'Rejected');
        const isAnomaly = (row.is_anomaly || (row.status_approval_hr && row.status_approval_hr.includes('Anomali')));

        let badgeApproval = `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300">PENDING</span>`;
        if (isAnomaly) {
            badgeApproval = `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500 text-white shadow-sm">⚠️ ANOMALI</span>`;
        } else if (isApproved) {
            badgeApproval = `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-green-100 text-green-700 border border-green-300">DI ACC</span>`;
        } else if (isRejected) {
            badgeApproval = `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-red-100 text-red-700 border border-red-300">DI REJECT</span>`;
        }

        let fileBtnHtml = `<span class="text-gray-400 text-[10px]">-</span>`;
        if (row.foto_drive_url && row.foto_drive_url.startsWith('http')) {
            fileBtnHtml = `<a href="${escapeHtml(row.foto_drive_url)}" target="_blank" rel="noopener noreferrer" class="text-xs text-indigo-600 font-bold underline flex items-center"><i class="fa-solid fa-file-lines mr-1"></i> Lihat Dokumen</a>`;
        } else if (row.foto_drive_url === 'Uploading Drive...') {
            fileBtnHtml = `<span class="text-amber-600 text-[10px] font-semibold animate-pulse">Proses Drive...</span>`;
        }

        let aksiHtml = `
            <button onclick="window.handleApproveClick(${row.id})" class="bg-green-600 hover:bg-green-700 text-white font-bold px-2.5 py-1 rounded-lg text-[10px] transition shadow-sm">ACC</button>
            <button onclick="window.handleRejectClick(${row.id})" class="bg-red-600 hover:bg-red-700 text-white font-bold px-2.5 py-1 rounded-lg text-[10px] transition shadow-sm">Tolak</button>
        `;

        if (isApproved) {
            aksiHtml = `<span class="inline-flex items-center text-green-600 font-bold text-[11px]"><i class="fa-solid fa-circle-check mr-1"></i> Selesai (ACC)</span>`;
        } else if (isRejected) {
            aksiHtml = `<span class="inline-flex items-center text-red-600 font-bold text-[11px]"><i class="fa-solid fa-circle-xmark mr-1"></i> Ditolak</span>`;
        }

        tr.innerHTML = `
            <td class="p-3 font-mono text-[11px] whitespace-nowrap">${dateFormatted}</td>
            <td class="p-3">
                <div class="font-bold text-gray-900">${escapeHtml(row.nama_karyawan)}</div>
                <div class="text-[10px] text-gray-500">${escapeHtml(row.nama_store)}</div>
            </td>
            <td class="p-3">
                <div class="font-semibold ${isAnomaly ? 'text-amber-700 font-bold' : 'text-indigo-600'}">${escapeHtml(row.status_absen)}</div>
                <div class="text-[10px] text-gray-400">${escapeHtml(row.jam_shift)}</div>
            </td>
            <td class="p-3">${fileBtnHtml}</td>
            <td class="p-3">${badgeApproval}</td>
            <td class="p-3 text-center whitespace-nowrap">${aksiHtml}</td>
        `;
        tbody.appendChild(tr);
    });
}

window.handleApproveClick = async function(recordId) {
    const targetRow = hrLogsCache.find(r => String(r.id) === String(recordId));
    if (!targetRow) return showToast('Data tidak ditemukan!', 'error');

    if (!confirm(`ACC pengajuan / koreksi untuk ${targetRow.nama_karyawan}?`)) return;

    showToast('Mengirim update ke Supabase...', 'success');

    const success = await ApiService.updateApproval({ 
        rowId: recordId, 
        karyawanNama: targetRow.nama_karyawan, 
        targetStatus: 'DI ACC', 
        alasanReject: '-' 
    });

    if (success) {
        targetRow.status_approval_hr = 'DI ACC';
        targetRow.is_anomaly = false;
        window.filterHrLogs();

        localEmployeeDetailsCache = {};
        showToast('🎉 Approval Berhasil & Data Supabase Diperbarui!', 'success');
    } else {
        showToast('❌ Gagal update ke Supabase! Cek RLS Policy di Supabase Console.', 'error');
    }
};

window.handleRejectClick = function(recordId) {
    const targetRow = hrLogsCache.find(r => String(r.id) === String(recordId));
    if (!targetRow) return showToast('Data tidak ditemukan!', 'error');

    selectedRowForReject = targetRow;
    document.getElementById('inputRejectReason').value = '';
    document.getElementById('rejectModal').classList.remove('hidden');
};

window.closeRejectModal = function() {
    selectedRowForReject = null;
    document.getElementById('rejectModal').classList.add('hidden');
};

window.confirmRejectAction = async function() {
    const reason = document.getElementById('inputRejectReason').value;
    if (!reason.trim()) return showToast('Alasan penolakan wajib diisi!', 'error');

    const targetRow = selectedRowForReject;
    window.closeRejectModal();

    showToast('Mengirim penolakan ke Supabase...', 'success');

    const success = await ApiService.updateApproval({ 
        rowId: targetRow.id, 
        karyawanNama: targetRow.nama_karyawan, 
        targetStatus: 'DI REJECT', 
        alasanReject: reason 
    });

    if (success) {
        targetRow.status_approval_hr = 'DI REJECT';
        window.filterHrLogs();

        localEmployeeDetailsCache = {};
        showToast('Penolakan Berhasil Tersimpan!', 'success');
    } else {
        showToast('❌ Gagal update ke Supabase! Cek RLS Policy di Supabase Console.', 'error');
    }
};
