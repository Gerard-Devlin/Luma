# Security follow-up — 2026-10-06

The dependency gate caught two advisories newly reviewed/updated on October 5:

- [GHSA-rj75-hqrm-r3gf](https://github.com/advisories/GHSA-rj75-hqrm-r3gf):
  `postcss-selector-parser` has a quadratic flat-selector parser. Override its
  older transitive versions to the published fix, 7.1.6.
- [GHSA-hp3w-g68c-fv3c](https://github.com/advisories/GHSA-hp3w-g68c-fv3c):
  `sprintf-js` has no published fix. Its only installed chain was the legacy
  `js-yaml` 3 CLI dependency of `@istanbuljs/load-nyc-config`. That consumer uses
  `js-yaml.load`, which remains available in 4.3.2. Upgrade only this parent's
  YAML dependency to the already-used 4.3.2 version, removing `argparse` 1 and
  `sprintf-js` entirely rather than adding another audit exception.

The existing narrowly checked braces patch remains. Neither new advisory is
ignored or dismissed. Production builds verify Tailwind's selector-parser
compatibility, and a YAML NYC config smoke check verifies the upgraded consumer.

The new playback relay also constructs outbound URL origins from constants.
Only validated path/query components vary, and redirects remain disabled. Both
initial CodeQL request-flow alerts passed after that construction was tightened.
