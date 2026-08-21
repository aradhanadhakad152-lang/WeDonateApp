import * as Location from 'expo-location';

export interface LocationData {
  latitude: number;
  longitude: number;
  accuracy: number | null;
  city?: string;
  state?: string;
  pincode?: string;
  address?: string;
}

/**
 * Requests location permission and gets current device GPS coordinates.
 * Never crashes the application if permission is denied or GPS is disabled.
 */
export const getCurrentDeviceLocation = async (): Promise<LocationData | null> => {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();

    if (status !== 'granted') {
      console.warn('Location permission denied by user');
      return null;
    }

    // Check if location services are enabled on device
    const isEnabled = await Location.hasServicesEnabledAsync();
    if (!isEnabled) {
      console.warn('Device location services are disabled');
      return null;
    }

    // Fetch current position with balanced accuracy
    const location = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
      timeInterval: 5000,
    });

    const { latitude, longitude, accuracy } = location.coords;
    let city = '';
    let state = '';
    let pincode = '';
    let address = '';

    // Reverse geocode to get city/state/pincode
    try {
      const geocode = await Location.reverseGeocodeAsync({ latitude, longitude });
      if (geocode && geocode.length > 0) {
        const place = geocode[0];
        city = place.city || place.subregion || place.district || '';
        state = place.region || '';
        pincode = place.postalCode || '';
        address = [place.name, place.street, city, state].filter(Boolean).join(', ');
      }
    } catch (geoError) {
      console.warn('Reverse geocoding failed, using raw GPS coordinates:', geoError);
    }

    return {
      latitude,
      longitude,
      accuracy: accuracy || null,
      city,
      state,
      pincode,
      address,
    };
  } catch (error) {
    console.error('Failed to get device location:', error);
    return null;
  }
};
