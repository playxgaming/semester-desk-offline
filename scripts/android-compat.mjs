import { readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { unlink } from 'node:fs/promises'
import { gunzipSync } from 'node:zlib'

// CLI 7 includes patched archive handling. This app deliberately keeps its
// Capacitor 6 native runtime, Gradle and JDK 17 rather than migrating the APK.
// Match generated plugin projects to that checked-in toolchain after sync/update.
const runtime = JSON.parse(await readFile(new URL('../node_modules/@capacitor/core/package.json', import.meta.url), 'utf8'))
if (!runtime.version.startsWith('6.')) throw new Error('Review Android toolchain compatibility before changing the Capacitor runtime.')
const rootGradle = await readFile(new URL('../android/build.gradle', import.meta.url), 'utf8')
const agp = rootGradle.match(/com\.android\.tools\.build:gradle:([^'"\s]+)/)?.[1]
if (!agp) throw new Error('Cannot identify the checked-in Android Gradle plugin version.')
for (const path of ['android/app/capacitor.build.gradle', 'android/capacitor-cordova-android-plugins/build.gradle']) {
  const file = new URL(`../${path}`, import.meta.url)
  const source = await readFile(file, 'utf8')
  const output = source.replaceAll('JavaVersion.VERSION_21', 'JavaVersion.VERSION_17')
    .replace(/com\.android\.tools\.build:gradle:[^'"\s]+/g, `com.android.tools.build:gradle:${agp}`)
  await writeFile(file, output)
}
console.log(`Android generated projects match Capacitor 6: Java 17, AGP ${agp}`)
// Android asset packaging can strip .gz suffixes. Ship a deliberate plain model
// for native OCR; the website keeps its smaller gzip model and browser cache.
const compressed = new URL('../android/app/src/main/assets/public/ocr/lang/eng.traineddata.gz', import.meta.url)
if (existsSync(compressed)) {
  const model = gunzipSync(await readFile(compressed))
  await writeFile(new URL('./eng.traineddata', compressed), model)
  await unlink(compressed)
  console.log(`Android OCR model prepared without gzip (${model.byteLength} bytes).`)
}
