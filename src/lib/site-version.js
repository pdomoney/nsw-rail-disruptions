// Build immutable, content-addressed URLs for the static site assets.
// A Home Screen web app can retain JavaScript and CSS independently of Safari.
// Hashing filenames lets changed files fetch fresh without a service worker or cache purge.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const baseFiles = ['app.js', 'charts.js', 'patronage.js', 'station-patronage.js', 'styles.css', 'patronage.css', 'station-patronage.css'];

function filesUnder(dir, prefix = '') {
  return fs.readdirSync(path.join(dir, prefix), { withFileTypes: true })
    .flatMap(entry => {
      const name = path.posix.join(prefix, entry.name);
      return entry.isDirectory() ? filesUnder(dir, name) : entry.isFile() ? [name] : [];
    }).sort();
}
function replaceOnce(text, before, after, file) {
  if (text.split(before).length !== 2) {
    throw new Error('Release asset ' + file + ' must contain exactly one: ' + before);
  }
  return text.replace(before, after);
}

export function publishSiteRelease(siteDir, outputDir, { generatedAt = Date.now() } = {}) {
  // Inputs are the original site source files, never the already-stamped dist assets.
  // The deployment revision is independent of the 5-minute collection timestamp.
  const sourceNames = filesUnder(siteDir);
  const digests = Object.fromEntries(sourceNames.map(name => [
    name, hash(fs.readFileSync(path.join(siteDir, name))).slice(0, 12),
  ]));
  const release = hash(sourceNames.map(name => name + ':' + digests[name]).join('\n')).slice(0, 16);
  for (const file of [...baseFiles, 'index.html']) {
    if (!digests[file]) throw new Error('Required static site asset missing: ' + file);
  }

  // Hash the *published bytes*, not just the source files. app.js embeds both
  // imported module filenames and the release ID. If a dependency changes alone,
  // its parent app filename MUST change too, or iOS may reuse a cached app.js that
  // imports an obsolete dependency. Dependency files are stamped first.
  const stamped = {};
  for (const name of baseFiles.filter(name => name !== 'app.js')) {
    const content = fs.readFileSync(path.join(siteDir, name));
    const ext = path.extname(name);
    const newName = name.slice(0, -ext.length) + '.' + hash(content).slice(0, 12) + ext;
    stamped[name] = newName;
    fs.writeFileSync(path.join(outputDir, newName), content);
  }

  let app = fs.readFileSync(path.join(siteDir, 'app.js'), 'utf8');
  app = replaceOnce(app, "from './charts.js'", "from './" + stamped['charts.js'] + "'", 'app.js');
  app = replaceOnce(app, "from './patronage.js'", "from './" + stamped['patronage.js'] + "'", 'app.js');
  app = replaceOnce(app, "from './station-patronage.js'", "from './" + stamped['station-patronage.js'] + "'", 'app.js');
  app = replaceOnce(app, '__SITE_RELEASE__', release, 'app.js');
  stamped['app.js'] = 'app.' + hash(app).slice(0, 12) + '.js';
  fs.writeFileSync(path.join(outputDir, stamped['app.js']), app);

  let html = fs.readFileSync(path.join(siteDir, 'index.html'), 'utf8');
  for (const name of ['styles.css', 'patronage.css', 'station-patronage.css']) {
    html = replaceOnce(html, 'href="' + name + '"', 'href="' + stamped[name] + '"', 'index.html');
  }
  html = replaceOnce(html, 'src="app.js"', 'src="' + stamped['app.js'] + '"', 'index.html');
  fs.writeFileSync(path.join(outputDir, 'index.html'), html);

  const target = path.join(outputDir, 'data');
  fs.mkdirSync(target, { recursive: true });
  // This tiny manifest is polled only to find code changes; frequent data builds keep
  // the same release ID. The client uses a fresh URL and cache:no-store per poll.
  fs.writeFileSync(path.join(target, 'site-version.json'),
    JSON.stringify({ release, generatedAt: new Date(generatedAt).toISOString() }) + '\n');
  return { release, stamped };
}
