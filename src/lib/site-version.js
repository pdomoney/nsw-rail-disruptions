// Build immutable, content-addressed URLs for the static site assets.
// A Home Screen web app can retain JavaScript and CSS independently of Safari.
// Hashing filenames lets changed files fetch fresh without a service worker or cache purge.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const baseFiles = ['app.js', 'charts.js', 'patronage.js', 'styles.css', 'patronage.css'];

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

  // Use filename hashes, not query strings, to avoid intermediary caches ignoring query keys.
  const stamped = {};
  for (const name of baseFiles) {
    const ext = path.extname(name);
    const newName = name.slice(0, -ext.length) + '.' + digests[name] + ext;
    stamped[name] = newName;
    let content = fs.readFileSync(path.join(siteDir, name), 'utf8');
    if (name === 'app.js') {
      content = replaceOnce(content, "from './charts.js'", "from './" + 'charts.' + digests['charts.js'] + ".js'", name);
      content = replaceOnce(content, "from './patronage.js'", "from './" + 'patronage.' + digests['patronage.js'] + ".js'", name);
      content = replaceOnce(content, '__SITE_RELEASE__', release, name);
    }
    fs.writeFileSync(path.join(outputDir, newName), content);
  }

  let html = fs.readFileSync(path.join(siteDir, 'index.html'), 'utf8');
  for (const name of ['styles.css', 'patronage.css']) {
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
