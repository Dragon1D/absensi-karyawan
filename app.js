// =========================================================================
// APP CONTROLLER (app.js)
// Orchestrates UI Event Handlers & Integrates ES Modules
// =========================================================================

import { ApiService } from './modules/api.js';
import { CameraService } from './modules/camera.js';
import { GeoService } from './modules/geo.js';

// -------------------------------------------------------------------------
// HELPER FUNCTIONS
// -------------------------------------------------------------------------
function getWibDateString(date = new Date()) {
    const wibDate = new Date(date.getTime() + (7 * 60 * 60 * 1000));
    return wibDate.toISOString().split('T')[0];
}

function escapeHtml(str) {
    return String(str || '').replace(/&/g, '&').replace(/</g, '<').replace(/>/g, '>').replace(/"/g, '"');
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

// -------------------------------------------------------------------------
// STATE MANAGEMENT
// -------------------------------------------------------------------------
let currentMode = 'Clock In';
let currentAttachType = 'camera';
let masterStores = [];
let masterKaryawan = [];
let uploadedFileObj = null;
let selectedRowForReject = null;

// -------------------------------------------------------------------------
// INITIALIZER
// -------------------------------------------------------------------------
async function initApp() {
    const today = getWibDateString();
    if (document.getElementById('filterStartDate')) document.getElementById('filterStartDate').value = today;
    if (document.getElementById('filterEndDate')) document.getElementById('filterEndDate').value = today;

    // Load Master Data
    const data = await ApiService.fetchMasterData();
    masterStores = data.stores || [];
    masterKaryawan = data.karyawan || [];
    populateStoreDropdown();

    // Init GPS & Camera
    GeoService.initGeolocation('gpsLocationText');
    CameraService.startWebcam('webcam', 'photoCanvas', 'btnCapture', 'btnRetake');
}

if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', initApp);
} else {
    initApp();
}

window.addEventListener('beforeunload', () => {
    CameraService.stopWebcam('webcam');
});

// -------------------------------------------------------------------------
// UI EVENT HANDLERS
// -------------------------------------------------------------------------
window.switchTab = function(tab) {
    const salesSec = document.getElementById('tabSalesSection');
    const hrSec = document.getElementById('tabHrSection');
    const salesBtn = document.getElementById('tabSalesBtn');
    const hrBtn = document.getElementById('tabHrBtn');

    if (tab === 'sales') {
        salesSec.classList.remove('hidden');
        hrSec.classList.add('hidden');
        salesBtn.className = "px-3 py-1.5 rounded-lg transition-all duration-200 bg-white text-indigo-600 shadow-sm";
        hrBtn.className = "px-3 py-1.5 rounded-lg transition-all duration-200 text-gray-500 hover:text-gray-900";
        if (currentAttachType === 'camera') CameraService.startWebcam('webcam', 'photoCanvas', 'btnCapture', 'btnRetake');
    } else {
        salesSec.classList.add('hidden');
        hrSec.classList.remove('hidden');
        hrBtn.className = "px-3 py-1.5 rounded-lg transition-all duration-200 bg-white text-indigo-600 shadow-sm";
        salesBtn.className = "px-3 py-1.5 rounded-lg transition-all duration-200 text-gray-500 hover:text-gray-900";
        CameraService.stopWebcam('webcam');
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
    const karyawan = document.getElementById('selectKaryawan').value;
    const store = document.getElementById('selectStore').value;
    const badge = document.getElementById('badgeLiveStatus');

    if (!karyawan) {
        badge.textContent = 'Belum Dipilih';
        badge.className = 'px-2.5 py-1 rounded-full text-xs font-semibold bg-gray-100 text-gray-600';
        return;
    }

    badge.textContent = 'Mengecek...';
    const st = await ApiService.checkTodayStatus(karyawan, store);
    badge.textContent = st;

    if (st === 'Clock In' || st.includes('Clock In')) badge.className = 'px-2.5 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-700';
    else if (st === 'Clock Out' || st.includes('Clock Out')) badge.className = 'px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-700';
    else if (st.includes('Pengajuan')) badge.className = 'px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-700';
    else badge.className = 'px-2.5 py-1 rounded-full text-xs font-semibold bg-gray-100 text-gray-600';
};

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
        window.setAttachType('camera');
    } else {
        btnPeng.className = "py-2.5 px-3 rounded-xl border border-indigo-200 bg-indigo-50 text-indigo-700 font-semibold text-xs flex flex-col items-center justify-center space-y-1 shadow-sm";
        secShift.classList.add('hidden');
        secPeng.classList.remove('hidden');
        attachToggle.classList.remove('hidden');
    }
};

window.setAttachType = function(type) {
    currentAttachType = type;
    const toggleCam = document.getElementById('toggleCamBtn');
    const toggleFile = document.getElementById('toggleFileBtn');
    const containerCam = document.getElementById('containerCamera');
    const containerFile = document.getElementById('containerFileUpload');

    if (type === 'camera') {
        toggleCam.className = "px-2.5 py-1 rounded-md bg-white text-indigo-600 shadow-sm";
        toggleFile.className = "px-2.5 py-1 rounded-md text-gray-500 hover:text-gray-900";
        containerCam.classList.remove('hidden');
        containerFile.classList.add('hidden');
        CameraService.startWebcam('webcam', 'photoCanvas', 'btnCapture', 'btnRetake');
    } else {
        toggleFile.className = "px-2.5 py-1 rounded-md bg-white text-indigo-600 shadow-sm";
        toggleCam.className = "px-2.5 py-1 rounded-md text-gray-500 hover:text-gray-900";
        containerFile.classList.remove('hidden');
        containerCam.classList.add('hidden');
        CameraService.stopWebcam('webcam');
    }
};

window.updateCharCount = function() {
    const val = document.getElementById('textCatatan').value;
    document.getElementById('charCounter').textContent = `${val.length}/250`;
};

window.initGeolocation = function() {
    GeoService.initGeolocation('gpsLocationText');
};

window.takeSnapshot = function() {
    CameraService.takeSnapshot('webcam', 'photoCanvas', 'btnCapture', 'btnRetake');
};

window.resetCamera = function() {
    CameraService.resetCamera('webcam', 'photoCanvas', 'btnCapture', 'btnRetake');
};

window.handleFileSelected = function(event) {
    const file = event.target.files[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
        showToast('Ukuran file maksimal 2 MB!', 'error');
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
    document.getElementById('filePicker').value = '';
    document.getElementById('filePreviewBadge').classList.add('hidden');
    document.getElementById('filePreviewBadge').classList.remove('flex');
};

window.submitPresensi = async function() {
    const storeNama = document.getElementById('selectStore').value;
    const karyawanNama = document.getElementById('selectKaryawan').value;
    const shiftNama = document.getElementById('selectShift').value;
    const jenisPengajuan = document.getElementById('selectJenisPengajuan').value;
    const catatan = document.getElementById('textCatatan').value;
    const btnSubmit = document.getElementById('btnSubmitPresensi');
    const btnText = document.getElementById('btnSubmitText');

    if (!storeNama || !karyawanNama) {
        showToast('Pilih Cabang Store dan Nama Sales!', 'error');
        return;
    }

    let fileDataToSend = '';
    let fileNameToSend = '';
    let fileMimeToSend = '';

    if (currentAttachType === 'camera') {
        fileDataToSend = CameraService.getPhotoBase64();
        if (!fileDataToSend) {
            showToast('Foto Selfie WAJIB diambil!', 'error');
            return;
        }
    } else {
        if (!uploadedFileObj) {
            showToast('File Surat Dokter / Dokumen WAJIB diunggah!', 'error');
            return;
        }
        fileDataToSend = uploadedFileObj.base64;
        fileNameToSend = uploadedFileObj.name;
        fileMimeToSend = uploadedFileObj.type;
    }

    btnSubmit.disabled = true;
    btnText.textContent = 'MEMVALIDASI...';

    const lastStatus = await ApiService.checkTodayStatus(karyawanNama, storeNama);
    if (currentMode === 'Clock In' && (lastStatus === 'Clock In' || lastStatus.includes('Clock In'))) {
        showToast(`⚠️ Sales ${karyawanNama} SUDAH Clock In hari ini!`, 'error');
        btnSubmit.disabled = false;
        btnText.textContent = 'KIRIM PRESENSI SEKARANG';
        return;
    }

    btnText.textContent = 'MENGIRIM...';
    const isoTimestamp = new Date().toISOString();
    const statusFormatted = (currentMode === 'Pengajuan') ? `Pengajuan ${jenisPengajuan}` : currentMode;
    const approvalDefault = statusFormatted.includes("Pengajuan") ? "Pending" : "Auto-Approved";

    const supabasePayload = {
        timestamp: isoTimestamp,
        nama_store: storeNama,
        nama_karyawan: karyawanNama,
        jam_shift: (currentMode === 'Pengajuan') ? '-' : shiftNama,
        status_absen: statusFormatted,
        jenis_pengajuan: (currentMode === 'Pengajuan') ? jenisPengajuan : '-',
        catatan_keterangan: catatan || '-',
        lokasi_gps: GeoService.getCoords(),
        foto_drive_url: "Uploading Drive...",
        status_approval_hr: approvalDefault,
        alasan_penolakan_hr: "-"
    };

    const createdRecordId = await ApiService.submitToSupabase(supabasePayload);

    showToast('🎉 Presensi Berhasil Tersimpan!', 'success');
    document.getElementById('textCatatan').value = '';
    window.clearSelectedFile();
    window.resetCamera();
    await window.onKaryawanChange();

    btnSubmit.disabled = false;
    btnText.textContent = 'KIRIM PRESENSI SEKARANG';

    ApiService.submitToAppsScriptBackground({
        supabaseId: createdRecordId,
        timestamp: isoTimestamp,
        storeNama: storeNama,
        karyawanNama: karyawanNama,
        shiftNama: (currentMode === 'Pengajuan') ? '-' : shiftNama,
        status: statusFormatted,
        jenisPengajuan: (currentMode === 'Pengajuan') ? jenisPengajuan : '-',
        catatan: catatan || '-',
        gps: GeoService.getCoords(),
        fileBase64: fileDataToSend,
        fileName: fileNameToSend,
        fileMimeType: fileMimeToSend
    });
};

// -------------------------------------------------------------------------
// PORTAL HR HANDLERS
// -------------------------------------------------------------------------
window.verifyHrPin = async function() {
    const pin = document.getElementById('inputHrPin').value;
    if (!pin) return showToast('Masukkan PIN HR Admin!', 'error');

    const res = await ApiService.verifyHrPin(pin);
    if (res.status === 'success') {
        document.getElementById('hrAuthCard').classList.add('hidden');
        document.getElementById('hrDashboardContent').classList.remove('hidden');
        window.loadHrLogs();
        showToast('Login HR Berhasil!', 'success');
    } else showToast('🔒 PIN HR Salah!', 'error');
};

window.reconcileDeletedRows = async function() {
    showToast('Memproses sinkronisasi hapus...', 'success');
    const res = await ApiService.reconcileDelete();
    if (res.status === 'success') {
        showToast(res.message, 'success');
        window.loadHrLogs();
    }
};

window.loadHrLogs = async function() {
    const start = document.getElementById('filterStartDate').value;
    const end = document.getElementById('filterEndDate').value;
    const tbody = document.getElementById('tableHrLogsBody');
    tbody.innerHTML = '<tr><td colspan="6" class="text-center py-6 text-gray-500">Memuat Data...</td></tr>';

    const logs = await ApiService.fetchHrLogs(start, end);
    if (Array.isArray(logs) && logs.length > 0) {
        document.getElementById('logCountBadge').textContent = `${logs.length} Data`;
        renderHrLogsTable(logs);
    } else {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center py-6 text-gray-400">Tidak ada data.</td></tr>';
    }
};

function renderHrLogsTable(logs) {
    const tbody = document.getElementById('tableHrLogsBody');
    tbody.innerHTML = '';
    logs.forEach(row => {
        const tr = document.createElement('tr');
        tr.className = "hover:bg-gray-50 transition border-b border-gray-100";
        const dateFormatted = new Date(row.timestamp).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' });

        let badgeApproval = `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-gray-100 text-gray-600">${escapeHtml(row.status_approval_hr)}</span>`;
        if (row.status_approval_hr === 'DI ACC') badgeApproval = `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-green-100 text-green-700">DI ACC</span>`;
        if (row.status_approval_hr === 'DI REJECT') badgeApproval = `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-red-100 text-red-700">DI REJECT</span>`;

        let fileBtnHtml = `<span class="text-gray-400 text-[10px]">-</span>`;
        if (row.foto_drive_url && row.foto_drive_url.startsWith('http')) {
            fileBtnHtml = `<a href="${escapeHtml(row.foto_drive_url)}" target="_blank" class="text-xs text-indigo-600 font-bold underline flex items-center"><i class="fa-solid fa-file-lines mr-1"></i> Lihat File</a>`;
        }

        tr.innerHTML = `
            <td class="p-3 font-mono text-[11px] whitespace-nowrap">${dateFormatted}</td>
            <td class="p-3">
                <div class="font-bold text-gray-900">${escapeHtml(row.nama_karyawan)}</div>
                <div class="text-[10px] text-gray-500">${escapeHtml(row.nama_store)}</div>
            </td>
            <td class="p-3">
                <div class="font-semibold text-indigo-600">${escapeHtml(row.status_absen)}</div>
                <div class="text-[10px] text-gray-400">${escapeHtml(row.jam_shift)}</div>
            </td>
            <td class="p-3">${fileBtnHtml}</td>
            <td class="p-3">${badgeApproval}</td>
            <td class="p-3 text-center space-x-1 whitespace-nowrap">
                <button onclick="approveAction(${row.id}, '${escapeHtml(row.nama_karyawan)}', '${row.timestamp}')" class="bg-green-600 hover:bg-green-700 text-white font-bold px-2.5 py-1 rounded-lg text-[10px] transition shadow-sm">ACC</button>
                <button onclick="openRejectModal(${row.id}, '${escapeHtml(row.nama_karyawan)}', '${row.timestamp}')" class="bg-red-600 hover:bg-red-700 text-white font-bold px-2.5 py-1 rounded-lg text-[10px] transition shadow-sm">Tolak</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

window.approveAction = async function(recordId, karyawanNama, timestamp) {
    if (!confirm(`ACC pengajuan ${karyawanNama}?`)) return;
    await ApiService.updateApproval({ rowId: recordId, karyawanNama, timestamp, approvalStatus: 'Approved', alasanReject: '-' });
    showToast('Approval Berhasil!', 'success');
    window.loadHrLogs();
};

window.openRejectModal = function(recordId, karyawanNama, timestamp) {
    selectedRowForReject = { id: recordId, nama: karyawanNama, timestamp };
    document.getElementById('inputRejectReason').value = '';
    document.getElementById('rejectModal').classList.remove('hidden');
};

window.closeRejectModal = function() {
    selectedRowForReject = null;
    document.getElementById('rejectModal').classList.add('hidden');
};

window.confirmRejectAction = async function() {
    const reason = document.getElementById('inputRejectReason').value;
    if (!reason) return showToast('Alasan penolakan wajib diisi!', 'error');
    const target = selectedRowForReject;
    window.closeRejectModal();
    await ApiService.updateApproval({ rowId: target.id, karyawanNama: target.nama, timestamp: target.timestamp, approvalStatus: 'Rejected', alasanReject: reason });
    showToast('Penolakan Berhasil!', 'success');
    window.loadHrLogs();
};
