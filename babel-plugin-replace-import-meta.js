// Replaces every `import.meta` with an empty object literal so the web bundle
// parses under a classic (non-module) <script>. Some deps (e.g. the devtools
// middleware re-exported by zustand/middleware) ship a bare `import.meta.env`,
// which otherwise throws "Cannot use 'import.meta' outside a module" and leaves
// the page blank. All known usages are guarded (`import.meta.env ? ...`), so
// `{}.env === undefined` degrades safely.
module.exports = function ({ types: t }) {
  return {
    name: "replace-import-meta",
    visitor: {
      MetaProperty(path) {
        if (
          path.node.meta &&
          path.node.meta.name === "import" &&
          path.node.property.name === "meta"
        ) {
          path.replaceWith(t.objectExpression([]));
        }
      },
    },
  };
};
