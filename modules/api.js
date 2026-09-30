// =========================================================================
// MODULE: API SERVICE (modules/api.js)
// Handles REST API Supabase & Google Apps Script Async Pipeline
// =========================================================================

const SUPABASE_URL = "https://xebsggtlqkiteikdqsbd.supabase.co"; 
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhlYnNnZ3RscWtpdGVpa2Rxc2JkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA3MzI4MTksImV4cCI6MjEwNjMwODgxOX0.vx5jr40zbgAguRzwOmtPqqtB5oucCk";
const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbysnYJNbtypJLXnG9OzVJF7Q9X1uMl9kjqzR_ukg-Jnq4GKGNHnbOAQbqrPd3FEvfu0/exec';

// HARDCODED FAILSAFE MASTER DATA
const HARDCODED_STORES = [
    { id: "STORE-01", nama: "Mall Taman Anggrek (MTA)" },
    { id: "STORE-02", nama: "Ashta District 8" },
    { id: "STORE-03", nama: "Mall Of Indonesia (MOI)" },
    { id: "STORE-04", nama: "Batavia Phase 1" },
    { id: "STORE-05", nama: "Batavia Phase 2" }
];

const HARDCODED_KARYAWAN = [
    { id: "EMP-101", storeId: "STORE-01", nama: "Budi Santoso", jabatan: "Senior Sales" },
    { id: "EMP-102", storeId: "STORE-01", nama: "Siti Nurhaliza", jabatan: "Sales Executive" },
    { id: "EMP-103", storeId: "STORE-01", nama: "Ahmad Fauzi", jabatan: "Sales Executive" },
    { id: "EMP-104", storeId: "STORE-01", nama: "Rina Anggraini", jabatan: "Junior Sales" },
    { id: "EMP-105", storeId: "STORE-01", nama: "Dewa Pratama", jabatan: "Junior Sales" },
    { id: "EMP-106", storeId: "STORE-01", nama: "Maya Putri", jabatan: "Junior Sales" },
    { id: "EMP-107", storeId: "STORE-01", nama: "Rizky Ramadhan", jabatan: "Leader Store" },
    { id: "EMP-108", storeId: "STORE-01", nama: "Fitri Handayani", jabatan: "Cashier/Sales" },
    { id: "EMP-201", storeId: "STORE-02", nama: "Andra Wijaya", jabatan: "Senior Sales" },
    { id: "EMP-202", storeId: "STORE-02", nama: "Dian Sastro", jabatan: "Sales Executive" },
    { id: "EMP-203", storeId: "STORE-02", nama: "Eko Prasetyo", jabatan: "Sales Executive" },
    { id: "EMP-204", storeId: "STORE-02", nama: "Gita Gutawa", jabatan: "Junior Sales" },
    { id: "EMP-205", storeId: "STORE-02", nama: "Hendra Setiawan", jabatan: "Junior Sales" },
    { id: "EMP-206", storeId: "STORE-02", nama: "Indah Permata", jabatan: "Junior Sales" },
    { id: "EMP-207", storeId: "STORE-02", nama: "Joko Widodo", jabatan: "Leader Store" },
    { id: "EMP-208", storeId: "STORE-02", nama: "Kartika Putri", jabatan: "Cashier/Sales" },
    { id: "EMP-301", storeId: "STORE-03", nama: "Lukman Hakim", jabatan: "Senior Sales" },
    { id: "EMP-302", storeId: "STORE-03", nama: "Mega Lestari", jabatan: "Sales Executive" },
    { id: "EMP-303", storeId: "STORE-03", nama: "Naufal Azhar", jabatan: "Sales Executive" },
    { id: "EMP-304", storeId: "STORE-03", nama: "Olivia Jensen", jabatan: "Junior Sales" },
    { id: "EMP-305", storeId: "STORE-03", nama: "Pandu Perkasa", jabatan: "Junior Sales" },
    { id: "EMP-306", storeId: "STORE-03", nama: "Qori Sandioriva", jabatan: "Junior Sales" },
    { id: "EMP-307", storeId: "STORE-03", nama: "Raditya Dika", jabatan: "Leader Store" },
    { id: "EMP-308", storeId: "STORE-03", nama: "Siska Kohl", jabatan: "Cashier/Sales" },
    { id: "EMP-401", storeId: "STORE-04", nama: "Taufik Hidayat", jabatan: "Senior Sales" },
    { id: "EMP-402", storeId: "STORE-04", nama: "Utama Putra", jabatan: "Sales Executive" }
];

function getWibDateString(date = new Date()) {
    const wibDate = new Date(date.getTime() + (7 * 60 * 60 * 1000));
    return wibDate.toISOString().split('T')[0];
}

export const ApiService = {
    // 1. Fetch Master Data (Quad-Fallback Engine)
    async fetchMasterData() {
        try {
            const res = await fetch(SCRIPT_URL);
            const data = await res.json();
            if (data.status === 'success' && Array.isArray(data.stores) && data.stores.length > 0) {
                return { stores: data.stores, karyawan: data.karyawan || [] };
            }
        } catch (err) {}

        try {
            const headers = { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` };
            const [resS, resE] = await Promise.all([
                fetch(`${SUPABASE_URL}/rest/v1/stores?select=id,nama_store&order=id.asc`, { headers }),
                fetch(`${SUPABASE_URL}/rest/v1/karyawan?select=id,store_id,nama_karyawan,jabatan&order=id.asc`, { headers })
            ]);
            const stores = await resS.json();
            const karyawan = await resE.json();

            if (Array.isArray(stores) && stores.length > 0) {
                return {
                    stores: stores.map(s => ({ id: s.id, nama: s.nama_store })),
                    karyawan: karyawan.map(k => ({ id: k.id, storeId: k.store_id, nama: k.nama_karyawan, jabatan: k.jabatan }))
                };
            }
        } catch (err) {}

        return { stores: HARDCODED_STORES, karyawan: HARDCODED_KARYAWAN };
    },

    // 2. Check Status Absen Hari Ini (Strict Anti-Duplikat)
    async checkTodayStatus(karyawanNama, storeNama) {
        if (!karyawanNama || !storeNama) return 'Belum Dipilih';
        const todayWib = getWibDateString();
        try {
            const headers = { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` };
            const url = `${SUPABASE_URL}/rest/v1/log_absensi?nama_karyawan=eq.${encodeURIComponent(karyawanNama)}&nama_store=eq.${encodeURIComponent(storeNama)}&timestamp=gte.${todayWib}T00:00:00Z&select=status_absen&order=timestamp.desc&limit=1`;
            
            const res = await fetch(url, { headers });
            const rows = await res.json();
            if (Array.isArray(rows) && rows.length > 0) {
                return rows[0].status_absen;
            }
        } catch (err) {}
        return 'Belum Absen';
    },

    // 3. Direct Insert Supabase (<200ms)
    async submitToSupabase(payload) {
        const headers = {
            'apikey': SUPABASE_KEY,
            'Authorization': `Bearer ${SUPABASE_KEY}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=representation'
        };
        const res = await fetch(`${SUPABASE_URL}/rest/v1/log_absensi`, {
            method: 'POST',
            headers,
            body: JSON.stringify(payload)
        });
        if (res.ok) {
            const insertedRow = await res.json();
            return (Array.isArray(insertedRow) && insertedRow.length > 0) ? insertedRow[0].id : null;
        }
        return null;
    },

    // 4. Async Background Backup to Google Apps Script
    submitToAppsScriptBackground(payload) {
        fetch(SCRIPT_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain' },
            body: JSON.stringify(payload)
        }).catch(() => {});
    },

    // 5. Verify HR PIN
    async verifyHrPin(pin) {
        const res = await fetch(SCRIPT_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain' },
            body: JSON.stringify({ action: 'verify_pin', pin })
        });
        return await res.json();
    },

    // 6. Fetch Logs untuk Portal HR
    async fetchHrLogs(startDate, endDate) {
        const headers = { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` };
        const url = `${SUPABASE_URL}/rest/v1/log_absensi?timestamp=gte.${startDate}T00:00:00Z&timestamp=lte.${endDate}T23:59:59Z&order=timestamp.asc`;
        const res = await fetch(url, { headers });
        return await res.json();
    },

    // 7. Update Approval HR Status
    async updateApproval(payload) {
        const res = await fetch(SCRIPT_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain' },
            body: JSON.stringify({ action: 'update_approval', ...payload })
        });
        return await res.json();
    },

    // 8. Reconcile Delete
    async reconcileDelete() {
        const res = await fetch(SCRIPT_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain' },
            body: JSON.stringify({ action: 'reconcile_delete' })
        });
        return await res.json();
    }
};
