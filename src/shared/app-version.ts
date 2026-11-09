/**
 * The app's semver, for the export manifest (M31). Hand-kept because the web bundle has no
 * `app.getVersion()`. `app-version.test.ts` fails the moment it drifts from package.json —
 * bump both together.
 */
export const APP_VERSION = '1.7.0'
