// ==========================================================================
// DIGITAL SCHOOL ECOSYSTEM (VANILLA EDITION)
// Core Application Configuration & Firebase Connection
// ==========================================================================

export const APP_CONFIG = {
  version: '2.0-vanilla',
  defaultLanguage: 'ar',
  defaultDirection: 'rtl',
  defaultSchoolId: 'zewail-school',
};

const localHostname = typeof window !== 'undefined' && ['localhost', '127.0.0.1'].includes(window.location.hostname);
const emulatorRequested = localHostname && new URLSearchParams(window.location.search).get('emulator') === '1';
if (emulatorRequested) localStorage.setItem('dse_use_firebase_emulator', '1');
export const USE_LOCAL_FIREBASE_EMULATORS = localHostname && emulatorRequested;

// Official Firebase project configuration
export const FIREBASE_CONFIG = {
  apiKey: USE_LOCAL_FIREBASE_EMULATORS ? 'fake-api-key' : 'AIzaSyBD4WFrHSJB5EjpFwsOnlPzNCxf91vEyQw',
  authDomain: USE_LOCAL_FIREBASE_EMULATORS ? 'demo-dse-local.firebaseapp.com' : 'digital-school-ecosystem.firebaseapp.com',
  projectId: USE_LOCAL_FIREBASE_EMULATORS ? 'demo-dse-local' : 'digital-school-ecosystem',
  messagingSenderId: "436764188612",
  appId: "1:436764188612:web:ed3e7e5c111cdc59010e91",
  measurementId: "G-V9Z6SPMCQJ"
};

// Cloudinary & Cloudflare Worker Gateway Configuration
export const MEDIA_CONFIG = {
  // Cloudinary public cloud name for CDN delivery
  cloudinaryCloudName: "arjlacyo",
  
  // Cloudflare Worker gateway for cryptographically signed upload requests
  // Defaults to production worker URL, or reads custom override if configured
  workerGatewayUrl: USE_LOCAL_FIREBASE_EMULATORS ? '' : (localStorage.getItem('dse_worker_gateway_url') || 'https://dse-cloudinary-gateway.hatmm462.workers.dev'),

  // Allowed media upload mime types & sizes
  allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
  maxFileSize: 10 * 1024 * 1024, // 10MB
  
  // Default delivery transformation parameters
  transformations: {
    thumbnail: 'c_thumb,w_300,h_200,g_auto,f_auto,q_auto',
    card: 'c_fill,w_600,h_400,g_auto,f_auto,q_auto',
    lightbox: 'c_limit,w_1600,h_1200,f_auto,q_auto',
    avatar: 'c_thumb,w_150,h_150,g_face,f_auto,q_auto'
  }
};

