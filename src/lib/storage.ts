// TypeScript contract/default export for native targets. Metro automatically
// selects storage.web.ts in browsers and storage.native.ts on Android/iOS.
export { deleteHunt, loadHuntData, loadSavedHuntLocations, loadTibiaCoinRates, saveCharacter, saveHunt, saveHuntLocation, saveTibiaCoinRates, setPrimaryCharacter } from './storage.native';
