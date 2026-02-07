async function fetchGeocode(address) {
    const key = process.env.GOOGLE_MAPS_API_KEY;

    if (!key) {
        return null;
    }

    const url = new URL(
        "https://maps.googleapis.com/maps/api/geocode/json"
    );
    url.searchParams.set("address", address);
    url.searchParams.set("key", key);

    const response = await fetch(url);

    if (!response.ok) {
        return null;
    }

    const data = await response.json();

    if (data.status !== "OK" || data.results.length === 0) {
        return null;
    }

    const location = data.results[0]?.geometry?.location;

    if (
        typeof location?.lat !== "number" ||
        typeof location?.lng !== "number"
    ) {
        return null;
    }

    return {
        lat: location.lat,
        long: location.lng,
    };
}

export async function geocodeAddress({
    num_civique,
    rue,
    code_postal,
}) {
    if (!num_civique || !rue || !code_postal) {
        return null;
    }

    const address = `${num_civique} ${rue} ${code_postal}`;

    try {
        return await fetchGeocode(address);
    } catch {
        return null;
    }
}

export async function geocodeFreeAddress(address) {
    if (!address || !address.trim()) {
        return null;
    }

    try {
        return await fetchGeocode(address.trim());
    } catch {
        return null;
    }
}
