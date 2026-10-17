type Departure = { city: string | null; country: string | null; display_name: string | null };

type RegistrationTravelers = {
  respondent_name: string;
  companions: string[] | null;
  departure_city: string | null;
  departure_country: string | null;
  not_attending: boolean;
};

// Match the map's existing grouping without changing its coordinates or order.
function cityKey(city: string | null, country: string | null) {
  if (!city?.trim() || !country?.trim()) return null;
  return `${city.trim().toLocaleLowerCase("fr")}|${country.trim().toLocaleLowerCase("fr")}`;
}

export function addRouteTravelers<T extends Departure>(
  routes: T[],
  registrations: RegistrationTravelers[],
): Array<T & { traveler_names: string[] }> {
  const registered = new Map<string, string[]>();
  const legacy = new Map<string, string[]>();

  for (const route of routes) {
    const key = cityKey(route.city, route.country);
    if (!key) continue;
    const names = legacy.get(key) ?? [];
    if (route.display_name?.trim()) names.push(route.display_name.trim());
    legacy.set(key, names);
  }

  for (const registration of registrations) {
    const key = cityKey(registration.departure_city, registration.departure_country);
    if (!key) continue;
    const names = registered.get(key) ?? [];
    if (!registration.not_attending) {
      // Every participant counts, including namesakes and guests staying elsewhere.
      names.push(...[registration.respondent_name, ...(registration.companions ?? [])]
        .map((name) => name.trim()).filter(Boolean));
    }
    registered.set(key, names);
  }

  return routes.map((route) => {
    const key = cityKey(route.city, route.country);
    return {
      ...route,
      traveler_names: key ? registered.get(key) ?? legacy.get(key) ?? [] : [],
    };
  });
}
