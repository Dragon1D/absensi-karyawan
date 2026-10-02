// =========================================================================
// MODULE: API SERVICE (modules/api.js) - STRICT STATUS BINDING & RECALC
// Production-Grade Architecture for Demo & Live Operational Stability
// =========================================================================

import { CONFIG } from '../config.js';

const SUPABASE_URL = CONFIG.SUPABASE_URL; 
const SUPABASE_KEY = CONFIG.SUPABASE_KEY;
const SCRIPT_URL = CONFIG.SCRIPT_URL;

const HEADERS = {
    'apikey': SUPABASE_KEY,
    'Authorization': `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json',
    'Prefer': 'return=representation'
};

const HARDCODED_STORES = [
    { id: 'STORE-01', nama: 'Mall Taman Anggrek (MTA)' },
    { id: 'STORE-02', nama: 'Ashta District 8' },
    { id: 'STORE-03', nama: 'Mall Of Indonesia (MOI)' },
    { id: 'STORE-04', nama: 'Batavia Phase 1' },
    { id: 'STORE-05', nama: 'Batavia Phase 2' }
];

const HARDCODED_KARYAWAN = [
    { id: 'EMP-101', storeId: 'STORE-01', nama: 'Budi Santoso', jabatan: 'Senior Sales', sisaCuti: 12 },
    { id: 'EMP-102', storeId: 'STORE-01', nama: 'Siti Nurhaliza', jabatan: 'Sales Executive', sisaCuti: 12 },
    { id: 'EMP-201', storeId: 'STORE-02', nama: 'Dian Sastro', jabatan: 'Senior Sales', sisaCuti: 12 },
    { id: 'EMP-301', storeId: 'STORE-03', nama: 'Lukman Hakim', jabatan: 'Leader Store', sisaCuti: 12 },
    { id: 'EMP-501', storeId: 'STORE-05', nama: 'Fiersa Besari', jabatan: 'Sales Executive', sisaCuti: 12 }
];

export const ApiService = {
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

    // SINKRONISASI & REKALKULASI CUTI DINAMIS DARI DATABASE SUPABASE
    async syncSisaCuti(karyawanNama) {
        if (!karyawanNama) return 12;
        try {
            const cleanEmp = karyawanNama.trim();
            
            // Ambil hanya log absensi karyawan terkait yang berstatus DI ACC / Approved
            const url = `${SUPABASE_URL}/rest/v1/log_absensi?nama_karyawan=eq.${encodeURIComponent(cleanEmp)}&select=status_absen,jenis_pengajuan,status_approval_hr`;
            const res = await fetch(url, { headers: HEADERS, cache: 'no-store' });
            
            let totalCutiTerpakai = 0;
            if (res.ok) {
                const logs = await res.json();
                logs.forEach(log => {
                    const statusApp = log.status_approval_hr || '';
                    const isApproved = (statusApp === 'DI ACC' || statusApp === 'Auto-Approved' || statusApp === 'Approved');
                    const jenis = log.jenis_pengajuan || log.status_absen || '';
                    
                    // Hanya hitung jika status BENAR-BENAR DI ACC
                    if (isApproved && jenis.includes('Cuti')) {
                        const match = jenis.match(/\((\d+)\s*Hari\)/);
                        const days = match ? parseInt(match[1]) : 1;
                        totalCutiTerpakai += days;
                    }
                });
            }

            const sisaCutiTerhitung = Math.max(0, 12 - totalCutiTerpakai);

            // Update hasil hitung ke tabel karyawan
            const resEmp = await fetch(`${SUPABASE_URL}/rest/v1/karyawan?nama_karyawan=eq.${encodeURIComponent(cleanEmp)}`, { headers: HEADERS, cache: 'no-store' });
            if (resEmp.ok) {
                const empData = await resEmp.json();
                if (empData && empData.length > 0) {
                    await fetch(`${SUPABASE_URL}/rest/v1/karyawan?id=eq.${encodeURIComponent(empData[0].id)}`, {
                        method: 'PATCH',
                        headers: HEADERS,
                        body: JSON.stringify({ sisa_cuti: sisaCutiTerhitung })
                    });
                }
            }

            return sisaCutiTerhitung;
        } catch (err) {
            console.error("Error syncSisaCuti:", err);
            return 12;
        }
    },

    async fetchMasterData() {
        try {
            const [resStore, resEmp] = await Promise.all([
                fetch(`${SUPABASE_URL}/rest/v1/stores?select=*`, { headers: HEADERS, cache: 'no-store' }),
                fetch(`${SUPABASE_URL}/rest/v1/karyawan?select=*`, { headers: HEADERS, cache: 'no-store' })
            ]);

            const storesData = resStore.ok ? await resStore.json() : [];
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

    async checkTodayStatusDetail(karyawanNama, storeNama) {
        if (!karyawanNama || !storeNama) {
            return { status: 'Belum Absen', hasClockIn: false, hasClockOut: false, hasPengajuan: false, clockInShift: null, pengajuanType: null, approvalStatus: null };
        }
        if (!navigator.onLine) {
            return { status: 'OFFLINE_UNKNOWN', hasClockIn: false, hasClockOut: false, hasPengajuan: false, clockInShift: null, pengajuanType: null, approvalStatus: null };
        }

        try {
            const cleanEmp = karyawanNama.trim();
            const cleanStore = storeNama.trim();
            const { startIso, endIso } = this.getWibDayBounds();

            const url = `${SUPABASE_URL}/rest/v1/log_absensi?nama_karyawan=eq.${encodeURIComponent(cleanEmp)}&nama_store=eq.${encodeURIComponent(cleanStore)}&timestamp=gte.${encodeURIComponent(startIso)}&timestamp=lte.${encodeURIComponent(endIso)}&order=timestamp.desc&limit=10`;

            const res = await fetch(url, { headers: HEADERS, cache: 'no-store' });

            if (!res.ok) throw new Error("Gagal mengambil status presensi");
            const data = await res.json();

            // Selalu dapatkan angka sisa cuti paling presisi langsung dari DB
            const sisaCutiFresh = await this.syncSisaCuti(cleanEmp);

            if (!data || data.length === 0) {
                return { status: 'Belum Absen', hasClockIn: false, hasClockOut: false, hasPengajuan: false, clockInShift: null, pengajuanType: null, approvalStatus: null, sisaCuti: sisaCutiFresh };
            }

            const clockInRec = data.find(r => r.status_absen === 'Clock In' || r.status_absen.includes('Clock In'));
            const clockOutRec = data.find(r => r.status_absen === 'Clock Out' || r.status_absen.includes('Clock Out'));
            const pengajuanRec = data.find(r => r.status_absen.includes('Pengajuan') || (r.jenis_pengajuan && r.jenis_pengajuan !== '-'));
            const lastRec = data[0];

            return {
                status: lastRec.status_absen,
                hasClockIn: !!clockInRec,
                hasClockOut: !!clockOutRec,
                hasPengajuan: !!pengajuanRec,
                clockInShift: clockInRec ? clockInRec.jam_shift : null,
                pengajuanType: pengajuanRec ? pengajuanRec.jenis_pengajuan : null,
                approvalStatus: pengajuanRec ? pengajuanRec.status_approval_hr : lastRec.status_approval_hr,
                sisaCuti: sisaCutiFresh
            };
        } catch (err) {
            return { status: 'ERROR_CHECKING', hasClockIn: false, hasClockOut: false, hasPengajuan: false, clockInShift: null, pengajuanType: null, approvalStatus: null };
        }
    },

    async submitToSupabase(payload) {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/log_absensi`, {
            method: 'POST',
            headers: HEADERS,
            body: JSON.stringify(payload)
        });

        if (!res.ok) throw new Error(`Supabase Insert Failed: ${res.statusText}`);
        const data = await res.json();
        return data[0] ? data[0].id : null;
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
            const startIso = encodeURIComponent(`${startDate}T00:00:00+07:00`);
            const endIso = encodeURIComponent(`${endDate}T23:59:59+07:00`);

            const url = `${SUPABASE_URL}/rest/v1/log_absensi?timestamp=gte.${startIso}&timestamp=lte.${endIso}&order=timestamp.desc&limit=500`;

            const res = await fetch(url, { headers: HEADERS, cache: 'no-store' });

            if (!res.ok) return [];
            return await res.json();
        } catch (err) {
            return [];
        }
    },

    // EKSEKUSI UPDATE APPROVAL DENGAN VERIFIKASI STRICT STRINGS
    async updateApproval({ rowId, karyawanNama, targetStatus, alasanReject }) {
        try {
            const numericId = Number(rowId);
            const queryId = !isNaN(numericId) ? numericId : rowId;
            const url = `${SUPABASE_URL}/rest/v1/log_absensi?id=eq.${queryId}`;

            // Konsistensi String Mutlak: 'DI ACC' atau 'DI REJECT'
            const validStatus = (targetStatus === 'DI ACC' || targetStatus === 'Approved') ? 'DI ACC' : 'DI REJECT';

            const resLog = await fetch(url, {
                method: 'PATCH',
                headers: HEADERS,
                body: JSON.stringify({
                    status_approval_hr: validStatus,
                    alasan_penolakan_hr: alasanReject || '-',
                    is_anomaly: false
                })
            });

            if (!resLog.ok) {
                console.error("Supabase PATCH Error:", await resLog.text());
                return false;
            }

            const updatedRows = await resLog.json();
            if (!updatedRows || updatedRows.length === 0) {
                console.error("0 Rows updated in log_absensi! Cek ID atau RLS Policy.");
                return false;
            }

            // Hitung ulang dan sinkronkan sisa cuti berdasarkan data DB terbaru
            await this.syncSisaCuti(karyawanNama);

            // Log ke Google Sheets (Read-Only Async Background)
            this.submitToAppsScriptBackground({
                action: 'update_approval',
                rowId: rowId,
                approvalStatus: validStatus,
                alasanReject: alasanReject || '-'
            });

            return true;
        } catch (err) {
            console.error("Update approval error:", err);
            return false;
        }
    }
};
