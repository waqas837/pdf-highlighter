#!/usr/bin/env node
/**
 * Build web → sync Capacitor → Gradle debug APK → adb install -r
 * Requires: ANDROID_HOME, adb on PATH, USB debugging on device.
 */
"use strict";

const { spawnSync, execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const androidDir = path.join(root, "android");
const apk = path.join(
  androidDir,
  "app/build/outputs/apk/debug/app-debug.apk",
);

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, {
    stdio: "inherit",
    cwd: opts.cwd,
    env: { ...process.env, ...opts.env },
    shell: opts.shell,
  });
  if (r.error) throw r.error;
  if (r.status !== 0) process.exit(r.status ?? 1);
}

function main() {
  console.log("adb devices:");
  const adbCheck = spawnSync("adb", ["devices"], {
    encoding: "utf8",
    shell: process.platform === "win32",
  });
  if (adbCheck.error || adbCheck.status !== 0) {
    console.error(
      "adb not found. Add Android SDK platform-tools to PATH (and set ANDROID_HOME).",
    );
    process.exit(1);
  }
  console.log(adbCheck.stdout || "");

  execSync("npm run build:android", { cwd: root, stdio: "inherit" });

  if (process.platform === "win32") {
    run("cmd", ["/c", "gradlew.bat", "assembleDebug"], { cwd: androidDir });
  } else {
    run("./gradlew", ["assembleDebug"], { cwd: androidDir, shell: true });
  }

  if (!fs.existsSync(apk)) {
    console.error("APK missing:", apk);
    process.exit(1);
  }

  console.log("Installing:", apk);
  run("adb", ["install", "-r", apk], { shell: process.platform === "win32" });
  console.log("Installed. Open “PDF Highlighter” on the device.");
}

main();
