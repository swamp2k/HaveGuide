export interface PlatformPosition {
  latitude: number;
  longitude: number;
  accuracy: number;
}

export interface LocationPlatform {
  getCurrentPosition(): Promise<PlatformPosition>;
}

export const browserLocation: LocationPlatform = {
  getCurrentPosition() {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('Placering understøttes ikke på denne enhed.'));
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (position) =>
          resolve({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy,
          }),
        () => reject(new Error('Placeringen kunne ikke hentes.')),
        { enableHighAccuracy: true, timeout: 12_000, maximumAge: 30_000 },
      );
    });
  },
};
