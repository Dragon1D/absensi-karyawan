// =========================================================================
// MODULE: API SERVICE (modules/api.js)
// Handles REST API Supabase & Google Apps Script Async Pipeline
// =========================================================================

const SUPABASE_URL = "https://xebsggtlqkiteikdqsbd.supabase.co"; 
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhlYnNnZ3RscWtpdGVpa2Rxc2JkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA3MzI4MTksImV4cCI6MjEwNjMwODgxOX0.vx5jr40zbgAguRzwOtk48x9Iq6JrMOmtPqqtB5oucCk";
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
            if (data.status === 'success' && Array.isArray(data.stores) && data.stores.length >
