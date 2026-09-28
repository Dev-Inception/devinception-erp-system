/**
 * Produces a self-contained deployment bundle in ./out.
 *
 * The backend is plain CommonJS, so "building" is a clean copy of the
 * runtime sources plus a trimmed package.json (production deps only and
 * the start / migrate / seed scripts). Upload the out folder to the
 * server, add a .env next to package.json, then:
 *
 *   npm install --omit=dev
 *   npm run db:migrate
 *   npm run seed
 *   npm start
 */
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const OUT = path.join(ROOT, 'out');

const pkg = require('./package.json');

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

fs.cpSync(path.join(ROOT, 'index.js'), path.join(OUT, 'index.js'));
fs.cpSync(path.join(ROOT, 'src'), path.join(OUT, 'src'), { recursive: true });
fs.cpSync(path.join(ROOT, '.env.example'), path.join(OUT, '.env.example'));

// Runtime dirs the app writes into; contents never ship.
fs.mkdirSync(path.join(OUT, 'uploads'));
fs.writeFileSync(path.join(OUT, 'uploads', '.gitkeep'), '');

const outPkg = {
  name: pkg.name,
  version: pkg.version,
  description: pkg.description,
  private: true,
  main: 'index.js',
  type: pkg.type,
  engines: { node: '>=20' },
  scripts: {
    start: 'node src/db/migrate.js && node index.js',
    serve: 'node index.js',
    'db:migrate': 'node src/db/migrate.js',
    'db:migrate:status': 'node src/db/migrate.js --status',
    seed: 'node src/scripts/seedAll.js',
  },
  dependencies: pkg.dependencies,
};
fs.writeFileSync(path.join(OUT, 'package.json'), `${JSON.stringify(outPkg, null, 2)}\n`);

// eslint-disable-next-line no-console
console.log(`Backend build written to ${path.relative(process.cwd(), OUT) || OUT}`);
