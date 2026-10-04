/** @type {import('next').NextConfig} */

// Domain CDN sudah dikonfirmasi: hanya Cloudinary.
// Kalau nanti menambah CDN lain, tambahkan URL-nya ke array ini.
const cdnDomains = [
  'https://res.cloudinary.com',
];

// Endpoint yang dipanggil browser selain server sendiri: upload langsung ke
// Cloudinary (XHR ke api.cloudinary.com) dan SDK Firebase (Auth + Firestore).
const connectDomains = [
  'https://api.cloudinary.com',
  'https://firestore.googleapis.com',
  'https://identitytoolkit.googleapis.com',
  'https://securetoken.googleapis.com',
  'https://www.googleapis.com',
];

const cspDirectives = [
  `default-src 'self'`,
  `script-src 'self' 'unsafe-inline'`, // Next.js butuh unsafe-inline kecuali pakai setup nonce
  `style-src 'self' 'unsafe-inline'`,
  `img-src 'self' data: ${cdnDomains.join(' ')}`,
  `media-src 'self' ${cdnDomains.join(' ')}`,   // penting untuk pemutaran video/audio
  `connect-src 'self' ${cdnDomains.join(' ')} ${connectDomains.join(' ')}`,
  `font-src 'self' data:`,
  `object-src 'none'`,
  `base-uri 'self'`,
  `form-action 'self'`,
  `frame-ancestors 'self'`,
];

const nextConfig = {
  reactStrictMode: true,
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          // Masih Report-Only: browser akan LOG pelanggaran CSP di console,
          // TAPI TIDAK memblokir apa pun. Ini tahap testing, belum enforce.
          { key: 'Content-Security-Policy-Report-Only', value: cspDirectives.join('; ') },
        ],
      },
    ];
  },
};

module.exports = nextConfig;