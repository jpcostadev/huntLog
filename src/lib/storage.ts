// TypeScript contract/default export for native targets. Metro automatically
// selects storage.web.ts in browsers and storage.native.ts on Android/iOS.
export { deleteHunt, loadHuntData, saveCharacter, saveHunt, setPrimaryCharacter } from './storage.native';
