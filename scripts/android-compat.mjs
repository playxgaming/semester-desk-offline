import { readFile, writeFile } from 'node:fs/promises'

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
