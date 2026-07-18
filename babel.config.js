module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      ["babel-preset-expo", { jsxImportSource: "nativewind" }],
      "nativewind/babel",
    ],
    // Some deps (e.g. zustand/middleware's devtools) ship a bare `import.meta`,
    // which breaks the web bundle because Expo emits a classic (non-module)
    // <script>. Rewrite it to a safe empty object so the bundle parses on web.
    plugins: ["./babel-plugin-replace-import-meta.js"],
  };
};
