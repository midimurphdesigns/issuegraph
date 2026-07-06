import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // LangChain packages ship Node-targeted builds; keep them external so
  // the server bundle doesn't try to inline their dynamic requires.
  serverExternalPackages: [
    "@langchain/langgraph",
    "@langchain/langgraph-checkpoint-redis",
    "@langchain/anthropic",
    "@langchain/core",
    "langsmith",
  ],
};

export default nextConfig;
