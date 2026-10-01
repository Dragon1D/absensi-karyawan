// =========================================================================
// MODULE: API SERVICE (modules/api.js) - STRICT STATE MACHINE
// Centralized REST API Supabase & Google Apps Script Async Pipeline
// =========================================================================

import { CONFIG } from '../config.js';

const SUPABASE_URL = CONFIG.SUPABASE_URL; 
const SUPABASE_KEY = CONFIG.SUPABASE_KEY;
const SCRIPT_URL = CONFIG.SCRIPT_URL;

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
    // Dapatkan awal & akhir hari WIB dalam UTC ISO String
    getWibDayBounds(d = new Date()) {
        const wibOffsetMs = 7 * 60 * 60 * 1000;
        const wibDate = new Date(d.getTime() + wibOffsetMs);
        const yyyy = wibDate.getUTCFullYear();
        const mm = String(wibDate.getUTCMonth() + 1).padStart(2, '0');
        const dd = String(wibDate.getUTCDate()).padStart(2, '0');
        
        const startIso = new Date(Date.UTC(yyyy, wibDate.getUTCMonth(), dd, 0 - 7, 0, 0)).toISOString();
        const endIso = new Date(Date.UTC(yyyy, wibDate.getUTCMonth(), dd, 23 - 7, 59, 59)).toISOString();
        
        return { startIso, endIso };
    },

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
                id: e.id, storeId: e.store_id, nama: e.nama_karyawan, jabatan: e.jabatan, sisaCuti: e.sisa_cuti ?? 12
            })) : HARDCODED_KARYAWAN;

            return { stores, karyawan };
        } catch (err) {
            return { stores: HARDCODED_STORES, karyawan: HARDCODED_KARYAWAN };
        }
    },

    // Pengecekan Detail Riwayat Absen Hari Ini (Clock In, Clock Out, & Shift)
    async checkTodayStatusDetail(karyawanNama, storeNama) {
        if (!karyawanNama || !storeNama) {
            return { status: 'Belum Absen', hasClockIn: false, hasClockOut: false, clockInShift: null };
        }
        if (!navigator.onLine) {
            return { status: 'OFFLINE_UNKNOWN', hasClockIn: false, hasClockOut: false, clockInShift: null };
        }

        try {
            const cleanEmp = karyawanNama.trim();
            const cleanStore = storeNama.trim();
            const { startIso, endIso } = this.getWibDayBounds();

            const url = `${SUPABASE_URL}/rest/v1/log_absensi?nama_karyawan=eq.${encodeURIComponent(cleanEmp)}&nama_store=eq.${encodeURIComponent(cleanStore)}&timestamp=gte.${startIso}&timestamp=lte.${endIso}&order=timestamp.desc&limit=10`;

            const res = await fetch(url, {
                headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
            });

            if (!res.ok) throw new Error("Gagal mengambil status presensi");
            const data = await res.json();

            if (!data || data.length === 0) {
                return { status: 'Belum Absen', hasClockIn: false, hasClockOut: false, clockInShift: null };
            }

            const clockInRec = data.find(r => r.status_absen === 'Clock In' || r.status_absen.includes('Clock In'));
            const clockOutRec = data.find(r => r.status_absen === 'Clock Out' || r.status_absen.includes('Clock Out'));
            const lastRec = data[0];

            return {
                status: lastRec.status_absen,
                hasClockIn: !!clockInRec,
                hasClockOut: !!clockOutRec,
                clockInShift: clockInRec ? clockInRec.jam_shift : null
            };
        } catch (err) {
            console.error("Check Today Status Error:", err);
            return { status: 'ERROR_CHECKING', hasClockIn: false, hasClockOut: false, clockInShift: null };
        }
    },

    async submitToSupabase(payload) {
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

        if (!res.ok) throw new Error(`Supabase Insert Failed: ${res.statusText}`);
        const data = await res.json();
        return data[0] ? data[0].id : null;
    },

    async deductLeaveBalance(karyawanNama) {
        try {
            const cleanEmp = karyawanNama.trim();
            const resEmp = await fetch(`${SUPABASE_URL}/rest/v1/karyawan?nama_karyawan=eq.${encodeURIComponent(cleanEmp)}`, {
                headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
            });
            if (!resEmp.ok) return;
            const empData = await resEmp.json();
            if (!empData || empData.length === 0) return;

            const currentBalance = empData[0].sisa_cuti ?? 12;
            const newBalance = Math.max(0, currentBalance - 1);

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
            console.error("Deduct leave balance error:", err);
        }
    },

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

    async verifyHrPin(pin) {
        return (pin === '1234' || pin === '8888') ? { status: 'success' } : { status: 'error' };
    },

    async fetchHrLogs(startDate, endDate) {
        try {
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

            if (res.ok && approvalStatus === 'Approved' && jenisPengajuan && jenisPengajuan.includes('Cuti')) {
                await this.deductLeaveBalance(karyawanNama);
            }

            return res.ok;
        } catch (err) {
            return false;
        }
    }
};
