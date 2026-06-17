// The single fixed base URL for the KISS v2 API.
//
// Used as a fallback when the OpenAPI `server` value isn't present in the
// store. On the static reference pages the interactive Server control isn't
// mounted (it lives in the Try-it modal), so `state.server.value` can resolve
// empty; without this fallback the method endpoint would show and copy a
// path-only URL (e.g. `/units`) instead of the full URL. The version (`/v2`)
// lives here in the base, so operation paths stay clean (`/units`).
export const API_BASE_URL = 'https://api-app.keepitsimplestorage.com/api/v2';
