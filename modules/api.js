// =========================================================================
// MODULE: API SERVICE (modules/api.js) - WITH LEAVE BALANCE & FILE ONLY
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
    { id: 'EMP-101', storeId: 'STORE-01', nama: 'Budi Santoso', jabatan: 'Senior Sales', sisaCuti: 12 },
    { id: 'EMP-102', storeId: 'STORE-01', nama: 'Siti Nurhaliza', jabatan: 'Sales Executive', sisaCuti: 10 },
    { id: 'EMP-201', storeId: 'STORE-02', nama: 'Andra Wijaya', jabatan: 'Senior Sales', sisaCuti: 8 },
    { id: 'EMP-301', storeId: 'STORE-03', nama: 'Lukman Hakim', jabatan: 'Leader Store', sisaCuti: 12 }
];

export const ApiService = {
    getWibDateStr(d = new Date()) {
        const wib = new Date(d.getTime() + (7 * 60 * 60 * 1000));
        return wib.toISOString().split('T')[0];
    },

    // Fetch Master Data Store & Karyawan (termasuk Sisa Cuti)
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
            const karyawan = empData.length > 0 ? empData.map(e => ({ 
                id: e.id, 
                storeId: e.store_id, 
                nama: e.nama_karyawan, 
                jabatan: e.jabatan,
                sisaCuti: e.sisa_cuti !== undefined ? e.sisa_cuti : 12
            })) : HARDCODED_KARYAWAN;

            return { stores, karyawan };
        } catch (err) {
            console.warn("Gagal fetch master data Supabase, menggunakan Failsafe Local Data.");
            return { stores: HARDCODED_STORES, karyawan: HARDCODED_KARYAWAN };
        }
    },

    // Cek Status Terakhir Absen Hari Ini
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
            return (data && data.length > 0) ? data[0].status_absen : 'Belum Absen';
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

    // Potong Sisa Cuti Karyawan saat HR Approve Cuti
    async deductLeaveBalance(karyawanNama) {
        try {
            // Fetch Sisa Cuti saat ini
            const resEmp = await fetch(`${SUPABASE_URL}/rest/v1/karyawan?nama_karyawan=eq.${encodeURIComponent(karyawanNama)}`, {
                headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
            });
            if (!resEmp.ok) return;
            const empData = await resEmp.json();
            if (!empData || empData.length === 0) return;

            const currentBalance = empData[0].sisa_cuti || 12;
            const newBalance = Math.max(0, currentBalance - 1);

            // Update Sisa Cuti Baru
            await fetch(`${SUPABASE_URL}/rest/v1/karyawan?id=eq.${empData[0].id}`, {
                method: 'PATCH',
                headers: {
                    'apikey': SUPABASE_KEY,
                    'Authorization': `Bearer ${SUPABASE_KEY}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ sisa_cuti: newBalance })
            });
        } catch (err) {
            console.error("Gagal update sisa cuti:", err);
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
            return false;
        }
    },

    // Verify PIN HR
    async verifyHrPin(pin) {
        const validPins = ['1234', '8888'];
        return validPins.includes(String(pin).trim()) ? { status: 'success' } : { status: 'error' };
    },

    // Fetch Log HR
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
            return [];
        }
    },

    // Update Approval / Rejection HR
    async updateApproval({ rowId, karyawanNama, approvalStatus, alasanReject, jenisPengajuan }) {
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

            // Jika Pengajuan Cuti di-ACC, potong jatah cuti karyawan
            if (res.ok && approvalStatus === 'Approved' && jenisPengajuan && jenisPengajuan.includes('Cuti')) {
                await this.deductLeaveBalance(karyawanNama);
            }

            return res.ok;
        } catch (err) {
            return false;
        }
    }
};
