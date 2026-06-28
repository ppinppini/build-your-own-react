import { defineConfig } from "vite";

// JSX를 우리가 만든 Didact.createElement / Didact.Fragment 로 변환하도록 설정.
// 원문 튜토리얼의 `/** @jsx Didact.createElement */` 주석 대신 빌드 설정으로 처리합니다.
export default defineConfig({
  esbuild: {
    jsxFactory: "Didact.createElement",
    jsxFragment: "Didact.Fragment",
    // .js 파일 안의 JSX도 파싱하도록
    include: /src\/.*\.jsx?$/,
    loader: "jsx",
  },
});
