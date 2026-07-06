import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // LangChain packages ship Node-targeted builds; keep them external so
  // the server bundle doesn't try to inline their dynamic requires.
  serverExternalPackages: [
    "@langchain/langgraph",
    "@langchain/langgraph-checkpoint",
    "@langchain/anthropic",
    "@langchain/core",
    "langsmith",
  ],
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
