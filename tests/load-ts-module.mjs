import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { createRequire } from "node:module";
import ts from "typescript";

// Execute the real TypeScript functions with controlled providers, without emitting build files.
export function loadTsModule(relativePath, mocks = {}, globals = {}) {
  const cache = new Map();
  function load(path) {
    if (cache.has(path)) return cache.get(path).exports;
    const record = { exports: {} }; cache.set(path, record);
    const require = createRequire(path);
    const localRequire = specifier => {
      if (Object.hasOwn(mocks, specifier)) return mocks[specifier];
      if (specifier.startsWith(".")) {
        const candidate = resolve(dirname(path), specifier + ".ts");
        if (existsSync(candidate)) return load(candidate);
      }
      return require(specifier);
    };
    const code = ts.transpileModule(readFileSync(path, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    new Function("require", "module", "exports", ...Object.keys(globals), code)(localRequire, record, record.exports, ...Object.values(globals));
    return record.exports;
  }
  return load(resolve(relativePath));
}
