import type { NextConfig } from "next";

const config: NextConfig = {
  webpack: (c) => {
    c.externals = [...(c.externals ?? []), "pino-pretty", "bufferutil", "utf-8-validate"];
    return c;
  },
};

export default config;
