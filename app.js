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
