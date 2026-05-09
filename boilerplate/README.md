# Plugin Boilerplate

Extends-able starters for `@vibecontrols/vibe-plugin-*` packages. Copy or extend from a downstream plugin's config files:

| File                                     | Purpose                                                                  |
| ---------------------------------------- | ------------------------------------------------------------------------ |
| `tsconfig.base.json`                     | Strict TS + ESM, ES2022, declaration emit. `extends` from your tsconfig. |
| `eslint.config.base.js`                  | No `any`, no `@ts-ignore`, no `eslint-disable`. Spread into your config. |
| `lefthook.base.yml`                      | Pre-push sanity gate.                                                    |
| `bunfig.toml`                            | Verdaccio scope wiring for `@burdenoff` + `@vibecontrols`.               |
| `package.template.json`                  | Minimal `package.json` starter.                                          |
| `.github/workflows/release.template.yml` | CalVer release pipeline (npmjs + Verdaccio).                             |

## Quick start

```bash
mkdir vibe-plugin-myplugin && cd vibe-plugin-myplugin
cp ../vibecontrols-plugin-sdk/boilerplate/package.template.json package.json
cp ../vibecontrols-plugin-sdk/boilerplate/bunfig.toml ./
cp ../vibecontrols-plugin-sdk/boilerplate/lefthook.base.yml lefthook.yml
mkdir -p .github/workflows
cp ../vibecontrols-plugin-sdk/boilerplate/.github/workflows/release.template.yml .github/workflows/release.yml
bun install
```

Then point your `tsconfig.json` and `eslint.config.js` at the bases:

```jsonc
// tsconfig.json
{
  "extends": "@vibecontrols/plugin-sdk/boilerplate/tsconfig.base.json",
  "compilerOptions": { "outDir": "./dist", "noEmit": true },
  "include": ["src/**/*", "tests/**/*"],
}
```

```js
// eslint.config.js
import base from "@vibecontrols/plugin-sdk/boilerplate/eslint.config.base.js";
export default [...base];
```
