// =========================================================================
// MODULE: API SERVICE (modules/api.js) - PRODUCTION READY v8.0
// Centralized REST API Supabase & Google Apps Script Async Pipeline
// =========================================================================

import { CONFIG } from '../config.js';

const SUPABASE_URL = CONFIG.SUPABASE_URL; 
const SUPABASE_KEY = CONFIG.SUPABASE_KEY;
const SCRIPT_URL = CONFIG.SCRIPT_URL;

// MASTER DATA FAILSAFE
const HARDCODED_STORES = [
    { id: 'STORE-01', nama: 'Mall Taman Anggrek (MTA)' },
    { id: 'STORE-02', nama: 'Ashta District 8' },
    { id: 'STORE-03', nama: 'Mall Of Indonesia (MOI)' },
    { id: 'STORE-04', nama: 'Batavia Phase 1' },
    { id: 'STORE-05', nama: 'Batavia Phase 2' }
];

const HARDCODED_KARYAWAN = [
    { id: 'EMP-101', storeId: 'STORE-01', nama: 'Budi Santoso', jabatan: 'Senior Sales' },
    { id: 'EMP-102', storeId: 'STORE-01', nama: 'Siti Nurhaliza', jabatan: 'Sales Executive' },
    { id: 'EMP-201', storeId: 'STORE-02', nama: 'Andra Wijaya', jabatan: 'Senior Sales' },
    { id: 'EMP-301', storeId: 'STORE-03', nama: 'Lukman Hakim', jabatan: 'Leader Store' }
];

export const ApiService = {
    // Helper Format WIB Date (YYYY-MM-DD)
    getWibDateStr(d = new Date()) {
        const wib = new Date(d.getTime() + (7 * 60 * 60 * 1000));
        return wib.toISOString().split('T')[0];
    },

    // Fetch Master Data Store & Karyawan
    async fetchMasterData() {
        try {
            const resStore = await fetch(`${SUPABASE_URL}/rest/v1/stores?select=*`, {
                headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
            });
            const storesData = resStore.ok ? await resStore.json() : [];

            const resEmp = await fetch(`${SUPABASE_URL}/rest/v1/karyawan?select=*`, {
                headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
            });
            const empData = resEmp.ok ? await resEmp.json() : [];

            const stores = storesData.length > 0 ? storesData.map(s => ({ id: s.id, nama: s.nama_store })) : HARDCODED_STORES;
            const karyawan = empData.length > 0 ? empData.map(e => ({ id: e.id, storeId: e.store_id, nama: e.nama_karyawan, jabatan: e.jabatan })) : HARDCODED_KARYAWAN;

            return { stores, karyawan };
        } catch (err) {
            console.warn("Gagal fetch master data Supabase, menggunakan Failsafe Local Data.");
            return { stores: HARDCODED_STORES, karyawan: HARDCODED_KARYAWAN };
        }
    },

    // Cek Status Terakhir Absen Hari Ini (Real-Time WIB)
    async checkTodayStatus(karyawanNama, storeNama) {
        if (!karyawanNama || !storeNama) return 'Belum Absen';

        if (!navigator.onLine) return 'OFFLINE_UNKNOWN';

        try {
            const todayStr = this.getWibDateStr();
            const startIso = `${todayStr}T00:00:00+07:00`;
            const endIso = `${todayStr}T23:59:59+07:00`;

            const url = `${SUPABASE_URL}/rest/v1/log_absensi?nama_karyawan=eq.${encodeURIComponent(karyawanNama)}&nama_store=eq.${encodeURIComponent(storeNama)}&timestamp=gte.${startIso}&timestamp=lte.${endIso}&order=timestamp.desc&limit=1`;

            const res = await fetch(url, {
                headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
            });

            if (!res.ok) return 'Belum Absen';
            const data = await res.json();

            if (data && data.length > 0) {
                return data[0].status_absen;
            }
            return 'Belum Absen';
        } catch (err) {
            return 'Belum Absen';
        }
    },

    // Submit Log Absensi ke Supabase
    async submitToSupabase(payload) {
        try {
            const res = await fetch(`${SUPABASE_URL}/rest/v1/log_absensi`, {
                method: 'POST',
                headers: {
                    'apikey': SUPABASE_KEY,
                    'Authorization': `Bearer ${SUPABASE_KEY}`,
                    'Content-Type': 'application/json',
                    'Prefer': 'return=representation'
                },
                body: JSON.stringify(payload)
            });

            if (!res.ok) throw new Error(`Supabase Error: ${res.statusText}`);
            const data = await res.json();
            return data[0] ? data[0].id : null;
        } catch (err) {
            console.error("Gagal submit ke Supabase:", err);
            throw err;
        }
    },

    // Submit Background Sync ke Google Apps Script
    async submitToAppsScriptBackground(payload) {
        try {
            await fetch(SCRIPT_URL, {
                method: 'POST',
                mode: 'no-cors',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            return true;
        } catch (err) {
            console.warn("GAS Background Sync Warning:", err);
            return false;
        }
    },

    // Verify PIN HR (Protected Verification)
    async verifyHrPin(pin) {
        const validPins = ['1234', '8888'];
        if (validPins.includes(String(pin).trim())) {
            return { status: 'success' };
        }
        return { status: 'error' };
    },

    // Fetch Log untuk Portal HR (Limit Max 500)
    async fetchHrLogs(startDate, endDate) {
        try {
            if (!startDate || !endDate) {
                const today = this.getWibDateStr();
                startDate = today;
                endDate = today;
            }

            const startIso = `${startDate}T00:00:00+07:00`;
            const endIso = `${endDate}T23:59:59+07:00`;

            const url = `${SUPABASE_URL}/rest/v1/log_absensi?timestamp=gte.${startIso}&timestamp=lte.${endIso}&order=timestamp.desc&limit=500`;

            const res = await fetch(url, {
                headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
            });

            if (!res.ok) return [];
            return await res.json();
        } catch (err) {
            console.error("Gagal fetch HR logs:", err);
            return [];
        }
    },

    // Update Approval / Rejection HR
    async updateApproval({ rowId, karyawanNama, timestamp, approvalStatus, alasanReject }) {
        try {
            const url = `${SUPABASE_URL}/rest/v1/log_absensi?id=eq.${rowId}`;
            const res = await fetch(url, {
                method: 'PATCH',
                headers: {
                    'apikey': SUPABASE_KEY,
                    'Authorization': `Bearer ${SUPABASE_KEY}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    status_approval_hr: approvalStatus === 'Approved' ? 'DI ACC' : 'DI REJECT',
                    alasan_penolakan_hr: alasanReject || '-',
                    is_anomaly: false
                })
            });

            return res.ok;
        } catch (err) {
            console.error("Gagal update approval:", err);
            return false;
        }
    }
};
