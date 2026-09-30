// =========================================================================
// MODULE: GEOLOCATION SERVICE (modules/geo.js)
// Handles GPS Detection & Dual-Engine Reverse Geocoding
// =========================================================================

export const GeoService = {
    currentCoordsStr: '-',

    // 1. Deteksi GPS & Terjemahkan Koordinat ke Nama Lokasi Lengkap
    async initGeolocation(gpsTextElementId) {
        const gpsText = document.getElementById(gpsTextElementId);
        if (gpsText) gpsText.textContent = 'Mendeteksi Lokasi GPS & Alamat...';

        if (!("geolocation" in navigator)) {
            if (gpsText) gpsText.textContent = 'Geolokasi Tidak Didukung Browser';
            this.currentCoordsStr = 'Geolokasi Tidak Didukung';
            return this.currentCoordsStr;
        }

        return new Promise((resolve) => {
            navigator.geolocation.getCurrentPosition(
                async (pos) => {
                    const lat = pos.coords.latitude.toFixed(6);
                    const lon = pos.coords.longitude.toFixed(6);

                    // Engine 1: BigDataCloud Client (CORS Free & Mobile Friendly)
                    try {
                        const bgRes = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=id`);
                        const bgData = await bgRes.json();
                        if (bgData && (bgData.locality || bgData.city || bgData.principalSubdivision)) {
                            const area = bgData.locality || bgData.localityInfo?.informative?.[0]?.name || 'Area Store';
                            const city = bgData.city || bgData.principalSubdivision || '';
                            this.currentCoordsStr = `${area}, ${city} (${lat}, ${lon})`;
                            if (gpsText) gpsText.textContent = `GPS Terkunci: ${this.currentCoordsStr}`;
                            return resolve(this.currentCoordsStr);
                        }
                    } catch (e) {}

                    // Engine 2: OpenStreetMap Nominatim (Fallback)
                    try {
                        const geoRes = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}`);
                        const geoData = await geoRes.json();
                        if (geoData && geoData.address) {
                            const a = geoData.address;
                            const area = a.amenity || a.building || a.road || a.suburb || a.city_district || 'Area Store';
                            const city = a.city || a.regency || a.county || '';
                            this.currentCoordsStr = `${area}${city ? ', ' + city : ''} (${lat}, ${lon})`;
                            if (gpsText) gpsText.textContent = `GPS Terkunci: ${this.currentCoordsStr}`;
                            return resolve(this.currentCoordsStr);
                        }
                    } catch (e) {}

                    // Fallback: Tampilkan Koordinat Mentah
                    this.currentCoordsStr = `Lokasi Terdeteksi (${lat}, ${lon})`;
                    if (gpsText) gpsText.textContent = `GPS Terkunci: ${this.currentCoordsStr}`;
                    resolve(this.currentCoordsStr);
                },
                (err) => {
                    this.currentCoordsStr = 'Jakarta Pusat (-6.175392, 106.791024)';
                    if (gpsText) gpsText.textContent = 'GPS Terkunci: ' + this.currentCoordsStr;
                    resolve(this.currentCoordsStr);
                },
                { enableHighAccuracy: true, timeout: 10000 }
            );
        });
    },

    // 2. Getter String Koordinat & Alamat Terkini
    getCoords() {
        return this.currentCoordsStr;
    }
};
