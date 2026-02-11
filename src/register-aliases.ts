import path from "path";
const moduleAlias = require("module-alias");

// Resolve aliases from current runtime root: `src` in ts-node, `dist` in build.
const rootDir = __dirname;

moduleAlias.addAliases({
  "@": rootDir,
  "@commands": path.join(rootDir, "commands"),
  "@services": path.join(rootDir, "services"),
  "@config": path.join(rootDir, "config"),
  "@context": path.join(rootDir, "context"),
  "@server": path.join(rootDir, "server"),
  "@scenes": path.join(rootDir, "scenes"),
});
