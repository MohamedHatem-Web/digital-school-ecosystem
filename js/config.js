// ==========================================================================
// DIGITAL SCHOOL ECOSYSTEM (VANILLA EDITION)
// Core Application Configuration & Firebase Connection
// ==========================================================================

export const APP_CONFIG = {
  version: '2.0-vanilla',
  defaultLanguage: 'ar',
  defaultDirection: 'rtl',
  defaultSchoolId: 'sch_cairo_sec_01',
};

// Official Firebase project configuration
export const FIREBASE_CONFIG = {
  apiKey: "AIzaSyBD4WFrHSJB5EjpFwsOnlPzNCxf91vEyQw",
  authDomain: "digital-school-ecosystem.firebaseapp.com",
  projectId: "digital-school-ecosystem",
  storageBucket: "digital-school-ecosystem.firebasestorage.app",
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
  workerGatewayUrl: localStorage.getItem('dse_worker_gateway_url') || "https://dse-cloudinary-gateway.hatmm462.workers.dev",

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

