// =========================================================================
// APP CONTROLLER (app.js)
// Orchestrates UI Event Handlers & Integrates ES Modules
// =========================================================================

import { ApiService } from './modules/api.js';
import { CameraService } from './modules/camera.js';
import { GeoService } from './modules/geo.js';

// State Management
let currentMode = 'Clock In';
let currentAttachType = 'camera';
let masterStores = [];
let masterKaryawan = [];
let uploadedFileObj = null;
let selectedRowForReject = null;

// Helper: Escape HTML string
function escapeHtml(str) {
    return String(str || '').replace(/&/g, '&').replace(/</g, '<').replace(/>/g, '>').replace(/"/g, '"');
}

// Helper: Format Tanggal WIB
function getWibDateString(date = new Date()) {
    const wibDate = new Date(date.getTime() + (7 * 60 * 60 * 1000));
    return wibDate.toISOString().split('T')[0];
}

// Toast Notification
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

// Initializer
window.addEventListener('DOMContentLoaded', async () => {
    const today = getWibDateString();
    if (document.getElementById('filterStartDate')) document.getElementById('filterStartDate').value = today;
    if (document.getElementById('filterEndDate')) document.getElementById('filterEndDate').value = today;

    // Load Master Data
    const data = await ApiService.fetchMasterData();
    masterStores = data.stores;
    masterKaryawan = data.karyawan;
    populateStoreDropdown();

    // Init GPS & Camera
    GeoService.initGeolocation('gpsLocationText');
    CameraService.startWebcam('webcam', 'photoCanvas', 'btnCapture', 'btnRetake');
});

window.addEventListener('beforeunload', () => {
    CameraService.stopWebcam('webcam');
});

// Expose Handlers to Window Scope for Inline HTML Listeners
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
        btnPeng.className = "py-2.5 px-3 rounded-xl border border-indigo-200 bg-indigo-50 text-indigo-700 font-semibold text-xs flex flex-col items-center justify-
