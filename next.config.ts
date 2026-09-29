import path from "node:path";

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    // Evita que Turbopack tome como raíz un package-lock.json de un directorio superior.
    root: path.join(__dirname),
  },
  // El SDK de Hedera/Hiero usa gRPC y APIs de Node: se carga con `require` nativo
  // en el servidor en lugar de empaquetarse.
  serverExternalPackages: ["@hiero-ledger/sdk"],
};

export default nextConfig;
