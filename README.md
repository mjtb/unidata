# UnicodeData

This module provides an API for looking up characters in the Unicode public character
database downloadable at http://www.unicode.org/Public/UNIDATA/UnicodeData.txt.

Here’s an example of how to use it. The example below is a simplification of the `unidata`
command-line interface located in `bin/unidata`.

```
// Usage: unidata U+0041 U+2026 U+1F577    # lookup code points
//        unidata quot                     # search for "quot"
//
const UnicodeData = require('unidata');
UnicodeData.promise().then(function() {
	var chars = [];
	var re = /U\+[0-9A-F]+/i;
	for(var i = 2; i < process.argv.length; ++i) {
		var arg = process.argv[i];
		if(re.test(arg)) {
			// Lookup character based on code point
			chars.push(UnicodeData.get(Number.parseInt(arg.substring(2), 16)));
		} else {
			// Search for characters matching name
			chars = chars.concat(UnicodeData.find(arg));
		}
	}
	var found = false;
	for(var i = 0; i < chars.length; ++i) {
		var c = chars[i];
		if(c) {
			// E.g., U+0041 (A) LATIN CAPITAL LETTER A [Letter, Uppercase «Lu»]
			var abbr = c.general || UnicodeData.Categories.default;
			var desc = UnicodeData.Category[abbr];
			console.log(`${c} [${desc} «${abbr}»]`);
			found = true;
		}
	}
	if(!found) {
		console.log('No characters found');
	}
});
```

## API

The module’s export is an instance of the `UnicodeData` class. It exposes a `get(…)` method that you
can use to look up detailed information about a character given its Unicode code point numeric
value. Detailed character information is encapsulated in instances of the `UnicodeCharacter` which
exposes properties for things such as a human-readable `name` for the character and various flags
such as its `general` category (e.g., `Lu` meaning “Letter, Uppercase”) and `uppercase`/`lowercase`
equivalents.

You can also search the database using the `UnicodeData.find(…)` method by providing either a
partial name or by providing a filter function.

The module’s exported `UnicodeData` instance initializes asynchronously.  During this asynchronous
initialization, the public Unicode database is downloaded, parsed and cached (valid for one year) in
a OS-specific per-user application data directory.

The asynchronous initialization is encapsulated in a Javascript Promise object that you can get via
the `UnicodeData.promise()` method. The value that is passed to any fulfillment handlers will be a
reference to the `UnicodeData` object.

In addition to the Promise-based API, detailed information about the initialization of the module’s
exported instance of `UnicodeData` can be obtained via an event-based API. The `UnicodeData` class
inherits from the standard Node.js `EventEmitter` class and exposes an `on(…)` method that may be
used to bind handlers to events.  There are two terminal completion events: the `ready` event is
emitted when the `UnicodeData` instance is successfully initialized; the `error` event is emitted if
initialization fails. There are two intermediate progress events: the `readystatechange` event is
emitted multiple times as initialization processed from one sub-task to another progress; the
`download` event is emitted at most once, when a fresh copy of the public Unicode database needs to
be downloaded.

## CLI

Two command-line interfaces are available:

*	`unidata` lets you look up the character information given its code point or a partial match to
	its name.
*	`unichar` writes to standard output characters given their code points.

Refer to the `man(1)` pages for these commands for additional information.

## Build

No build step required. Source code is marked up with JSDoc comments, which you can optionally
generate via:

```
jsdoc --readme unidata.js
```

## Test

Unit tests using the mocha framework are provided. Coverage is not available at this time.
Run the `mocha` command to execute tests.

## Feedback

Suggestions for improvements welcomed. Please use the standard GitHub feedback mechanisms.
