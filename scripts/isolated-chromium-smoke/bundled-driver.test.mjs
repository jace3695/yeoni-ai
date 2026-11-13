// @ts-check
import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import {
  BUNDLE_CACHE, driverEnvironment, DRIVER_EXIT_CODES, SOURCE_PINS,
  SHELL_DIRECTORY, SHELL_PAYLOAD, SHELL_EXECUTABLE,
  FFMPEG_DIRECTORY, FFMPEG_EXECUTABLE, runDriver,
  validateDynamicElf, validateLddResult, MISSING_LIBRARIES, missingLibraryId,
} from './bundled-driver.mjs';

/** @typedef {import('./bundled-driver.mjs').DriverContext} DriverContext */
/** @typedef {import('./bundled-driver.mjs').DriverBoundaries} DriverBoundaries */
/** @typedef {import('./bundled-driver.mjs').CoreBundle} CoreBundle */
/** @typedef {import('./bundled-driver.mjs').FileInfo} FileInfo */
/** @typedef {import('./bundled-driver.mjs').CommandRequest} CommandRequest */
/** @typedef {import('./bundled-driver.mjs').CommandResult} CommandResult */
/** @typedef {import('./bundled-driver.mjs').ExecutableDescriptor} ExecutableDescriptor */

const ROOT = '/synthetic/project/node_modules/playwright-core';
const LIBRARY = `${SHELL_PAYLOAD}/libEGL.so`;
const CHILD_LIBRARY = `${SHELL_PAYLOAD}/resources/ignored.so`;

/** Synthetic ELF bytes only, never passed to any actual executable. @param {boolean} [interpreter] */
function elf(interpreter = true) {
  const bytes = Buffer.alloc(176);
  bytes.set([0x7f, 0x45, 0x4c, 0x46, 2, 1, 1]);
  bytes.writeUInt16LE(3, 16);
  bytes.writeUInt16LE(62, 18);
  bytes.writeUInt32LE(1, 20);
  bytes.writeBigUInt64LE(BigInt(64), 32);
  bytes.writeUInt16LE(64, 52);
  bytes.writeUInt16LE(56, 54);
  bytes.writeUInt16LE(2, 56);
  bytes.writeUInt32LE(2, 64);
  bytes.writeUInt32LE(interpreter ? 3 : 1, 120);
  return bytes;
}

/** @returns {CommandResult} */
function cleanResult() {
  return { code: 0, signal: null, error: false, timedOut: false, overflow: false, stdout: '', stderr: '' };
}
/** @returns {CommandResult} */
function cleanLdd() {
  return { ...cleanResult(), stdout: '\tlinux-vdso.so.1 (0x00007fff)\n\tlibc.so.6 => /lib/x86_64-linux-gnu/libc.so.6 (0x00007aaa)\n\t/lib64/ld-linux-x86-64.so.2 (0x00007bbb)\n' };
}
/** @param {'file'|'directory'|'symlink'|'other'} [kind] @param {number} [mode] @param {number} [size] @returns {FileInfo} */
function info(kind = 'file', mode = 0o600, size = 1) {
  return { kind, mode, size, uid: 1001 };
}

/** Build ONLY injected memory, command and registry boundaries. */
function fixture() {
  /** @type {DriverContext} */
  const context = { cwd: '/synthetic/project', executable: '/official/node', platform: 'linux', arch: 'x64', uid: 1001, umask: 0o077, env: { ...driverEnvironment } };
  /** @type {Map<string, FileInfo>} */
  const files = new Map();
  /** @type {Map<string, Buffer>} */
  const contents = new Map();
  /** @type {Map<string, string>} */
  const digests = new Map();
  /** @type {Map<string, string>} */
  const realPaths = new Map();
  /** @type {Set<string>} */
  const denied = new Set();
  /** @type {CommandRequest[]} */
  const commands = [];
  /** @type {{ name: string, options: { mode: number, recursive: false } }[]} */
  const mkdirs = [];
  /** @type {{ language: string, directory: string, linuxDirectories: string[], dlopenLibraries: string[], windowsDirectories: string[] }[]} */
  const hostCalls = [];
  /** @type {string[]} */
  const loads = [];
  /** @type {string[]} */
  const reads = [];
  /** @type {{ install: CommandResult, ldd: CommandResult, installThrows: boolean, hostThrows: boolean, afterInstall: () => void, duringHost: () => void }} */
  const control = { install: cleanResult(), ldd: cleanLdd(), installThrows: false, hostThrows: false, afterInstall: () => {}, duringHost: () => {} };
  files.set(ROOT, info('directory', 0o755));
  files.set(path.dirname(BUNDLE_CACHE), info('directory', 0o755));
  for (const [relative, digest] of Object.entries(SOURCE_PINS)) {
    const name = path.join(ROOT, relative);
    files.set(name, info('file', 0o644, 200));
    digests.set(name, digest);
  }
  /** @type {ExecutableDescriptor} */
  const shell = { name: 'chromium-headless-shell', directory: SHELL_DIRECTORY, revision: '1243', browserVersion: '153.0.8010.12', installType: 'download-by-default', _isHermeticInstallation: true,
    downloadURLs: ['https://cdn.playwright.dev/builds/cft/153.0.8010.12/linux64/chrome-headless-shell-linux64.zip'], executablePath: () => SHELL_EXECUTABLE };
  /** @type {ExecutableDescriptor} */
  const ffmpeg = { name: 'ffmpeg', directory: FFMPEG_DIRECTORY, revision: '1011', installType: 'download-by-default', _isHermeticInstallation: true,
    downloadURLs: ['https://cdn.playwright.dev/dbazure/download/playwright/builds/ffmpeg/1011/ffmpeg-linux.zip', 'https://playwright.download.prss.microsoft.com/dbazure/download/playwright/builds/ffmpeg/1011/ffmpeg-linux.zip', 'https://cdn.playwright.dev/builds/ffmpeg/1011/ffmpeg-linux.zip'], executablePath: () => FFMPEG_EXECUTABLE };
  /** @type {CoreBundle} */
  const core = {
    registry: { registryDirectory: BUNDLE_CACHE, registry: {
      findExecutable: name => name === 'chromium-headless-shell' ? shell : name === 'ffmpeg' ? ffmpeg : undefined,
      _validateHostRequirements: async (language, directory, linuxDirectories, dlopenLibraries, windowsDirectories) => {
        hostCalls.push({ language, directory, linuxDirectories, dlopenLibraries, windowsDirectories });
        control.duringHost();
        if (control.hostThrows) throw new Error('RAW_PRIVATE_HOST_ERROR');
      },
    } },
    utils: { hostPlatform: 'ubuntu24.04-x64', isOfficiallySupportedPlatform: true },
  };
  function populate() {
    for (const name of [SHELL_DIRECTORY, SHELL_PAYLOAD, `${SHELL_PAYLOAD}/resources`, FFMPEG_DIRECTORY]) files.set(name, info('directory', 0o700));
    for (const name of [SHELL_EXECUTABLE, FFMPEG_EXECUTABLE]) files.set(name, info('file', 0o755, 176));
    files.set(LIBRARY, info('file', 0o600, 176));
    files.set(CHILD_LIBRARY, info('file', 0o600, 176));
    files.set(`${SHELL_PAYLOAD}/icudtl.dat`, info('file', 0o600, 9));
    contents.set(SHELL_EXECUTABLE, elf());
    contents.set(LIBRARY, elf(false));
    for (const root of [SHELL_DIRECTORY, FFMPEG_DIRECTORY]) {
      files.set(`${root}/INSTALLATION_COMPLETE`, info('file', 0o600, 0));
      // Deliberately misleading wrapper marker must not skip actual checks.
      files.set(`${root}/DEPENDENCIES_VALIDATED`, info('file', 0o600, 0));
    }
  }
  /** @type {DriverBoundaries} */
  const io = {
    resolvePackage: () => ROOT,
    loadCoreBundle: root => { loads.push(root); return core; },
    lstat: async name => {
      reads.push(name);
      const value = files.get(name);
      if (!value) throw new Error('SYNTHETIC_MISSING');
      return value;
    },
    realpath: async name => realPaths.get(name) ?? name,
    readdir: async name => [...files.keys()].filter(file => path.dirname(file) === name).map(file => path.basename(file)),
    access: async (name, mode) => {
      const value = files.get(name);
      if (!value || denied.has(name) || ((mode & 1) && !(value.mode & 0o100))) throw new Error('SYNTHETIC_UNREADABLE');
    },
    executable: async name => Boolean((files.get(name)?.mode ?? 0) & 0o100),
    readPrefix: async (name, limit) => {
      const value = contents.get(name);
      if (!value) throw new Error('SYNTHETIC_BYTES_MISSING');
      return value.subarray(0, limit);
    },
    digest: async name => digests.get(name) ?? 'missing',
    mkdir: async (name, options) => {
      mkdirs.push({ name, options });
      if (files.has(name)) throw new Error('SYNTHETIC_EEXIST');
      files.set(name, info('directory', options.mode));
    },
    command: async request => {
      commands.push(request);
      if (request.file === context.executable) {
        if (control.installThrows) throw new Error('RAW_PRIVATE_INSTALL_ERROR');
        if (control.install.code === 0) populate();
        control.afterInstall();
        return control.install;
      }
      assert.equal(request.file, '/usr/bin/ldd');
      return control.ldd;
    },
  };
  return { context, io, core, shell, ffmpeg, control, files, contents, digests, realPaths, denied, commands, mkdirs, hostCalls, loads, reads };
}
/** @typedef {ReturnType<typeof fixture>} Fixture */

// Driver tests below use synthetic boundaries. One source-conformance test
// reads and hashes the installed source without loading/executing it. There is
// no process.env mutation, native command, filesystem write, download or validation.
test('success uses exact fresh bundle route and the corrected official direct API', async () => {
  const f = fixture();
  assert.equal(await runDriver(f.context, f.io), 0);
  assert.deepEqual(f.mkdirs, [{ name: BUNDLE_CACHE, options: { mode: 0o700, recursive: false } }]);
  assert.deepEqual(f.commands.map(command => command.file), ['/official/node', '/usr/bin/ldd', '/usr/bin/ldd']);
  assert.deepEqual(f.commands[0]?.args, [`${ROOT}/cli.js`, 'install', '--only-shell', 'chromium', '--no-remove']);
  assert.equal(f.commands[0]?.stdio, 'ignore');
  assert.equal(f.commands[0]?.timeoutMs, 210000);
  assert.equal(f.commands[0]?.maxOutputBytes, 0);
  assert.deepEqual(f.commands[0]?.env, driverEnvironment);
  assert.deepEqual(f.commands.slice(1).map(command => command.args), [[SHELL_EXECUTABLE], [LIBRARY]]);
  for (const command of f.commands.slice(1)) {
    assert.equal(command.cwd, SHELL_PAYLOAD);
    assert.equal(command.timeoutMs, 5000);
    assert.equal(command.maxOutputBytes, 65536);
    assert.deepEqual(command.env, { ...driverEnvironment, LD_LIBRARY_PATH: SHELL_PAYLOAD });
  }
  assert.deepEqual(f.hostCalls, [{ language: 'javascript', directory: SHELL_DIRECTORY, linuxDirectories: ['chrome-headless-shell-linux64'], dlopenLibraries: [], windowsDirectories: [] }]);
  assert.equal(f.commands.some(command => command.args.includes(FFMPEG_EXECUTABLE)), false);
  assert.equal(f.commands.some(command => command.args.includes(CHILD_LIBRARY)), false);
  assert.equal(f.loads.length, 2);
  for (const version of ['20261101.360.1', '20261111.370.1']) {
    const accepted = fixture(); accepted.context.env.ImageVersion = version;
    assert.equal(await runDriver(accepted.context, accepted.io), 0);
    assert.ok(accepted.commands.every(command => command.env.ImageVersion === version));
  }
  for (const version of ['20261102.1.1', '20261111.370.2', '20261101.360.1 ', '']) {
    const rejected = fixture(); rejected.context.env.ImageVersion = version;
    assert.equal(await runDriver(rejected.context, rejected.io), DRIVER_EXIT_CODES.contract);
    assert.equal(rejected.commands.length, 0); assert.equal(rejected.mkdirs.length, 0);
  }
});

/** @type {[string, (f: Fixture) => void][]} */
const badContexts = [
  ['wrong platform', f => { f.context.platform = 'darwin'; }],
  ['wrong architecture', f => { f.context.arch = 'arm64'; }],
  ['root uid', f => { f.context.uid = 0; }],
  ['open umask', f => { f.context.umask = 0o022; }],
  ['relative cwd', f => { f.context.cwd = './project'; }],
  ['wrong cache', f => { f.context.env.PLAYWRIGHT_BROWSERS_PATH = '/tmp/shared'; }],
  ['changed image', f => { f.context.env.ImageVersion = 'different'; }],
  ['missing locale', f => { delete f.context.env.LANG; }],
  ['unsupported platform', f => { f.core.utils.isOfficiallySupportedPlatform = false; }],
  ['wrong native host', f => { f.core.utils.hostPlatform = 'ubuntu22.04-x64'; }],
  ['wrong registry path', f => { f.core.registry.registryDirectory = '/tmp/elsewhere'; }],
  ['wrong shell revision', f => { f.shell.revision = '1242'; }],
  ['wrong shell version', f => { f.shell.browserVersion = '152'; }],
  ['wrong ffmpeg revision', f => { f.ffmpeg.revision = '1010'; }],
  ['non-hermetic shell', f => { f.shell._isHermeticInstallation = false; }],
  ['system executable', f => { f.shell.executablePath = () => '/usr/bin/google-chrome'; }],
  ['full Chromium path', f => { f.shell.executablePath = () => `${BUNDLE_CACHE}/chromium-1243/chrome-linux64/chrome`; }],
  ['alternate download URL', f => { f.shell.downloadURLs = ['https://untrusted.invalid/download']; }],
  ['missing registry descriptor', f => { f.core.registry.registry.findExecutable = () => undefined; }],
];
for (const variable of ['PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD', 'PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS', 'PLAYWRIGHT_HOST_PLATFORM_OVERRIDE', 'PLAYWRIGHT_DOWNLOAD_HOST', 'PLAYWRIGHT_CHROMIUM_DOWNLOAD_HOST', 'PLAYWRIGHT_BROWSERS_PATH']) {
  for (const prefix of ['', 'npm_config_', 'npm_package_config_']) {
    const key = prefix ? `${prefix}${variable.toLowerCase()}` : variable;
    if (key === 'PLAYWRIGHT_BROWSERS_PATH') continue;
    badContexts.push([`override ${key}`, f => { f.context.env[key] = ''; }]);
  }
}
for (const key of ['LD_LIBRARY_PATH', 'LD_PRELOAD', 'DYLD_INSERT_LIBRARIES', 'NODE_OPTIONS', 'NODE_PATH', 'HTTPS_PROXY', 'HTTP_PROXY', 'ALL_PROXY', 'DEBUG', 'HOME', 'PW_TEST_CDN_THAT_SHOULD_WORK']) {
  badContexts.push([`unexpected environment ${key}`, f => { f.context.env[key] = 'injected'; }]);
}
for (const [name, change] of badContexts) {
  test(`contract closes before cache/install: ${name}`, async () => {
    const f = fixture(); change(f);
    assert.equal(await runDriver(f.context, f.io), DRIVER_EXIT_CODES.contract);
    assert.equal(f.mkdirs.length, 0); assert.equal(f.commands.length, 0); assert.equal(f.hostCalls.length, 0);
  });
}

for (const relative of Object.keys(SOURCE_PINS)) {
  test(`every source pin is required before package load: ${relative}`, async () => {
    const f = fixture(); f.digests.set(`${ROOT}/${relative}`, 'wrong');
    assert.equal(await runDriver(f.context, f.io), DRIVER_EXIT_CODES.contract);
    assert.equal(f.loads.length, 0); assert.equal(f.commands.length, 0);
  });
}

test('source symlink or unreadable/empty source is rejected before loading', async () => {
  for (const change of [
    /** @param {Fixture} f */ f => { f.realPaths.set(`${ROOT}/cli.js`, '/outside/cli.js'); },
    /** @param {Fixture} f */ f => { f.denied.add(`${ROOT}/cli.js`); },
    /** @param {Fixture} f */ f => { f.files.set(`${ROOT}/cli.js`, info('file', 0o600, 0)); },
  ]) {
    const f = fixture(); change(f);
    assert.equal(await runDriver(f.context, f.io), DRIVER_EXIT_CODES.contract);
    assert.equal(f.loads.length, 0);
  }
});

test('existing cache is never reused, emptied, repaired or installed into', async () => {
  for (const value of [info('directory', 0o700), info('directory', 0o777), info('symlink')]) {
    const f = fixture(); f.files.set(BUNDLE_CACHE, value);
    assert.equal(await runDriver(f.context, f.io), DRIVER_EXIT_CODES.cache);
    assert.equal(f.files.get(BUNDLE_CACHE), value);
    assert.equal(f.commands.length, 0);
  }
});

test('symlinked cache parent is rejected before mkdir', async () => {
  const f = fixture(); f.realPaths.set(path.dirname(BUNDLE_CACHE), '/outside');
  assert.equal(await runDriver(f.context, f.io), DRIVER_EXIT_CODES.cache);
  assert.equal(f.mkdirs.length, 0);
});

/** @type {[string, Partial<CommandResult>][]} */
const commandFailures = [
  ['nonzero', { code: 1 }], ['signal', { code: 0, signal: 'SIGTERM' }],
  ['spawn error with deceptive code zero', { code: 0, error: true }],
  ['timeout', { code: 0, timedOut: true }], ['overflow', { code: 0, overflow: true }],
  ['null exit', { code: null }],
];
for (const [name, change] of commandFailures) {
  test(`installer fails closed: ${name}`, async () => {
    const f = fixture(); Object.assign(f.control.install, change);
    assert.equal(await runDriver(f.context, f.io), DRIVER_EXIT_CODES.install);
    assert.equal(f.commands.length, 1); assert.equal(f.hostCalls.length, 0);
  });
  test(`ldd fails closed: ${name}`, async () => {
    const f = fixture(); Object.assign(f.control.ldd, change);
    assert.equal(await runDriver(f.context, f.io), change.overflow ? DRIVER_EXIT_CODES.dependencyOutput : DRIVER_EXIT_CODES.dependencyTool);
    assert.equal(f.hostCalls.length, 0);
  });
}

test('thrown install diagnostics become only the closed install code', async () => {
  const f = fixture(); f.control.installThrows = true;
  assert.equal(await runDriver(f.context, f.io), DRIVER_EXIT_CODES.install);
  assert.equal(f.hostCalls.length, 0);
});

/** @type {[string, (f: Fixture) => void][]} */
const brokenBundles = [
  ['missing shell executable', f => { f.files.delete(SHELL_EXECUTABLE); }],
  ['empty shell executable', f => { f.files.set(SHELL_EXECUTABLE, info('file', 0o755, 0)); }],
  ['nonexecutable shell', f => { f.files.set(SHELL_EXECUTABLE, info('file', 0o600, 176)); }],
  ['unreadable shell', f => { f.denied.add(SHELL_EXECUTABLE); }],
  ['missing shell install marker', f => { f.files.delete(`${SHELL_DIRECTORY}/INSTALLATION_COMPLETE`); }],
  ['missing ffmpeg install marker', f => { f.files.delete(`${FFMPEG_DIRECTORY}/INSTALLATION_COMPLETE`); }],
  ['missing ffmpeg', f => { f.files.delete(FFMPEG_EXECUTABLE); }],
  ['outside symlink library', f => { f.files.set(LIBRARY, info('symlink')); f.realPaths.set(LIBRARY, '/outside/libEGL.so'); }],
  ['nested outside symlink', f => { f.files.set(CHILD_LIBRARY, info('symlink')); }],
  ['in-tree symlink also closed', f => { f.files.set(LIBRARY, info('symlink')); f.realPaths.set(LIBRARY, SHELL_EXECUTABLE); }],
  ['world writable library', f => { f.files.set(LIBRARY, info('file', 0o666, 176)); }],
  ['special file', f => { f.files.set(`${SHELL_PAYLOAD}/socket`, info('other')); }],
  ['owner mismatch', f => { f.files.set(LIBRARY, { ...info('file', 0o600, 176), uid: 1002 }); }],
  ['source changed during install', f => { f.digests.set(`${ROOT}/lib/coreBundle.js`, 'mutated'); }],
  ['wrong scan directory only', f => {
    for (const name of [...f.files.keys()]) if (name === SHELL_PAYLOAD || name.startsWith(`${SHELL_PAYLOAD}/`)) f.files.delete(name);
    f.files.set(`${SHELL_DIRECTORY}/chrome-linux`, info('directory', 0o700));
  }],
];
for (const [name, change] of brokenBundles) {
  test(`bundle evidence closes after install: ${name}`, async () => {
    const f = fixture(); f.control.afterInstall = () => change(f);
    assert.equal(await runDriver(f.context, f.io), DRIVER_EXIT_CODES.bundle);
    assert.equal(f.commands.length, 1); assert.equal(f.hostCalls.length, 0);
  });
}

for (const stdout of ['', '\n', 'statically linked\n', 'not a dynamic executable\n', 'garbage\n', 'libc.so.6 => /lib/libc.so.6 (bad)\n', '\x1b[0msecret\n', '\tlinux-vdso.so.1 (0x1234)\n', 'x'.repeat(65537)]) {
  test(`ldd grammar rejects ${JSON.stringify(stdout.slice(0, 50))}`, async () => {
    const f = fixture(); f.control.ldd.stdout = stdout;
    assert.equal(await runDriver(f.context, f.io), DRIVER_EXIT_CODES.dependencyOutput);
    assert.equal(f.hostCalls.length, 0);
  });
}

test('any ldd stderr rejects even a successful stdout/status', async () => {
  const f = fixture(); f.control.ldd.stderr = 'warning';
  assert.equal(await runDriver(f.context, f.io), DRIVER_EXIT_CODES.dependencyOutput);
  assert.equal(f.hostCalls.length, 0);
});

/** @type {[string, (bytes: Buffer) => void][]} */
const badElf = [
  ['script instead of ELF', bytes => { bytes.write('#!/bin/sh'); }],
  ['32-bit', bytes => { bytes[4] = 1; }],
  ['wrong endian', bytes => { bytes[5] = 2; }],
  ['wrong machine', bytes => { bytes.writeUInt16LE(183, 18); }],
  ['static', bytes => { bytes.writeUInt32LE(1, 64); }],
  ['missing interpreter', bytes => { bytes.writeUInt32LE(1, 120); }],
  ['unbounded program offset', bytes => { bytes.writeBigUInt64LE(BigInt(100000), 32); }],
  ['truncated program table', bytes => { bytes.writeUInt16LE(128, 56); }],
];
for (const [name, change] of badElf) {
  test(`ldd never runs on ambiguous or incompatible ELF: ${name}`, async () => {
    const f = fixture(); f.control.afterInstall = () => { const bytes = elf(); change(bytes); f.contents.set(SHELL_EXECUTABLE, bytes); };
    assert.equal(await runDriver(f.context, f.io), DRIVER_EXIT_CODES.dependencyOutput);
    assert.equal(f.commands.length, 1); assert.equal(f.hostCalls.length, 0);
  });
}

test('non-ELF .so is rejected even if main shell ldd succeeded', async () => {
  const f = fixture(); f.control.afterInstall = () => f.contents.set(LIBRARY, Buffer.from('not ELF'));
  assert.equal(await runDriver(f.context, f.io), DRIVER_EXIT_CODES.dependencyOutput);
  assert.equal(f.commands.length, 2); assert.equal(f.hostCalls.length, 0);
});

test('cached validation marker cannot mask official direct validator failure', async () => {
  const f = fixture(); f.control.hostThrows = true;
  assert.equal(await runDriver(f.context, f.io), DRIVER_EXIT_CODES.validation);
  assert.equal(f.hostCalls.length, 1); assert.equal(f.commands.length, 3);
});

test('successful official validation cannot mask source or bundle mutation', async () => {
  const f = fixture(); f.control.duringHost = () => f.files.delete(`${SHELL_DIRECTORY}/INSTALLATION_COMPLETE`);
  assert.equal(await runDriver(f.context, f.io), DRIVER_EXIT_CODES.bundle);
});

test('candidate set change during official validation cannot be accepted', async () => {
  const f = fixture(); f.control.duringHost = () => f.files.set(`${SHELL_PAYLOAD}/late.so`, info('file', 0o600, 176));
  assert.equal(await runDriver(f.context, f.io), DRIVER_EXIT_CODES.dependencyOutput);
});

test('fixed exports remain immutable and strict helpers accept the intended synthetic grammar', () => {
  assert.ok(Object.isFrozen(driverEnvironment));
  assert.ok(Object.isFrozen(SOURCE_PINS));
  assert.ok(Object.isFrozen(DRIVER_EXIT_CODES));
  assert.equal(validateDynamicElf(elf(), true), undefined);
  assert.equal(validateDynamicElf(elf(false), false), undefined);
  assert.equal(validateLddResult(cleanLdd()), undefined);
});


test('recognized missing libraries have their own closed dependency category', async () => {
  for (const stdout of [
    'libfoo.so => not found\n',
    `${cleanLdd().stdout}\tlibfoo.so => not found\n`,
  ]) {
    const f = fixture(); f.control.ldd.stdout = stdout;
    assert.equal(await runDriver(f.context, f.io), DRIVER_EXIT_CODES.dependencies);
    assert.equal(f.hostCalls.length, 0);
  }
});

test('a missing-library-looking line is not trusted amid malformed or diagnostic output', async () => {
  for (const stdout of [
    'libfoo.so => not found\nwarning: loader failed\n',
    'libfoo.so => not found\ngarbage\n',
    'unexpected not found\n',
  ]) {
    const f = fixture(); f.control.ldd.stdout = stdout;
    assert.equal(await runDriver(f.context, f.io), DRIVER_EXIT_CODES.dependencyOutput);
    assert.equal(f.hostCalls.length, 0);
  }
});

test('nonzero ldd with missing-library text is a tool failure, not validated missing dependencies', async () => {
  const f = fixture(); f.control.ldd.stdout = 'libfoo.so => not found\n'; f.control.ldd.code = 1;
  assert.equal(await runDriver(f.context, f.io), DRIVER_EXIT_CODES.dependencyTool);
});

test('overflow-triggered process kill remains a bounded output failure', async () => {
  const f = fixture(); Object.assign(f.control.ldd, { overflow: true, signal: 'SIGKILL', code: null });
  assert.equal(await runDriver(f.context, f.io), DRIVER_EXIT_CODES.dependencyOutput);
});

test('a thrown ldd boundary reports only the closed tool category', async () => {
  const f = fixture();
  const command = f.io.command;
  f.io.command = async request => {
    if (request.file === '/usr/bin/ldd') throw new Error('RAW_PRIVATE_LDD_ERROR');
    return command(request);
  };
  assert.equal(await runDriver(f.context, f.io), DRIVER_EXIT_CODES.dependencyTool);
  assert.equal(f.hostCalls.length, 0);
});

test('library names containing error are valid dependency records, not diagnostic markers', () => {
  const result = cleanLdd();
  result.stdout += '\tlibgpg-error.so.0 => /lib/x86_64-linux-gnu/libgpg-error.so.0 (0x1234)\n';
  assert.equal(validateLddResult(result), undefined);
});


test('diagnostic dictionary matches the exact hash-pinned installed Ubuntu 24.04-x64 source map', () => {
  // Read the installed package bytes without importing or executing Playwright.
  const require = createRequire(import.meta.url);
  const bytes = readFileSync(require.resolve('playwright-core/lib/coreBundle'));
  assert.equal(createHash('sha256').update(bytes).digest('hex'), SOURCE_PINS['lib/coreBundle.js']);
  const source = bytes.toString('utf8');
  const start = source.indexOf('      "ubuntu24.04-x64": {');
  const end = source.indexOf('      "ubuntu26.04-x64": {', start);
  assert.ok(start > 0 && end > start);
  const section = source.slice(start, end);
  const match = /        lib2package: \{\n([\s\S]*?)\n        \}/.exec(section);
  assert.ok(match);
  const pairs = match[1].split('\n').map(line => {
    const entry = /^          "([^"]+)": "([^"]+)"[,]?$/.exec(line);
    assert.ok(entry);
    return { library: entry[1], package: entry[2] };
  });
  pairs.sort((a, b) => a.library < b.library ? -1 : a.library > b.library ? 1 : 0);
  const expected = pairs.map((entry, index) => ({ id: index + 1, ...entry }));
  assert.deepEqual(MISSING_LIBRARIES, expected);
  assert.equal(MISSING_LIBRARIES.length, 92);
  assert.equal(new Set(MISSING_LIBRARIES.map(entry => entry.library)).size, 92);
  assert.ok(Object.isFrozen(MISSING_LIBRARIES));
  assert.ok(MISSING_LIBRARIES.every(entry => Object.isFrozen(entry)));
  assert.ok(63 + MISSING_LIBRARIES.length <= 255);
});

for (const entry of MISSING_LIBRARIES) {
  test(`known missing library selects only closed ID ${entry.id}`, async () => {
    const f = fixture();
    f.control.ldd.stdout = `${cleanLdd().stdout}\t${entry.library} => not found\n`;
    const code = await runDriver(f.context, f.io);
    assert.equal(code, 63 + entry.id);
    assert.equal(missingLibraryId(code), entry.id);
    assert.equal(f.hostCalls.length, 0);
  });
}

test('multiple recognized missing libraries choose the lowest stable ID, regardless of order or duplicates', async () => {
  const names = ['libnss3.so', 'libX11.so.6', 'libasound.so.2', 'libnss3.so'];
  for (const ordered of [names, [...names].reverse()]) {
    const f = fixture(); f.control.ldd.stdout = ordered.map(name => `${name} => not found\n`).join('');
    const code = await runDriver(f.context, f.io);
    assert.equal(code, 66);
    assert.equal(missingLibraryId(code), 3);
  }
});

test('unknown, case-changed, or suffixed library names cannot borrow a known ID', async () => {
  for (const name of ['unknown.so', 'libnss3.so.extra', 'libnss3.so.1', 'Libnss3.so', 'constructor', '__proto__']) {
    const f = fixture();
    f.control.ldd.stdout = `libX11.so.6 => not found\n${name} => not found\n`;
    const code = await runDriver(f.context, f.io);
    assert.equal(code, DRIVER_EXIT_CODES.dependencies);
    assert.equal(missingLibraryId(code), 0);
  }
});

test('hostile, path-bearing, Unicode and diagnostic suffix output cannot produce any missing-library ID', async () => {
  for (const name of ['../../libnss3.so', '/private/libnss3.so', 'libnss3.so;echo-secret', 'libnss3.so$(id)', 'libnss3.so\u001b[0m', 'libnss3.so\r', 'libnss3.so秘密', 'libnss3.so => not found; echo-secret']) {
    const f = fixture();
    f.control.ldd.stdout = `libX11.so.6 => not found\n${name} => not found\n`;
    const code = await runDriver(f.context, f.io);
    assert.equal(code, DRIVER_EXIT_CODES.dependencyOutput);
    assert.equal(missingLibraryId(code), null);
  }
});

test('known names do not override tool failure, malformed output, stderr, or native validator rejection', async () => {
  /** @type {[Partial<CommandResult>, number][]} */
  const cases = [
    [{ code: 1 }, DRIVER_EXIT_CODES.dependencyTool],
    [{ signal: 'SIGTERM' }, DRIVER_EXIT_CODES.dependencyTool],
    [{ error: true }, DRIVER_EXIT_CODES.dependencyTool],
    [{ timedOut: true }, DRIVER_EXIT_CODES.dependencyTool],
    [{ overflow: true }, DRIVER_EXIT_CODES.dependencyOutput],
    [{ stderr: 'warning' }, DRIVER_EXIT_CODES.dependencyOutput],
    [{ stdout: 'libX11.so.6 => not found\ngarbage\n' }, DRIVER_EXIT_CODES.dependencyOutput],
    [{ stdout: 'libX11.so.6 => not found (private suffix)\n' }, DRIVER_EXIT_CODES.dependencyOutput],
  ];
  for (const [change, expected] of cases) {
    const f = fixture(); f.control.ldd.stdout = 'libX11.so.6 => not found\n'; Object.assign(f.control.ldd, change);
    const code = await runDriver(f.context, f.io);
    assert.equal(code, expected); assert.equal(missingLibraryId(code), null);
  }
  const f = fixture(); f.control.hostThrows = true;
  const code = await runDriver(f.context, f.io);
  assert.equal(code, DRIVER_EXIT_CODES.validation); assert.equal(missingLibraryId(code), null);
});

test('decoder accepts only integers in its reserved range or the exact unknown sentinel', () => {
  for (let id = 1; id <= MISSING_LIBRARIES.length; id++) assert.equal(missingLibraryId(63 + id), id);
  assert.equal(missingLibraryId(24), 0);
  for (const code of [null, undefined, NaN, Infinity, -Infinity, -1, 0, 20, 23, 25, 26, 27, 28, 63, 64.5, 155.1, 156, 255, 256]) assert.equal(missingLibraryId(code), null);
});
