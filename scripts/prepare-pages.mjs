import { mkdir, cp, writeFile, readdir, unlink } from "node:fs/promises";
// Keep the deploy directory reproducible and remove only previous hashed build assets.
await mkdir("docs/assets", { recursive: true });
for (const name of await readdir("docs/assets")) {
  if (/^index-[A-Za-z0-9_-]+\.(js|css)$/.test(name))
    await unlink(`docs/assets/${name}`);
}
await cp("dist", "docs", { recursive: true });
await writeFile("docs/.nojekyll", "");
