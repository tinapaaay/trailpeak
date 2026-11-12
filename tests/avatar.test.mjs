import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const root = new URL('../', import.meta.url);
const auth = fs.readFileSync(new URL('auth.js', root), 'utf8');
const api = fs.readFileSync(new URL('api.js', root), 'utf8');
const storage = new Map();
const slots = [{ textContent: '', append(image) { this.image = image; } }];
const context = vm.createContext({ URL, console, localStorage: { getItem: k => storage.get(k) || null, setItem: (k, v) => storage.set(k, v) }, document: {
  addEventListener() {}, querySelectorAll: () => slots,
  createElement: () => ({ remove() { this.removed = true; } })
} });
vm.runInContext(auth, context);
const run = text => vm.runInContext(text, context);
const google = { id: 'user-a', app_metadata: { providers: ['email', 'google'] }, user_metadata: { avatar_url: 'https://example.com/photo.png' } };
context.google = google;
assert.equal(run('accountPhotoFields(google).avatarUrl'), google.user_metadata.avatar_url);
assert.equal(run('accountPhotoFields({...google, user_metadata: {...google.user_metadata, trailpeak_avatar_hidden: true}}).avatarUrl'), '');
assert.equal(run('accountPhotoFields({...google, app_metadata: {provider:"email"}}).photoAvailable'), false);
for (const url of ['javascript:alert(1)', 'data:image/png;base64,a', 'http://example.com/photo', 'https://user:password@example.com/photo', '\" onerror=alert(1)', null]) {
 context.badUrl = url;
 assert.equal(run('avatarUrl(badUrl)'), '');
}
run('setUser({id:"user-a", name:"Ana Reyes", ...accountPhotoFields(google)}); renderOwnAvatars()');
assert.equal(slots[0].textContent, 'AR');
assert.equal(slots[0].image.src, google.user_metadata.avatar_url);
assert.equal(slots[0].image.referrerPolicy, 'no-referrer');
slots[0].image.onerror();
assert.equal(slots[0].image.removed, true);
assert.equal(slots[0].textContent, 'AR');
// Exercise account mapping and preference persistence without touching booking functions.
vm.runInContext(api.slice(api.indexOf('function tpUser('), api.indexOf('// ---- Sync')), context);
assert.equal(run('tpUser({id:"user-a", name:"Ana Reyes", role:"joiner"}, "a@example.test", 0, google).avatarUrl'), google.user_metadata.avatar_url);
context.updateUser = async ({data}) => ({ data: {user: {...google, user_metadata: {...google.user_metadata, ...data}}}, error: null });
run('const TP = {online:true, db:{auth:{updateUser}}}');
vm.runInContext(api.slice(api.indexOf('TP.setAvatarHidden ='), api.indexOf('TP.sendCode =')), context);
await run('TP.setAvatarHidden(true)');
assert.equal(run('getUser().photoHidden'), true);
assert.equal(run('getUser().avatarUrl'), '');
await run('TP.setAvatarHidden(false)');
assert.equal(run('getUser().avatarUrl'), google.user_metadata.avatar_url);
context.updateUser = async () => ({error: new Error('offline')});
run('TP.db.auth.updateUser = updateUser');
await assert.rejects(run('TP.setAvatarHidden(true)'));
assert.equal(run('getUser().photoHidden'), false);
context.updateUser = async () => ({data: {user: {...google, id:'other-account'}}});
run('TP.db.auth.updateUser = updateUser');
await assert.rejects(run('TP.setAvatarHidden(true)'));
assert.equal(run('getUser().id'), 'user-a');
// Photos are not mapped into public trips or joiner payloads.
assert.doesNotMatch(api.slice(api.indexOf('TP.applyTo ='), api.indexOf('// Server booking')), /avatarUrl|avatar_url/);
assert.doesNotMatch(api.slice(api.indexOf('TP.whosGoing ='), api.indexOf('TP.publishTrip =')), /avatarUrl|avatar_url/);
console.log('Avatar checks passed: Google metadata, URL safety, initials/error fallback, preference save/failure, account isolation, and public payload privacy.');
