// @ts-check
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { constants, promises as fs } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

export const BUNDLE_CACHE = '/home/runner/work/_temp/yeoni-chromium-1-63';
export const driverEnvironment = Object.freeze({
  PATH: '/usr/bin:/bin:/usr/sbin:/sbin', LANG: 'C', LC_ALL: 'C', CI: 'true',
  NODE_ENV: 'production', PLAYWRIGHT_BROWSERS_PATH: BUNDLE_CACHE,
  GITHUB_ACTIONS: 'true', GITHUB_EVENT_NAME: 'push',
  GITHUB_REF: 'refs/heads/agent/yeoni-japanese-ci-20261110',
  RUNNER_OS: 'Linux', RUNNER_ARCH: 'X64', RUNNER_ENVIRONMENT: 'github-hosted',
  ImageOS: 'ubuntu24', ImageVersion: '20261111.370.1',
  GITHUB_REPOSITORY: 'jace3695/yeoni-ai', GITHUB_SERVER_URL: 'https://github.com',
  RUNNER_TEMP: '/home/runner/work/_temp', TMPDIR: '/home/runner/work/_temp',
});
export const APPROVED_IMAGE_VERSIONS = Object.freeze(['20261101.360.1', '20261111.370.1']);
/** @param {string | undefined} imageVersion */
export function driverEnvironmentFor(imageVersion) {
  if (typeof imageVersion !== 'string' || !APPROVED_IMAGE_VERSIONS.includes(imageVersion)) throw new Error('BUNDLED_DRIVER_REJECTED');
  return Object.freeze({ ...driverEnvironment, ImageVersion: imageVersion });
}
export const DRIVER_EXIT_CODES = Object.freeze({
  success: 0, contract: 20, cache: 21, install: 22,
  bundle: 23, dependencies: 24, validation: 25, unexpected: 26,
  dependencyTool: 27, dependencyOutput: 28,
});
/**
 * Exact lib2package entries from pinned coreBundle.js, Ubuntu 24.04-x64 only.
 * IDs use stable case-sensitive name ordering. This is a diagnostic dictionary,
 * not a claim that every listed library is required by the headless-shell route.
 * No native tool output or unknown name is ever exposed through an exit code.
 */
export const MISSING_LIBRARIES = Object.freeze([
  Object.freeze({ id: 1, library: 'libGLESv2.so.2', package: 'libgles2' }),
  Object.freeze({ id: 2, library: 'libX11-xcb.so.1', package: 'libx11-xcb1' }),
  Object.freeze({ id: 3, library: 'libX11.so.6', package: 'libx11-6' }),
  Object.freeze({ id: 4, library: 'libXcomposite.so.1', package: 'libxcomposite1' }),
  Object.freeze({ id: 5, library: 'libXcursor.so.1', package: 'libxcursor1' }),
  Object.freeze({ id: 6, library: 'libXdamage.so.1', package: 'libxdamage1' }),
  Object.freeze({ id: 7, library: 'libXext.so.6', package: 'libxext6' }),
  Object.freeze({ id: 8, library: 'libXfixes.so.3', package: 'libxfixes3' }),
  Object.freeze({ id: 9, library: 'libXi.so.6', package: 'libxi6' }),
  Object.freeze({ id: 10, library: 'libXrandr.so.2', package: 'libxrandr2' }),
  Object.freeze({ id: 11, library: 'libXrender.so.1', package: 'libxrender1' }),
  Object.freeze({ id: 12, library: 'libasound.so.2', package: 'libasound2t64' }),
  Object.freeze({ id: 13, library: 'libatk-1.0.so.0', package: 'libatk1.0-0t64' }),
  Object.freeze({ id: 14, library: 'libatk-bridge-2.0.so.0', package: 'libatk-bridge2.0-0t64' }),
  Object.freeze({ id: 15, library: 'libatomic.so.1', package: 'libatomic1' }),
  Object.freeze({ id: 16, library: 'libatspi.so.0', package: 'libatspi2.0-0t64' }),
  Object.freeze({ id: 17, library: 'libavif.so.16', package: 'libavif16' }),
  Object.freeze({ id: 18, library: 'libcairo-gobject.so.2', package: 'libcairo-gobject2' }),
  Object.freeze({ id: 19, library: 'libcairo.so.2', package: 'libcairo2' }),
  Object.freeze({ id: 20, library: 'libcups.so.2', package: 'libcups2t64' }),
  Object.freeze({ id: 21, library: 'libdbus-1.so.3', package: 'libdbus-1-3' }),
  Object.freeze({ id: 22, library: 'libdrm.so.2', package: 'libdrm2' }),
  Object.freeze({ id: 23, library: 'libenchant-2.so.2', package: 'libenchant-2-2' }),
  Object.freeze({ id: 24, library: 'libepoxy.so.0', package: 'libepoxy0' }),
  Object.freeze({ id: 25, library: 'libevent-2.1.so.7', package: 'libevent-2.1-7t64' }),
  Object.freeze({ id: 26, library: 'libflite.so.1', package: 'libflite1' }),
  Object.freeze({ id: 27, library: 'libflite_cmu_grapheme_lang.so.1', package: 'libflite1' }),
  Object.freeze({ id: 28, library: 'libflite_cmu_grapheme_lex.so.1', package: 'libflite1' }),
  Object.freeze({ id: 29, library: 'libflite_cmu_indic_lang.so.1', package: 'libflite1' }),
  Object.freeze({ id: 30, library: 'libflite_cmu_indic_lex.so.1', package: 'libflite1' }),
  Object.freeze({ id: 31, library: 'libflite_cmu_time_awb.so.1', package: 'libflite1' }),
  Object.freeze({ id: 32, library: 'libflite_cmu_us_awb.so.1', package: 'libflite1' }),
  Object.freeze({ id: 33, library: 'libflite_cmu_us_kal.so.1', package: 'libflite1' }),
  Object.freeze({ id: 34, library: 'libflite_cmu_us_kal16.so.1', package: 'libflite1' }),
  Object.freeze({ id: 35, library: 'libflite_cmu_us_rms.so.1', package: 'libflite1' }),
  Object.freeze({ id: 36, library: 'libflite_cmu_us_slt.so.1', package: 'libflite1' }),
  Object.freeze({ id: 37, library: 'libflite_cmulex.so.1', package: 'libflite1' }),
  Object.freeze({ id: 38, library: 'libflite_usenglish.so.1', package: 'libflite1' }),
  Object.freeze({ id: 39, library: 'libfontconfig.so.1', package: 'libfontconfig1' }),
  Object.freeze({ id: 40, library: 'libfreetype.so.6', package: 'libfreetype6' }),
  Object.freeze({ id: 41, library: 'libgbm.so.1', package: 'libgbm1' }),
  Object.freeze({ id: 42, library: 'libgdk-3.so.0', package: 'libgtk-3-0t64' }),
  Object.freeze({ id: 43, library: 'libgdk_pixbuf-2.0.so.0', package: 'libgdk-pixbuf-2.0-0' }),
  Object.freeze({ id: 44, library: 'libgio-2.0.so.0', package: 'libglib2.0-0t64' }),
  Object.freeze({ id: 45, library: 'libglib-2.0.so.0', package: 'libglib2.0-0t64' }),
  Object.freeze({ id: 46, library: 'libgmodule-2.0.so.0', package: 'libglib2.0-0t64' }),
  Object.freeze({ id: 47, library: 'libgobject-2.0.so.0', package: 'libglib2.0-0t64' }),
  Object.freeze({ id: 48, library: 'libgstallocators-1.0.so.0', package: 'libgstreamer-plugins-base1.0-0' }),
  Object.freeze({ id: 49, library: 'libgstapp-1.0.so.0', package: 'libgstreamer-plugins-base1.0-0' }),
  Object.freeze({ id: 50, library: 'libgstaudio-1.0.so.0', package: 'libgstreamer-plugins-base1.0-0' }),
  Object.freeze({ id: 51, library: 'libgstbase-1.0.so.0', package: 'libgstreamer1.0-0' }),
  Object.freeze({ id: 52, library: 'libgstcodecparsers-1.0.so.0', package: 'libgstreamer-plugins-bad1.0-0' }),
  Object.freeze({ id: 53, library: 'libgstfft-1.0.so.0', package: 'libgstreamer-plugins-base1.0-0' }),
  Object.freeze({ id: 54, library: 'libgstgl-1.0.so.0', package: 'libgstreamer-gl1.0-0' }),
  Object.freeze({ id: 55, library: 'libgstpbutils-1.0.so.0', package: 'libgstreamer-plugins-base1.0-0' }),
  Object.freeze({ id: 56, library: 'libgstreamer-1.0.so.0', package: 'libgstreamer1.0-0' }),
  Object.freeze({ id: 57, library: 'libgsttag-1.0.so.0', package: 'libgstreamer-plugins-base1.0-0' }),
  Object.freeze({ id: 58, library: 'libgstvideo-1.0.so.0', package: 'libgstreamer-plugins-base1.0-0' }),
  Object.freeze({ id: 59, library: 'libgtk-3.so.0', package: 'libgtk-3-0t64' }),
  Object.freeze({ id: 60, library: 'libgtk-4.so.1', package: 'libgtk-4-1' }),
  Object.freeze({ id: 61, library: 'libharfbuzz-icu.so.0', package: 'libharfbuzz-icu0' }),
  Object.freeze({ id: 62, library: 'libharfbuzz.so.0', package: 'libharfbuzz0b' }),
  Object.freeze({ id: 63, library: 'libhyphen.so.0', package: 'libhyphen0' }),
  Object.freeze({ id: 64, library: 'libicudata.so.74', package: 'libicu74' }),
  Object.freeze({ id: 65, library: 'libicui18n.so.74', package: 'libicu74' }),
  Object.freeze({ id: 66, library: 'libicuuc.so.74', package: 'libicu74' }),
  Object.freeze({ id: 67, library: 'libjpeg.so.8', package: 'libjpeg-turbo8' }),
  Object.freeze({ id: 68, library: 'liblcms2.so.2', package: 'liblcms2-2' }),
  Object.freeze({ id: 69, library: 'libmanette-0.2.so.0', package: 'libmanette-0.2-0' }),
  Object.freeze({ id: 70, library: 'libnspr4.so', package: 'libnspr4' }),
  Object.freeze({ id: 71, library: 'libnss3.so', package: 'libnss3' }),
  Object.freeze({ id: 72, library: 'libnssutil3.so', package: 'libnss3' }),
  Object.freeze({ id: 73, library: 'libopus.so.0', package: 'libopus0' }),
  Object.freeze({ id: 74, library: 'libpango-1.0.so.0', package: 'libpango-1.0-0' }),
  Object.freeze({ id: 75, library: 'libpangocairo-1.0.so.0', package: 'libpangocairo-1.0-0' }),
  Object.freeze({ id: 76, library: 'libpng16.so.16', package: 'libpng16-16t64' }),
  Object.freeze({ id: 77, library: 'libsecret-1.so.0', package: 'libsecret-1-0' }),
  Object.freeze({ id: 78, library: 'libsmime3.so', package: 'libnss3' }),
  Object.freeze({ id: 79, library: 'libsoup-3.0.so.0', package: 'libsoup-3.0-0' }),
  Object.freeze({ id: 80, library: 'libvpx.so.9', package: 'libvpx9' }),
  Object.freeze({ id: 81, library: 'libwayland-client.so.0', package: 'libwayland-client0' }),
  Object.freeze({ id: 82, library: 'libwayland-egl.so.1', package: 'libwayland-egl1' }),
  Object.freeze({ id: 83, library: 'libwayland-server.so.0', package: 'libwayland-server0' }),
  Object.freeze({ id: 84, library: 'libwebp.so.7', package: 'libwebp7' }),
  Object.freeze({ id: 85, library: 'libwebpdemux.so.2', package: 'libwebpdemux2' }),
  Object.freeze({ id: 86, library: 'libwoff2dec.so.1.0.2', package: 'libwoff1' }),
  Object.freeze({ id: 87, library: 'libx264.so', package: 'libx264-164' }),
  Object.freeze({ id: 88, library: 'libxcb-shm.so.0', package: 'libxcb-shm0' }),
  Object.freeze({ id: 89, library: 'libxcb.so.1', package: 'libxcb1' }),
  Object.freeze({ id: 90, library: 'libxkbcommon.so.0', package: 'libxkbcommon0' }),
  Object.freeze({ id: 91, library: 'libxml2.so.2', package: 'libxml2' }),
  Object.freeze({ id: 92, library: 'libxslt.so.1', package: 'libxslt1.1' }),
 ]);

/** Decode only the reserved closed diagnostic range; 0 means unmapped missing library. @param {number | null | undefined} code @returns {number | null} */
export function missingLibraryId(code) {
  if (typeof code !== 'number' || !Number.isInteger(code)) return null;
  if (code === DRIVER_EXIT_CODES.dependencies) return 0;
  return code >= 64 && code <= 63 + MISSING_LIBRARIES.length ? code - 63 : null;
}

export const SOURCE_PINS = Object.freeze({
  'lib/coreBundle.js': '549070af3acabb3efcc4f55bfe6210f9f7c2fcf633cf7eaa59bfe60719969171',
  'browsers.json': '545d52f8382c391e605562c330e9c1c534a16045898203037a49bb8bd769a946',
  'package.json': 'f061c58427e47e843e26d201f0a57076c734e57c734ecbbd87d4a23b7a20db9b',
  'cli.js': 'f1c4075aef116c766092250d7f37b3249a7cee6465d953207fc38c8f6145becd',
});
export const SHELL_DIRECTORY = `${BUNDLE_CACHE}/chromium_headless_shell-1243`;
export const SHELL_PAYLOAD = `${SHELL_DIRECTORY}/chrome-headless-shell-linux64`;
export const SHELL_EXECUTABLE = `${SHELL_PAYLOAD}/chrome-headless-shell`;
export const FFMPEG_DIRECTORY = `${BUNDLE_CACHE}/ffmpeg-1011`;
export const FFMPEG_EXECUTABLE = `${FFMPEG_DIRECTORY}/ffmpeg-linux`;
const OUTPUT_LIMIT = 64 * 1024;
const SOURCE_LIMIT = 16 * 1024 * 1024;
const ELF_PREFIX_LIMIT = 64 * 1024;
const shellURLs = ['https://cdn.playwright.dev/builds/cft/153.0.8010.12/linux64/chrome-headless-shell-linux64.zip'];
const ffmpegURLs = [
  'https://cdn.playwright.dev/dbazure/download/playwright/builds/ffmpeg/1011/ffmpeg-linux.zip',
  'https://playwright.download.prss.microsoft.com/dbazure/download/playwright/builds/ffmpeg/1011/ffmpeg-linux.zip',
  'https://cdn.playwright.dev/builds/ffmpeg/1011/ffmpeg-linux.zip',
];

/** @typedef {{ kind: 'file' | 'directory' | 'symlink' | 'other', size: number, mode: number, uid: number }} FileInfo */
/** @typedef {{ cwd: string, executable: string, platform: string, arch: string, uid: number, umask: number, env: NodeJS.ProcessEnv }} DriverContext */
/** @typedef {{ file: string, args: string[], cwd: string, env: NodeJS.ProcessEnv, timeoutMs: number, maxOutputBytes: number, stdio: 'ignore' | 'capture' }} CommandRequest */
/** @typedef {{ code: number | null, signal: string | null, error: boolean, timedOut: boolean, overflow: boolean, stdout: string, stderr: string }} CommandResult */
/**
 * Exact subset of the pinned Playwright 1.63.0 internal ABI used here.
 * Source hashes, runtime shapes, identities, URLs and paths are all checked.
 * The ffmpeg descriptor has no browserVersion and a no-op host validator;
 * this driver deliberately makes no ffmpeg shared-library validation claim.
 * @typedef {{ name: string, directory: string | undefined, revision: string | undefined, browserVersion?: string, installType: string, _isHermeticInstallation: boolean, downloadURLs?: string[], executablePath: () => string | undefined }} ExecutableDescriptor
 */
/** @typedef {{ findExecutable: (name: string) => ExecutableDescriptor | undefined, _validateHostRequirements: (language: string, directory: string, linuxDirectories: string[], dlopenLibraries: string[], windowsDirectories: string[]) => Promise<void> }} Registry */
/** @typedef {{ registry: { registry: Registry, registryDirectory: string }, utils: { hostPlatform: string, isOfficiallySupportedPlatform: boolean } }} CoreBundle */
/**
 * All native I/O, command, package-resolution and registry-loading boundaries.
 * Tests inject a complete in-memory model and never invoke native installation,
 * ldd, the actual registry validator, network, browsers or servers.
 * @typedef {{
 * resolvePackage: () => string,
 * loadCoreBundle: (packageRoot: string) => CoreBundle,
 * lstat: (name: string) => Promise<FileInfo>,
 * realpath: (name: string) => Promise<string>,
 * readdir: (name: string) => Promise<string[]>,
 * access: (name: string, mode: number) => Promise<void>,
 * executable: (name: string) => Promise<boolean>,
 * readPrefix: (name: string, limit: number) => Promise<Buffer>,
 * digest: (name: string, limit: number) => Promise<string>,
 * mkdir: (name: string, options: { mode: number, recursive: false }) => Promise<void>,
 * command: (request: CommandRequest) => Promise<CommandResult>
 * }} DriverBoundaries
 */

/** Closed error carrying no command output, paths or native exceptions. */
class DependencyRejection extends Error {
  /** @param {number} exitCode */
  constructor(exitCode) {
    super('BUNDLED_DEPENDENCY_REJECTED');
    this.exitCode = exitCode;
  }
}

/** @param {boolean} condition */
function requireCondition(condition) {
  if (!condition) throw new Error('BUNDLED_DRIVER_REJECTED');
}

/** Exact allowlist rejects all direct and npm alias overrides, including empty values. @param {DriverContext} context */
function validateContext(context) {
  requireCondition(context.platform === 'linux' && context.arch === 'x64');
  requireCondition(Number.isInteger(context.uid) && context.uid > 0 && context.umask === 0o077);
  requireCondition(path.isAbsolute(context.cwd) && path.resolve(context.cwd) === context.cwd);
  requireCondition(path.isAbsolute(context.executable));
  const actual = Object.entries(context.env);
  const expected = Object.entries(driverEnvironmentFor(context.env.ImageVersion));
  requireCondition(actual.length === expected.length);
  for (const [key, value] of expected) requireCondition(context.env[key] === value);
}

/** @param {DriverBoundaries} io @param {string} name @param {'file'|'directory'} kind */
async function requireReal(io, name, kind) {
  const info = await io.lstat(name);
  requireCondition(info.kind === kind && await io.realpath(name) === name);
  return info;
}

/** Hashes prove the package name/version, browser revision/version and unchanged internal validator source. @param {DriverBoundaries} io @param {string} root */
async function verifySource(io, root) {
  requireCondition(path.isAbsolute(root) && path.resolve(root) === root);
  await requireReal(io, root, 'directory');
  for (const [relative, expected] of Object.entries(SOURCE_PINS)) {
    const name = path.join(root, relative);
    const info = await requireReal(io, name, 'file');
    requireCondition(info.size > 0 && info.size <= SOURCE_LIMIT);
    await io.access(name, constants.R_OK);
    requireCondition(await io.digest(name, SOURCE_LIMIT) === expected);
  }
}

/** @param {ExecutableDescriptor | undefined} item @param {string} name @param {string} directory @param {string} revision @param {string | undefined} version @param {string} executable @param {string[]} urls */
function requireDescriptor(item, name, directory, revision, version, executable, urls) {
  if (!item || typeof item.executablePath !== 'function') throw new Error('BUNDLED_DRIVER_REJECTED');
  requireCondition(item.name === name && item.directory === directory && item.revision === revision);
  requireCondition(item.browserVersion === version && item._isHermeticInstallation === true);
  requireCondition(item.installType === 'download-by-default' && item.executablePath() === executable);
  requireCondition(Array.isArray(item.downloadURLs) && item.downloadURLs.length === urls.length);
  for (const [index, url] of urls.entries()) requireCondition(item.downloadURLs?.[index] === url);
}

/** @param {CoreBundle} core */
function verifyRegistry(core) {
  requireCondition(core?.utils?.hostPlatform === 'ubuntu24.04-x64' && core.utils.isOfficiallySupportedPlatform === true);
  requireCondition(core?.registry?.registryDirectory === BUNDLE_CACHE);
  const registry = core.registry.registry;
  requireCondition(typeof registry?.findExecutable === 'function' && typeof registry._validateHostRequirements === 'function');
  requireDescriptor(registry.findExecutable('chromium-headless-shell'), 'chromium-headless-shell', SHELL_DIRECTORY, '1243', '153.0.8010.12', SHELL_EXECUTABLE, shellURLs);
  requireDescriptor(registry.findExecutable('ffmpeg'), 'ffmpeg', FFMPEG_DIRECTORY, '1011', undefined, FFMPEG_EXECUTABLE, ffmpegURLs);
  return registry;
}

/** Fresh means mkdir without recursive/exist fallback, not reuse or permission repair. @param {DriverBoundaries} io @param {number} uid */
async function createFreshCache(io, uid) {
  await requireReal(io, path.dirname(BUNDLE_CACHE), 'directory');
  await io.mkdir(BUNDLE_CACHE, { mode: 0o700, recursive: false });
  const info = await requireReal(io, BUNDLE_CACHE, 'directory');
  requireCondition(info.uid === uid && (info.mode & 0o7777) === 0o700);
  requireCondition((await io.readdir(BUNDLE_CACHE)).length === 0);
}

/** Reject links (including in-tree links), special files, unsafe names and unbounded trees. @param {DriverBoundaries} io @param {string} root @param {number} uid */
async function verifyTree(io, root, uid) {
  const queue = [{ name: root, depth: 0 }];
  let count = 0;
  while (queue.length) {
    const entry = queue.shift();
    if (!entry) throw new Error('BUNDLED_DRIVER_REJECTED');
    requireCondition(entry.depth <= 16 && ++count <= 4096);
    const info = await io.lstat(entry.name);
    requireCondition(info.kind === 'file' || info.kind === 'directory');
    requireCondition(await io.realpath(entry.name) === entry.name);
    requireCondition(info.uid === uid && (info.mode & 0o7022) === 0);
    if (info.kind === 'directory') {
      const names = await io.readdir(entry.name);
      requireCondition(names.length <= 4096);
      if (entry.name === root) requireCondition(names.length > 0);
      for (const name of names) {
        requireCondition(name !== '.' && name !== '..' && /^[A-Za-z0-9_.+-]+$/.test(name));
        queue.push({ name: path.join(entry.name, name), depth: entry.depth + 1 });
      }
    }
  }
}

/** @param {DriverBoundaries} io @param {string} file */
async function requireExecutable(io, file) {
  const info = await requireReal(io, file, 'file');
  requireCondition(info.size > 0);
  await io.access(file, constants.R_OK | constants.X_OK);
}

/** @param {DriverBoundaries} io @param {number} uid */
async function verifyInstalledBundle(io, uid) {
  const cache = await requireReal(io, BUNDLE_CACHE, 'directory');
  requireCondition(cache.uid === uid && (cache.mode & 0o7777) === 0o700);
  for (const root of [SHELL_DIRECTORY, FFMPEG_DIRECTORY]) {
    await verifyTree(io, root, uid);
    const marker = path.join(root, 'INSTALLATION_COMPLETE');
    await requireReal(io, marker, 'file');
    await io.access(marker, constants.R_OK);
  }
  await requireReal(io, SHELL_PAYLOAD, 'directory');
  requireCondition((await io.readdir(SHELL_PAYLOAD)).length > 0);
  await requireExecutable(io, SHELL_EXECUTABLE);
  await requireExecutable(io, FFMPEG_EXECUTABLE);
  // DEPENDENCIES_VALIDATED is intentionally not read or used as evidence.
}

/** Validate a bounded ELF64/x86-64 program-header table; static or ambiguous input is rejected before ldd. @param {Buffer} bytes @param {boolean} mainExecutable */
export function validateDynamicElf(bytes, mainExecutable) {
  requireCondition(bytes.length >= 64 && bytes.length <= ELF_PREFIX_LIMIT);
  requireCondition(bytes.subarray(0, 4).equals(Buffer.from([0x7f, 0x45, 0x4c, 0x46])));
  requireCondition(bytes[4] === 2 && bytes[5] === 1 && bytes[6] === 1);
  requireCondition([2, 3].includes(bytes.readUInt16LE(16)) && bytes.readUInt16LE(18) === 62);
  requireCondition(bytes.readUInt32LE(20) === 1 && bytes.readUInt16LE(52) === 64);
  const startBig = bytes.readBigUInt64LE(32);
  requireCondition(startBig <= BigInt(ELF_PREFIX_LIMIT));
  const start = Number(startBig);
  const size = bytes.readUInt16LE(54);
  const count = bytes.readUInt16LE(56);
  requireCondition(start >= 64 && size === 56 && count > 0 && count <= 128 && start + count * size <= bytes.length);
  let dynamic = false;
  let interpreter = false;
  for (let i = 0; i < count; i++) {
    const type = bytes.readUInt32LE(start + i * size);
    if (type === 2) dynamic = true;
    if (type === 3) interpreter = true;
  }
  requireCondition(dynamic && (!mainExecutable || interpreter));
}

/** Only deterministic C-locale dynamic-dependency records are accepted. @param {CommandResult} result */
export function validateLddResult(result) {
  // An output overflow remains an output failure even when the adapter kills
  // that process to enforce the bound and consequently reports a signal.
  if (result.overflow) throw new DependencyRejection(DRIVER_EXIT_CODES.dependencyOutput);
  if (result.code !== 0 || result.signal !== null || result.error || result.timedOut)
    throw new DependencyRejection(DRIVER_EXIT_CODES.dependencyTool);
  try {
    requireCondition(result.stderr.length === 0 && Buffer.byteLength(result.stdout) <= OUTPUT_LIMIT);
    requireCondition(/^[\x09\x0a\x20-\x7e]+$/.test(result.stdout));
    const lines = result.stdout.split('\n').map(line => line.trim()).filter(Boolean);
    requireCondition(lines.length > 0 && lines.length <= 512);
    let resolved = 0;
    let missing = 0;
    let unmappedMissing = false;
    let lowestMissingId = MISSING_LIBRARIES.length + 1;
    for (const line of lines) {
      const arrow = /^[A-Za-z0-9_.+-]+ => \/[A-Za-z0-9_./+-]+ \(0x[0-9a-fA-F]+\)$/.test(line);
      const loader = /^\/[A-Za-z0-9_./+-]+ \(0x[0-9a-fA-F]+\)$/.test(line);
      const vdso = /^linux-vdso\.so\.[0-9]+ \(0x[0-9a-fA-F]+\)$/.test(line);
      const absent = /^([A-Za-z0-9_.+-]+) => not found$/.exec(line);
      requireCondition(arrow || loader || vdso || absent !== null);
      if (arrow) resolved++;
      if (absent) {
        missing++;
        const known = MISSING_LIBRARIES.find(entry => entry.library === absent[1]);
        if (known) lowestMissingId = Math.min(lowestMissingId, known.id);
        else unmappedMissing = true;
      }
    }
    requireCondition(resolved > 0 || missing > 0);
    if (missing) throw new DependencyRejection(unmappedMissing
      ? DRIVER_EXIT_CODES.dependencies : 63 + lowestMissingId);
  } catch (error) {
    if (error instanceof DependencyRejection) throw error;
    throw new DependencyRejection(DRIVER_EXIT_CODES.dependencyOutput);
  }
}

/** Match upstream direct-child regular executable/.so candidates, with stricter evidence requirements. @param {DriverBoundaries} io */
async function dependencyCandidates(io) {
  const names = await io.readdir(SHELL_PAYLOAD);
  requireCondition(names.length > 0 && names.length <= 512);
  const candidates = [];
  for (const name of names.sort()) {
    requireCondition(/^[A-Za-z0-9_.+-]+$/.test(name) && name !== '.' && name !== '..');
    const file = path.join(SHELL_PAYLOAD, name);
    const info = await io.lstat(file);
    if (info.kind === 'directory') continue;
    requireCondition(info.kind === 'file' && await io.realpath(file) === file);
    const base = name.toLowerCase();
    if (base.endsWith('.so') || base.includes('.so.') || await io.executable(file)) candidates.push(file);
  }
  requireCondition(candidates.length > 0 && candidates.length <= 128 && candidates.includes(SHELL_EXECUTABLE));
  return candidates;
}

/** @param {DriverBoundaries} io @param {DriverContext} context */
async function preflightDependencies(io, context) {
  const candidates = await dependencyCandidates(io);
  for (const file of candidates) {
    const info = await requireReal(io, file, 'file');
    requireCondition(info.size > 0);
    await io.access(file, constants.R_OK);
    validateDynamicElf(await io.readPrefix(file, ELF_PREFIX_LIMIT), file === SHELL_EXECUTABLE);
    /** @type {CommandResult} */
    let result;
    try {
      result = await io.command({
        file: '/usr/bin/ldd', args: [file], cwd: SHELL_PAYLOAD,
        env: { ...context.env, LD_LIBRARY_PATH: SHELL_PAYLOAD },
        timeoutMs: 5000, maxOutputBytes: OUTPUT_LIMIT, stdio: 'capture',
      });
    } catch {
      throw new DependencyRejection(DRIVER_EXIT_CODES.dependencyTool);
    }
    validateLddResult(result);
  }
  return candidates;
}

/**
 * This child owns no process-group supervisor. Its parent must bound the ENTIRE
 * install + validation stage at 240 seconds with the approved 5-second kill grace,
 * suppress stdout/stderr, and inspect/terminate the owned child group after
 * ordinary completion. Interruption must retain the outer KILL fence even when
 * the leader exits early. Signal acceptance is not full cleanup certification.
 * A zero installer exit proves installation only, never host readiness.
 * @param {DriverContext} context
 * @param {DriverBoundaries} io
 * @returns {Promise<number>} A closed categorical exit code; never raw diagnostics.
 */
export async function runDriver(context, io) {
  /** @type {number} */
  let failure = DRIVER_EXIT_CODES.contract;
  try {
    validateContext(context);
    const packageRoot = io.resolvePackage();
    await verifySource(io, packageRoot);
    const registry = verifyRegistry(io.loadCoreBundle(packageRoot));
    failure = DRIVER_EXIT_CODES.cache;
    await createFreshCache(io, context.uid);
    failure = DRIVER_EXIT_CODES.install;
    const installed = await io.command({
      file: context.executable,
      args: [path.join(packageRoot, 'cli.js'), 'install', '--only-shell', 'chromium', '--no-remove'],
      cwd: context.cwd, env: { ...context.env }, timeoutMs: 210000,
      maxOutputBytes: 0, stdio: 'ignore',
    });
    requireCondition(installed.code === 0 && installed.signal === null && !installed.error && !installed.timedOut && !installed.overflow);
    failure = DRIVER_EXIT_CODES.bundle;
    await verifySource(io, packageRoot);
    verifyRegistry(io.loadCoreBundle(packageRoot));
    await verifyInstalledBundle(io, context.uid);
    failure = DRIVER_EXIT_CODES.dependencyOutput;
    const before = await preflightDependencies(io, context);
    failure = DRIVER_EXIT_CODES.validation;
    // Pinned native descriptor erroneously names chrome-linux. This unchanged
    // official method receives the real bundle directory, bypassing ONLY the
    // skip/30-day-marker wrappers. It actually performs the official validation
    // and writes no validation marker. Chromium's dlopen list is empty.
    await registry._validateHostRequirements('javascript', SHELL_DIRECTORY, ['chrome-headless-shell-linux64'], [], []);
    failure = DRIVER_EXIT_CODES.bundle;
    await verifySource(io, packageRoot);
    await verifyInstalledBundle(io, context.uid);
    failure = DRIVER_EXIT_CODES.dependencyOutput;
    const after = await dependencyCandidates(io);
    requireCondition(before.length === after.length && before.every((file, index) => after[index] === file));
    return DRIVER_EXIT_CODES.success;
  } catch (error) {
    return error instanceof DependencyRejection ? error.exitCode : failure;
  }
}

/** Bounded subprocess adapter. Descendants remain in the parent's lifecycle group. @param {CommandRequest} request @returns {Promise<CommandResult>} */
function nativeCommand(request) {
  return new Promise(resolve => {
    /** @type {CommandResult} */
    const result = { code: null, signal: null, error: false, timedOut: false, overflow: false, stdout: '', stderr: '' };
    const child = spawn(request.file, request.args, {
      cwd: request.cwd, env: request.env, shell: false, detached: false,
      windowsHide: true, stdio: request.stdio === 'ignore' ? 'ignore' : ['ignore', 'pipe', 'pipe'],
    });
    let bytes = 0;
    /** @param {'stdout'|'stderr'} stream @param {Buffer} chunk */
    const capture = (stream, chunk) => {
      bytes += chunk.length;
      if (bytes > request.maxOutputBytes) {
        result.overflow = true;
        child.kill('SIGKILL');
        return;
      }
      result[stream] += chunk.toString('utf8');
    };
    child.stdout?.on('data', chunk => capture('stdout', chunk));
    child.stderr?.on('data', chunk => capture('stderr', chunk));
    const timer = setTimeout(() => {
      result.timedOut = true;
      child.kill('SIGKILL');
    }, request.timeoutMs);
    child.on('error', () => { result.error = true; });
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      result.code = code;
      result.signal = signal;
      resolve(result);
    });
  });
}

/** Build native adapters without resolving/loading Playwright or doing I/O until explicitly called. @param {DriverContext} context @returns {DriverBoundaries} */
export function createNativeBoundaries(context) {
  const require = createRequire(path.join(context.cwd, 'package.json'));
  return {
    resolvePackage: () => path.dirname(require.resolve('playwright-core/package.json')),
    loadCoreBundle: packageRoot => {
      // require() is the Node CJS boundary. This declaration documents its pinned
      // real ABI; verifyRegistry performs the runtime checks before method use.
      /** @type {CoreBundle} */
      const core = require(path.join(packageRoot, 'lib/coreBundle.js'));
      return core;
    },
    lstat: async name => {
      const value = await fs.lstat(name);
      return { kind: value.isFile() ? 'file' : value.isDirectory() ? 'directory' : value.isSymbolicLink() ? 'symlink' : 'other', size: value.size, mode: value.mode, uid: value.uid };
    },
    realpath: name => fs.realpath(name),
    readdir: name => fs.readdir(name),
    access: (name, mode) => fs.access(name, mode),
    executable: name => fs.access(name, constants.X_OK).then(() => true, () => false),
    readPrefix: async (name, limit) => {
      const handle = await fs.open(name, 'r');
      try {
        const buffer = Buffer.alloc(limit);
        const { bytesRead } = await handle.read(buffer, 0, limit, 0);
        return buffer.subarray(0, bytesRead);
      } finally { await handle.close(); }
    },
    digest: async (name, limit) => {
      const handle = await fs.open(name, 'r');
      try {
        const info = await handle.stat();
        requireCondition(info.isFile() && info.size > 0 && info.size <= limit);
        const bytes = Buffer.alloc(info.size + 1);
        let read = 0;
        while (read < bytes.length) {
          const result = await handle.read(bytes, read, bytes.length - read, read);
          if (!result.bytesRead) break;
          read += result.bytesRead;
        }
        requireCondition(read === info.size);
        return createHash('sha256').update(bytes.subarray(0, read)).digest('hex');
      } finally { await handle.close(); }
    },
    mkdir: async (name, options) => { await fs.mkdir(name, options); },
    command: nativeCommand,
  };
}

// Importing this module is pure. Only direct CLI invocation performs native work.
if (process.argv[1] && path.isAbsolute(process.argv[1])
  && process.argv[1] === path.join(process.cwd(), 'scripts/isolated-chromium-smoke/bundled-driver.mjs')) {
  try {
    /** @type {DriverContext} */
    const context = { cwd: process.cwd(), executable: process.execPath,
      platform: process.platform, arch: process.arch, uid: process.getuid?.() ?? -1,
      umask: process.umask(), env: process.env };
    runDriver(context, createNativeBoundaries(context)).then(code => { process.exitCode = code; })
      .catch(() => { process.exitCode = DRIVER_EXIT_CODES.unexpected; });
  } catch {
    process.exitCode = DRIVER_EXIT_CODES.unexpected;
  }
}
