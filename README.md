This is a [Next.js](https://nextjs.org/) project bootstrapped with [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.js`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/basic-features/font-optimization) to automatically optimize and load Inter, a custom Google Font.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js/) - your feedback and contributions are welcome!

## Android (Capacitor, local device — not Play Store)

**Prerequisites:** Android SDK (command-line tools are enough), **platform-tools** on your `PATH` so `adb` works, **`ANDROID_HOME`** set, USB debugging on the phone, device connected (check with `adb devices`).

### CLI only (no Android Studio)

1. Plug in the phone (or start an emulator).
2. Run: **`npm run android:deploy`**  
   This runs `next build` → Capacitor sync → `gradlew assembleDebug` → `adb install -r` for the debug APK.

Optional: **`npm run android:run`** — same sync, then Capacitor’s CLI builds and installs (also uses Gradle + `adb`).

### Optional: Android Studio

`npm run android` opens the project in Android Studio if you prefer the GUI.

After web/UI changes, run **`npm run android:deploy`** again (or `build:android` then Gradle) before reinstalling.

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out My [Next.js deployment documentation](https://nextjs.org/docs/deployment) for more details.
