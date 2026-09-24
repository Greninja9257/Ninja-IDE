This is [hull.js](https://github.com/andriiheonia/hull) v0.2.10 with backported security fixes.

You should not use this is new projects. This only exists because we want to keep using an old version of hull.js as future versions have backwards-incompatible changes. In our specific use case, even benign bug fixes can be a backwards incompatible change as our use case involves behaving as close as possible to a certain other project pinned to v0.2.10.

## Building

Use `npm test` to test and build. If all tests pass, it will then build with browserify.
