# @nwutils/doctor

[![npm](https://img.shields.io/npm/v/@nwutils/doctor/latest)](https://www.npmjs.com/package/@nwutils/doctor/v/latest)

Detect and configure Linux, MacOS and Windows platforms for NW.js development.

## Getting Started

1. `npm i` to install third party dependencies

## Usage

```js
import doctor from "@nwutils/doctor";

await doctor({
  // ...
});
```

## API Reference

Options

| Name        | Type                                                                                                                                                          | Description                                                                              |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| version     | `string \| "latest" \| "stable"`                                                                                                                              | Runtime version                                                                          |
| flavor      | `"normal" \| "sdk"`                                                                                                                                           | Runtime flavor                                                                           |
| platform    | `"linux" \| "osx" \| "win"`                                                                                                                                   | Host platform                                                                            |
| arch        | `"ia32" \| "x64" \| "arm64"`                                                                                                                                  | Host architecture                                                                        |
| downloadUrl | `"https://dl.nwjs.io" \| "https://npm.taobao.org/mirrors/nwjs" \| https://npmmirror.com/mirrors/nwjs \| "https://github.com/corwin-of-amber/nw.js/releases/"` | Download server. Supports file systems too (for example `file:///home/user/nwjs_mirror`) |
| manifestUrl | `"https://nwjs.io/versions.json" \| "https://raw.githubusercontent.com/nwutils/nw-builder/main/src/util/osx.arm.versions.json"`                               | Versions manifest                                                                        |
| srcDir      | `string`                                                                                                                                                      | Directory containing the application's `package.json` (used to read `devEngines`)        |
| cacheDir    | `string`                                                                                                                                                      | Directory to cache NW binaries                                                           |
| cache       | `boolean`                                                                                                                                                     | If true the existing cache is used. Otherwise it removes and redownloads it.             |
| ffmpeg      | `boolean`                                                                                                                                                     | If true the chromium ffmpeg is replaced by community version with proprietary codecs.    |
| nativeAddon | `boolean`                                                                                                                                                     | If true download NW.js Node headers.                                                     |
| shaSum      | `boolean`                                                                                                                                                     | Flag to enable/disable shasum checks.                                                    |

## Contributing

### External contributor

- Use Node.js standard libraries whenever possible.
- Prefer to use syncronous APIs over modern APIs which have been introduced in later versions.

### Maintainer

- npm trusted publishing is used for releases
- a package is released when a maintainer creates a release note for a specific version

## Roadmap

- [ ] detect() - only checks the environment
- [ ] configure() - changes the environment
