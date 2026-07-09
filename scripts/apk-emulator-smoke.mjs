import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const workspaceTools = path.resolve("D:/workplace/tools");
const defaultAndroidHome = path.join(workspaceTools, "android-sdk");
const androidHome = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || defaultAndroidHome;
const defaultApk = path.resolve(".agent-e2e/meteor-dodge-debug.apk");
const defaultOutDir = path.resolve(".agent-e2e");

function readArg(name, fallback) {
  const prefix = `--${name}=`;
  const value = process.argv.find((arg) => arg.startsWith(prefix));
  return value ? value.slice(prefix.length) : fallback;
}

function toolPath(name, subdir) {
  const exe = process.platform === "win32" ? `${name}.exe` : name;
  const candidate = path.join(androidHome, subdir, exe);
  return fs.existsSync(candidate) ? candidate : name;
}

function adbPath() {
  return toolPath("adb", "platform-tools");
}

function run(command, args, options = {}) {
  const output = execFileSync(command, args, {
    encoding: options.encoding ?? "utf8",
    stdio: options.stdio ?? ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      ANDROID_HOME: androidHome,
      ANDROID_SDK_ROOT: androidHome
    }
  });
  return typeof output === "string" ? output.trim() : output;
}

function findAapt() {
  const buildToolsDir = path.join(androidHome, "build-tools");
  if (!fs.existsSync(buildToolsDir)) return null;
  const versions = fs.readdirSync(buildToolsDir).sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
  for (const version of versions) {
    const exe = process.platform === "win32" ? "aapt.exe" : "aapt";
    const candidate = path.join(buildToolsDir, version, exe);
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

function inferPackageName(apk) {
  const aapt = findAapt();
  if (!aapt) {
    throw new Error("Missing --package and could not find aapt in Android build-tools.");
  }
  const badging = run(aapt, ["dump", "badging", apk]);
  const match = badging.match(/package: name='([^']+)'/);
  if (!match) {
    throw new Error("Could not infer APK package name from aapt badging output.");
  }
  return match[1];
}

function pickSerial(adb, requestedSerial) {
  if (requestedSerial) return requestedSerial;
  const devices = run(adb, ["devices"]);
  const rows = devices
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("List of devices"));
  const emulator = rows.find((line) => /^emulator-\d+\s+device\b/.test(line));
  if (emulator) return emulator.split(/\s+/)[0];
  const device = rows.find((line) => /\sdevice\b/.test(line));
  if (device) return device.split(/\s+/)[0];
  throw new Error("No running Android emulator/device found. Start an emulator first.");
}

function resolveActivity(adb, serial, packageName) {
  const output = run(adb, ["-s", serial, "shell", "cmd", "package", "resolve-activity", "--brief", packageName]);
  const activity = output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .reverse()
    .find((line) => line.includes("/"));
  if (!activity) {
    throw new Error(`Could not resolve launch activity for ${packageName}.`);
  }
  return activity;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const apk = path.resolve(readArg("apk", defaultApk));
const outDir = path.resolve(readArg("out", defaultOutDir));
const requestedSerial = readArg("serial", "");
const requestedPackage = readArg("package", "");

if (!fs.existsSync(apk)) {
  throw new Error(`APK not found: ${apk}`);
}

fs.mkdirSync(outDir, { recursive: true });

const adb = adbPath();
const serial = pickSerial(adb, requestedSerial);
const packageName = requestedPackage || inferPackageName(apk);

console.log(`Using emulator/device: ${serial}`);
console.log(`Installing APK: ${apk}`);
run(adb, ["-s", serial, "install", "-r", apk], { stdio: "inherit" });

const activity = resolveActivity(adb, serial, packageName);
console.log(`Launching: ${activity}`);
run(adb, ["-s", serial, "shell", "am", "start", "-n", activity], { stdio: "inherit" });

await sleep(Number(readArg("wait", "8000")));

const pid = run(adb, ["-s", serial, "shell", "pidof", "-s", packageName]).trim();
const screenshotPath = path.join(outDir, "apk-emulator-smoke.png");
const png = run(adb, ["-s", serial, "exec-out", "screencap", "-p"], { encoding: "buffer" });
fs.writeFileSync(screenshotPath, png);

const report = {
  ok: Boolean(pid),
  serial,
  apk,
  packageName,
  activity,
  pid,
  screenshotPath,
  checkedAt: new Date().toISOString()
};

const reportPath = path.join(outDir, "apk-emulator-smoke.json");
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf8");

console.log(`App process: ${pid || "not found"}`);
console.log(`Screenshot: ${screenshotPath}`);
console.log(`Report: ${reportPath}`);

if (!pid) {
  process.exitCode = 1;
}
