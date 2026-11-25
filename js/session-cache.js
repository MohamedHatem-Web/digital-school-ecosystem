const SESSION_KEY = 'dse_user_session';
const SESSION_COOKIE_MAX_AGE = 60 * 60 * 24 * 400;

function getStorage(name) {
  try {
    return globalThis[name] || null;
  } catch (error) {
    console.warn(`Browser ${name} is unavailable:`, error);
    return null;
  }
}

function writeStorage(storage, profileJson, storageName) {
  if (!storage) return;
  try {
    storage.setItem(SESSION_KEY, profileJson);
  } catch (error) {
    console.warn(`Could not persist the user profile in ${storageName}:`, error);
  }
}

export function persistUserSession(profile) {
  if (!profile || typeof profile !== 'object' || Array.isArray(profile)) {
    throw new TypeError('A valid user profile is required to persist the session.');
  }

  const profileJson = JSON.stringify(profile);
  writeStorage(getStorage('localStorage'), profileJson, 'localStorage');
  writeStorage(getStorage('sessionStorage'), profileJson, 'sessionStorage');

  if (typeof document === 'undefined') return;

  try {
    const encodedProfile = encodeURIComponent(profileJson);
    const secure = globalThis.location?.protocol === 'https:' ? '; Secure' : '';
    if (encodedProfile.length <= 3800) {
      document.cookie = `${SESSION_KEY}=${encodedProfile}; Path=/; Max-Age=${SESSION_COOKIE_MAX_AGE}; SameSite=Lax${secure}`;
    } else {
      document.cookie = `${SESSION_KEY}=; Path=/; Max-Age=0; SameSite=Lax${secure}`;
      console.warn('The user profile is too large for the session fallback cookie; Firebase persistence remains active.');
    }

    const encodedName = encodeURIComponent(profile.displayName || '');
    document.cookie = `dse_user_name=${encodedName}; Path=/; Max-Age=${SESSION_COOKIE_MAX_AGE}; SameSite=Lax${secure}`;
  } catch (error) {
    console.warn('Could not persist the profile fallback cookie:', error);
  }
}

export function readCachedUserSession() {
  for (const storageName of ['localStorage', 'sessionStorage']) {
    const storage = getStorage(storageName);
    if (!storage) continue;
    try {
      const profileJson = storage.getItem(SESSION_KEY);
      if (!profileJson) continue;
      const profile = parseUserProfile(profileJson, storageName);
      if (profile) return profile;
    } catch (error) {
      console.warn(`Could not read the user profile from ${storageName}:`, error);
    }
  }

  if (typeof document !== 'undefined') {
    try {
      const cookie = document.cookie.match(/(?:^|;\s*)dse_user_session=([^;]+)/);
      if (cookie?.[1]) {
        const profileJson = decodeURIComponent(cookie[1]);
        const profile = parseUserProfile(profileJson, 'cookie');
        if (profile) {
          writeStorage(getStorage('localStorage'), profileJson, 'localStorage');
          writeStorage(getStorage('sessionStorage'), profileJson, 'sessionStorage');
          return profile;
        }
      }
    } catch (error) {
      console.warn('Could not read the profile fallback cookie:', error);
    }
  }

  return null;
}

function parseUserProfile(profileJson, source) {
  try {
    const profile = JSON.parse(profileJson);
    if (!profile || typeof profile !== 'object' || Array.isArray(profile)) return null;
    return profile;
  } catch (error) {
    console.warn(`The cached user profile in ${source} is invalid and will be reloaded from Firebase:`, error);
    return null;
  }
}

export function clearCachedUserSession() {
  for (const storageName of ['localStorage', 'sessionStorage']) {
    const storage = getStorage(storageName);
    if (!storage) continue;
    try {
      storage.removeItem(SESSION_KEY);
    } catch (error) {
      console.warn(`Could not clear the user profile from ${storageName}:`, error);
    }
  }

  if (typeof document === 'undefined') return;
  const secure = globalThis.location?.protocol === 'https:' ? '; Secure' : '';
  try {
    for (const cookieName of [SESSION_KEY, 'dse_user_name', 'dse_role']) {
      document.cookie = `${cookieName}=; Path=/; Max-Age=0; SameSite=Lax${secure}`;
    }
  } catch (error) {
    console.warn('Could not clear the session fallback cookies:', error);
  }
}
