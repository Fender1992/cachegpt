/**
 * Desktop build preparation script.
 * Temporarily moves server-only files out of the way for static export,
 * then restores them after the build completes.
 */
const fs = require('fs');
const path = require('path');

const phase = process.argv[2]; // 'pre' or 'post'

const root = path.resolve(__dirname, '..');

const configBak = path.join(root, 'next.config.js.bak');
const config = path.join(root, 'next.config.js');
const desktopConfig = path.join(root, 'next.config.desktop.js');

// Server-only files/dirs to move outside app/ during static export
const moves = [
  { src: path.join(root, 'app', 'api'), dst: path.join(root, '.desktop-bak-api') },
  { src: path.join(root, 'middleware.ts'), dst: path.join(root, '.desktop-bak-middleware.ts') },
  { src: path.join(root, 'app', 'robots.ts'), dst: path.join(root, '.desktop-bak-robots.ts') },
  { src: path.join(root, 'app', 'sitemap.ts'), dst: path.join(root, '.desktop-bak-sitemap.ts') },
  { src: path.join(root, 'app', 'a'), dst: path.join(root, '.desktop-bak-a') },
  { src: path.join(root, 'app', 'chat', '[id]'), dst: path.join(root, '.desktop-bak-chat-id') },
  { src: path.join(root, 'app', 'status'), dst: path.join(root, '.desktop-bak-status') },
  { src: path.join(root, 'app', 'admin', 'enterprise'), dst: path.join(root, '.desktop-bak-admin-enterprise') },
  { src: path.join(root, 'app', 'admin', 'feature-flags'), dst: path.join(root, '.desktop-bak-admin-feature-flags') },
  { src: path.join(root, 'app', 'admin', 'funnel-report'), dst: path.join(root, '.desktop-bak-admin-funnel-report') },
];

if (phase === 'pre') {
  fs.copyFileSync(config, configBak);
  fs.copyFileSync(desktopConfig, config);

  for (const { src, dst } of moves) {
    if (fs.existsSync(src)) {
      fs.renameSync(src, dst);
      console.log(`  moved ${path.relative(root, src)}`);
    }
  }

  console.log('[desktop-build-prep] pre: done');
} else if (phase === 'post') {
  if (fs.existsSync(configBak)) {
    fs.renameSync(configBak, config);
  }

  for (const { src, dst } of moves) {
    if (fs.existsSync(dst)) {
      fs.renameSync(dst, src);
      console.log(`  restored ${path.relative(root, src)}`);
    }
  }

  console.log('[desktop-build-prep] post: done');
} else {
  console.error('Usage: node desktop-build-prep.js <pre|post>');
  process.exit(1);
}
