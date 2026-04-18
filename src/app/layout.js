import "./globals.css";

export const metadata = {
  title: "PDF Highlighter",
  description:
    "Highlight and draw on PDFs on this device only — the file is not changed.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <meta name="theme-color" content="#0f172a" />
        <link rel="icon" href="/favicon.ico" sizes="any" />
      </head>
      <body className="pdf-body">{children}</body>
    </html>
  );
}
