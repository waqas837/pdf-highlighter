/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "export",
  transpilePackages: ["pdfjs-dist"],
  images: { unoptimized: true },
  trailingSlash: true,
};

export default nextConfig;
