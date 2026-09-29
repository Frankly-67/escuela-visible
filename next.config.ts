import path from "node:path";

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    // Evita que Turbopack tome como raíz un package-lock.json de un directorio superior.
    root: path.join(__dirname),
  },
};

export default nextConfig;
