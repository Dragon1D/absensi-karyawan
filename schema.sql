-- =========================================================================
-- DATABASE SCHEMA: PORTAL ABSENSI STORE SYSTEM (v8.0)
-- Target Database: PostgreSQL / Supabase
-- =========================================================================

-- 1. TABEL UTAMA: LOG ABSENSI
CREATE TABLE IF NOT EXISTS public.log_absensi (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    timestamp timestamptz NOT NULL,
    nama_store text,
    nama_karyawan text,
    jam_shift text,
    status_absen text,
    jenis_pengajuan text,
    catatan_keterangan text,
    lokasi_gps text,
    foto_drive_url text,
    status_approval_hr text DEFAULT 'Auto-Approved',
    alasan_penolakan_hr text DEFAULT '-'
);

-- Non-aktifkan RLS untuk kemudahan API Anon Key
ALTER TABLE public.log_absensi DISABLE ROW LEVEL SECURITY;


-- 2. TABEL MASTER: STORES (CABANG TOKO)
CREATE TABLE IF NOT EXISTS public.stores (
    id text PRIMARY KEY,
    nama_store text NOT NULL
);

ALTER TABLE public.stores DISABLE ROW LEVEL SECURITY;


-- 3. TABEL MASTER: KARYAWAN (SALES)
CREATE TABLE IF NOT EXISTS public.karyawan (
    id text PRIMARY KEY,
    store_id text REFERENCES public.stores(id) ON DELETE CASCADE,
    nama_karyawan text NOT NULL,
    jabatan text
);

ALTER TABLE public.karyawan DISABLE ROW LEVEL SECURITY;


-- 4. INITIAL SEED DATA (MASTER STORES)
INSERT INTO public.stores (id, nama_store) VALUES
('STORE-01', 'Mall Taman Anggrek (MTA)'),
('STORE-02', 'Ashta District 8'),
('STORE-03', 'Mall Of Indonesia (MOI)'),
('STORE-04', 'Batavia Phase 1'),
('STORE-05', 'Batavia Phase 2')
ON CONFLICT (id) DO NOTHING;


-- 5. INITIAL SEED DATA (MASTER KARYAWAN)
INSERT INTO public.karyawan (id, store_id, nama_karyawan, jabatan) VALUES
('EMP-101', 'STORE-01', 'Budi Santoso', 'Senior Sales'),
('EMP-102', 'STORE-01', 'Siti Nurhaliza', 'Sales Executive'),
('EMP-103', 'STORE-01', 'Ahmad Fauzi', 'Sales Executive'),
('EMP-104', 'STORE-01', 'Rina Anggraini', 'Junior Sales'),
('EMP-105', 'STORE-01', 'Dewa Pratama', 'Junior Sales'),
('EMP-106', 'STORE-01', 'Maya Putri', 'Junior Sales'),
('EMP-107', 'STORE-01', 'Rizky Ramadhan', 'Leader Store'),
('EMP-108', 'STORE-01', 'Fitri Handayani', 'Cashier/Sales'),
('EMP-201', 'STORE-02', 'Andra Wijaya', 'Senior Sales'),
('EMP-202', 'STORE-02', 'Dian Sastro', 'Sales Executive'),
('EMP-203', 'STORE-02', 'Eko Prasetyo', 'Sales Executive'),
('EMP-204', 'STORE-02', 'Gita Gutawa', 'Junior Sales'),
('EMP-205', 'STORE-02', 'Hendra Setiawan', 'Junior Sales'),
('EMP-206', 'STORE-02', 'Indah Permata', 'Junior Sales'),
('EMP-207', 'STORE-02', 'Joko Widodo', 'Leader Store'),
('EMP-208', 'STORE-02', 'Kartika Putri', 'Cashier/Sales'),
('EMP-301', 'STORE-03', 'Lukman Hakim', 'Senior Sales'),
('EMP-302', 'STORE-03', 'Mega Lestari', 'Sales Executive'),
('EMP-303', 'STORE-03', 'Naufal Azhar', 'Sales Executive'),
('EMP-304', 'STORE-03', 'Olivia Jensen', 'Junior Sales'),
('EMP-305', 'STORE-03', 'Pandu Perkasa', 'Junior Sales'),
('EMP-306', 'STORE-03', 'Qori Sandioriva', 'Junior Sales'),
('EMP-307', 'STORE-03', 'Raditya Dika', 'Leader Store'),
('EMP-308', 'STORE-03', 'Siska Kohl', 'Cashier/Sales'),
('EMP-401', 'STORE-04', 'Taufik Hidayat', 'Senior Sales'),
('EMP-402', 'STORE-04', 'Utama Putra', 'Sales Executive')
ON CONFLICT (id) DO NOTHING;
