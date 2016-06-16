"use strict";
/**
 *	Provides detailed Unicode character data sourced directly from www.unicode.org.
 *	@module unidata
 *
 	@author Michael Trenholm-Boyle
 *	@copyright Copyright © 2016 Michael Trenholm-Boyle.
 *	Licensed under a permissive MIT license. See the LICENSE file for details.
 */
const EventEmitter = require('events');

/**
 *	Provides access to the Unicode character database hosted at
 *	http://www.unicode.org/Public/UNIDATA/UnicodeData.txt
 *
 *	<p>The UnicodeData.txt file is downloaded and cached in a platform-specific folder location.
 *	The file is parsed and saved as JSON data in the same cache folder location as UnicodeData.js.
 *	The next time the UnicodeData class is constructed the cached JSON data is read directly.
 *
 *	<p>The default cache folder is:
 *
 *	<ul>
 *	<li>Windows: %APPDATA%\www.unicode.org\Public\UNIDATA
 *	<li>Mac OS X: ~/Library/Application Support/www.unicode.org/Public/UNIDATA
 *	<li>Linux: ~/.www.unicode.org/Public/UNIDATA
 *	</ul>
 *
 *	<p>The initialization process happens asynchronously. UnicodeData instances emit several events
 *	at various points in the process and expose a public {@link readyState} property that indicates the
 *	progress made during initialization. The readyState starts at UNINITIALIZED and every
 *	time it is changed the UnicodeData instance emits a {@link readystatechange} event which passes
 *	to the event handler a {@link ReadyStateChangeEvent} argument.
 *
 *	<p>After an instance moves into the UNINITIALIZED state it will also emit an {@link error} event that
 *	includes one argument: an Error object encapsulating information about the error which occured.
 *	An object in this state is considered dead: no further events will be emitted.

 *	<p>After an instance moves into the READY state it will also emit a {@link ready} event that includes
 *	a reference to the initialized UnicodeData as its sole argument. The object is now live but
 *	this is the last event the object will emit.
 *
 *	@class
 *	@constructor
 *	@param {string} clear - (optional) 'clear' if this instance is being initialized in order to
 *							clear caches
 *	@fires readystatechange
 *	@fires error
 *	@fires ready
 *	@fires download
 */
function UnicodeData(clear) {
	EventEmitter.call(this);
	if(clear !== 'clear') {
		this.reload();
	}
}

require('util').inherits(UnicodeData, EventEmitter);

function DefaultCacheLocation(cachedir) {
	const os = require('os');
	var cachedirs;
	if(cachedir) {
		// Use the cachedir provided.
		if(Array.isArray(cachedir)) {
			cachedirs = cachedir;
		} else {
			cachedirs = cachedir.split(os.type() === 'Windows_NT' ? /[\/\\]/ : path.sep);
		}
	} else {
		switch(os.type()) {
		default:
			cachedirs = [ os.homedir(), '.www.unicode.org', 'Public', 'UNIDATA' ];
			break;
		case 'Darwin':
			cachedirs = [
				os.homedir(), 'Library', 'Application Support',
				'www.unicode.org', 'Public', 'UNIDATA'
			];
			break;
		case 'Windows_NT':
			cachedirs = [ process.env.APPDATA, 'www.unicode.org', 'Public', 'UNIDATA' ];
			break;
		}
	}
	return cachedirs;
}
/**
 *	Enumeration of UnicodeData asynchronous initialization ready states.
 *
 *	@readonly
 *	@enum {number}
 */
UnicodeData.prototype.ReadyState = {
	/**
	 *	The state when the object is first constructed and when asynchronous initialization fails
	 *	with a terminal error. (0)
	 */
	UNINITIALIZED: 0,
	/**
	 *	The object is constructing its cache folders. (1)
	 */
	INITIALIZING: 1,
	/**
	 *	The object is attempting to load cached JSON data. (2)
	 */
	LOADING: 2,
	/**
	 *	The object is downloading text data. (3)
	 */
	DOWNLOADING: 3,
	/**
	 *	The object is parsing text data. (4)
	 */
	PARSING: 4,
	/**
	 *	The object is caching parsed data. (5)
	 */
	CACHING: 5,
	/**
	 *	Initialization completed successfully. (6)
	 */
	READY: 6
};

/**
 *	Returns a representation of the Unicode character database appropriate for serialization in
 *	JSON format.
 *
 *	@return {object}
 *	@property headers {object}
 *	@property characters {object}
 *	@property ranges {object}
 */
UnicodeData.prototype.toJSON = function() {
	return {
		'headers': this.headers,
		'characters': this.characters,
		'ranges':	this.ranges,
	};
}

/**
 *	Removes files from the per-user application-specific cache locaiton.
 *
 *	@param cachedir {string} overrides the default cache location
 *	@return {Promise}
 */
UnicodeData.prototype.uncache = function(cachedir) {
	var cc = function(res, rej) {
		const path = require('path');
		const fs = require('fs');
		var cf = DefaultCacheLocation(cachedir || this.cache).join(path.sep);
		var jsfile = path.join(cf, 'UnicodeData.js');
		var txtfile = path.join(cf, 'UnicodeData.txt');
		var blkfile = path.join(cf, 'Blocks.txt');
		if(!cachedir) {
			delete this.cache;
		}
		fs.unlink(jsfile, function() {
			fs.unlink(txtfile, function() {
				fs.unlink(blkfile, function() {
					setImmediate(res);
				});
			});
		});
	}.bind(this);
	return new Promise(function(res,rej) {
		setImmediate(cc, res, rej);
	});
}

/**
 *	Reloads the database.
 *
 *	@param {string} cachedir - (optional) location of the folder in which UnicodeData.txt and
 *		UnicodeData.js are cached
 *	@return {Promise} a promise that will be fulfilled when the database is reloaded
 *
 *	@fires readystatechange
 *	@fires error
 *	@fires ready
 *	@fires download
 */
UnicodeData.prototype.reload = function(cachedir) {
	// Forward declarations
	const fs = require('fs');
	const path = require('path');
	const day = 1000 * 60 * 60 * 24;
	const year = day * 365;
	var setReadyState, exists, mkdirs, validateunidata, parsetextfields, parsetextdata,
		parsetextfile, gettextfile, loadtextfile, parsejsdata, loadjsfile, loadfolder, main,
		resolved, rejected, prom, loadfromcache, parseblkfile, loadblkfile, getblkfile,
		parseblockfields;

	/**
	 *	Gives the current state of the object’s asynchronous initialization.
	 *
	 *	@member {ReadyState}
	 */
	this.readyState = this.ReadyState.INITIALIZING;

	/**
	 *	Tracks the date the Unicode character database text file was downloaded and its server-
	 *	reported date of last modification and an expected expiry date.
	 *
	 *	@member {UnidataHeaders}
	 */
	this.headers = new UnidataHeaders();

	/**
	 *	Maps a character’s code point to its detailed information. The keys of this object are the
	 *	decimal string representations of the character code point values. For example, U+0041 LATIN
	 *	CAPITAL LETTER A is at key "65".
	 *
	 *	@member {Map<number,UnicodeCharacter>}
	 */
	this.characters = {};

	/**
	 *	Provides a list of the character ranges defined in the Unicode character database.
	 *
	 *	@member {Array<UnicodeCharacter>}
	 */
	this.ranges = [];

	delete this.error;
	delete this.cache;

	/**
	 *	Returns a promise that is fulfilled when initialization is complete.
	 *
	 *	@return {Promise}
	 */
	this.promise = function() {
		return prom;
	};

	setReadyState = function(next) {
		// Changes the readyState, emitting the readystatechange event if different.
		if(this.readyState !== next) {
			var prev = this.readyState;
			this.readyState = next;
			/**
			 *	Occurs when the ready state of the object changes during initialization.
			 *
			 *	@event readystatechange
			 *	@type {ReadyStateChangeEvent}
			 */
			this.emit('readystatechange', new ReadyStateChangeEvent(this, prev, next));
		}
	}.bind(this);

	main = function() {
		// Try to load the UnicodeData.js file from the node module directory.
		setReadyState(this.ReadyState.INITIALIZING);
		var jsfile = path.join(__dirname, 'UnicodeData.js');
		exists(jsfile, 'file', function(flag, fname, fmode, err, st) {
			if(flag) {
				loadjsfile(jsfile);
			} else {
				loadfromcache();
			}
		});
	}.bind(this);

	loadfromcache = function() {
		// Try to load the UnicodeData.js file from the per-user application cache folder.
		mkdirs(DefaultCacheLocation(cachedir), function(folder, err) {
			if(err) {
				setReadyState(this.ReadyState.UNINITIALIZED);
				/**
				 *	Reference to the error that occurred during initialization.
				 *
				 *	@type {Error}
				 */
				this.error = err;
				/**
				 *	Occurs when initialization fails because of an error.
				 *
				 *	@event error
				 *	@type {Error}
				 */
				this.emit('error', err);
				setImmediate(rejected, err);
			} else {
				loadfolder(folder);
			}
		}.bind(this));
	}.bind(this);

	loadfolder = function(folder) {
		// Load the JSON file if it exists, otherwise load the text file.
		this.cache = folder;
		var jsfile = path.join(folder, 'UnicodeData.js');
		var txtfile = path.join(folder, 'UnicodeData.txt');
		var blkfile = path.join(folder, 'Blocks.txt');
		exists(jsfile, 'file', function(flag, fname, fmode, err, st) {
			if(flag) {
				loadjsfile(jsfile, txtfile, blkfile);
			} else {
				loadtextfile(txtfile, blkfile, jsfile);
			}
		});
	}.bind(this);

	loadjsfile = function(jsfile, txtfile, blkfile) {
		// Read and parse the JSON file. If the file can’t be read, load the text file.
		setReadyState(this.ReadyState.LOADING);
		fs.readFile(jsfile, { encoding: 'utf8' }, function(err, data) {
			if(err) {
				if(txtfile && blkfile) {
					loadtextfile(txtfile, blkfile, jsfile);
				} else {
					// The attempt to load the UnicodeData.js file from the node module directory
					// failed. Load it from the cache instead.
					loadfromcache();
				}
			} else {
				parsejsdata(data, jsfile, txtfile, blkfile);
			}
		});
	}.bind(this);

	parsejsdata = function(data, jsfile, txtfile, blkfile) {
		// Parse the JSON data and copy the de-serialized properties to this. Check the result, if
		// the result is valid, move to the READY state. Otherwise, discard and try loading the
		// text file instead.
		setReadyState(this.ReadyState.LOADING);
		var unidata;
		try {
			var src = JSON.parse(data);
			for(var i in src.characters) {
				var c = new UnicodeCharacter();
				Object.assign(c, src.characters[i]);
				this.characters[i] = c;
			}
			for(var i = 0; i < src.ranges.length; ++i) {
				var c = new UnicodeCharacter();
				Object.assign(c, src.ranges[i]);
				this.ranges.push(c);
			}
			this.headers.modified = new Date(src.headers.modified);
			this.headers.expires = new Date(src.headers.expires);
			if(validateunidata(this)) {
				setReadyState(this.ReadyState.READY);
				/**
				 *	Occurs when initialization completes successfully.
				 *
				 *	@event ready
				 *	@type {UnicodeData}
				 */
				this.emit('ready', this);
				setImmediate(resolved, this);
			} else {
				if(txtfile) {
					loadtextfile(txtfile, jsfile);
				} else {
					// The attempt to load the UnicodeData.js file from the node module directory
					// failed. Load it from the cache instead.
					loadfromcache();
				}
			}
		} catch(err) {
			setReadyState(this.ReadyState.UNINITIALIZED);
			this.error = err;
			this.emit('error', err);
			setImmediate(rejected, err);
		}
	}.bind(this);

	loadtextfile = function(txtfile, blkfile, jsfile) {
		// Parse the text file if it exists, otherwise download it.
		exists(txtfile, 'file', function(flag, fname, fmode, err, st) {
			if(flag) {
				this.headers.modified = st.mtime;
				loadblkfile(txtfile, blkfile, jsfile);
			} else {
				gettextfile(txtfile, blkfile, jsfile);
			}
		}.bind(this));
	}.bind(this);

	loadblkfile = function(txtfile, blkfile, jsfile) {
		// Parse the text file if it exists, otherwise download it.
		exists(blkfile, 'file', function(flag, fname, fmode, err, st) {
			if(flag) {
				parsetextfile(txtfile, blkfile, jsfile);
			} else {
				getblkfile(txtfile, blkfile, jsfile);
			}
		}.bind(this));
	}.bind(this);

	gettextfile = function(txtfile, blkfile, jsfile) {
		// Download the text file and parse it.
		setReadyState(this.ReadyState.DOWNLOADING);
		var req = require('request')
		.get('http://www.unicode.org/Public/UNIDATA/UnicodeData.txt');
		req.on('error', function (err) {
			setReadyState(this.ReadyState.UNINITIALIZED);
			this.error = err;
			this.emit('error', err);
			setImmediate(rejected, err);
		}.bind(this))
		.on('response', function(response) {
			var datestr = response.headers['date'];
			var laststr = response.headers['last-modified'];
			var date = new Date(datestr);
			var last = laststr ? new Date(laststr) : date;
			var delta = Math.abs(date.valueOf() - last.valueOf());
			var now = new Date();
			last = new Date(now.valueOf() - delta);
			var expiry = new Date(Math.min(now.valueOf() + year,
				Math.max(date.valueOf() + year, last.valueOf() + year)));
			this.headers = new UnidataHeaders(now, last, expiry);
		}.bind(this))
		.pipe(fs.createWriteStream(txtfile))
		.on('finish', () => loadblkfile(txtfile, blkfile, jsfile));
		/** @event download
		 *	@type {DownloadEvent}
		 */
		this.emit('download', new DownloadEvent(this, req));
	}.bind(this);

	getblkfile = function(txtfile, blkfile, jsfile) {
		// Download the text file and parse it.
		setReadyState(this.ReadyState.DOWNLOADING);
		var req = require('request')
		.get('http://www.unicode.org/Public/UNIDATA/Blocks.txt');
		req.on('error', function (err) {
			setReadyState(this.ReadyState.UNINITIALIZED);
			this.error = err;
			this.emit('error', err);
			setImmediate(rejected, err);
		}.bind(this))
		.pipe(fs.createWriteStream(blkfile))
		.on('finish', () => parsetextfile(txtfile, blkfile, jsfile));
		/** @event download
		 *	@type {DownloadEvent}
		 */
		this.emit('download', new DownloadEvent(this, req));
	}.bind(this);

	parsetextfile = function(txtfile, blkfile, jsfile) {
		// Read the text file and parse the text.
		setReadyState(this.ReadyState.PARSING);
		fs.readFile(txtfile, { encoding: 'utf8' }, function(err, data) {
			if(err) {
				setReadyState(this.ReadyState.UNINITIALIZED);
				this.error = err;
				this.emit('error', err);
				setImmediate(rejected, err);
			} else {
				parseblkfile(data, txtfile, blkfile, jsfile);
			}
		}.bind(this));
	}.bind(this);

	parseblkfile = function(txtdata, txtfile, blkfile, jsfile) {
		// Read the blocks file and parse it.
		setReadyState(this.ReadyState.PARSING);
		fs.readFile(blkfile, { encoding: 'utf8' }, function(err, data) {
			if(err) {
				setReadyState(this.ReadyState.UNINITIALIZED);
				this.error = err;
				this.emit('error', err);
				setImmediate(rejected, err);
			} else {
				parsetextdata(txtdata, data, jsfile);
			}
		}.bind(this));
	}.bind(this);

	parsetextdata = function(txtdata, blkdata, jsfile) {
		// Parse the text file data by splitting it first into lines and then splitting each line
		// into semicolon-delimited fields. Parse the fields as UnicodeCharacter objects. Filter
		// the set of parsed records into invidual characters and character ranges. Cache the parsed
		// records as JSON formatted data. If all ends well, move to the READY state.
		setReadyState(this.ReadyState.PARSING);
		var parsed = txtdata.split('\n').map(
			(currentValue, index, array) => parsetextfields(currentValue)
		);
		this.characters = parsed.reduce(function(previousValue,currentValue,currentIndex,array) {
			if(currentValue && currentValue.codePoint) {
				previousValue[currentValue.codePoint] = currentValue;
			}
			return previousValue;
		}, {});
		var blocks = blkdata.split('\n').map(
			(currentValue, index, array) => parseblockfields(currentValue)
		);
		this.ranges = parsed.concat(blocks)
		.reduce(function(previousValue,currentValue,currentIndex,array) {
			if(currentValue) {
				if('first' in currentValue) {
					previousValue.push(currentValue);
				} else if('last' in currentValue) {
					previousValue.find(
						(x) => x.name === currentValue.name
					).last = currentValue.last;
				}
			}
			return previousValue;
		}, [])
		.sort((a,b) => {
			if(a.first !== b.first) {
				return a.first - b.first;
			} else {
				return a.last - b.last;
			}
		})
		.reduce(function(previousValue,currentValue,currentIndex,array) {
			var push = true;
			for(var i = 0; i < previousValue.length; ++i) {
				if((previousValue[i].first === currentValue.first) && (currentValue.last > previousValue[i].last)) {
					for(var k in currentValue) {
						switch(k) {
							default:
								previousValue[i][k] = currentValue[k];
								break;
							case 'name':
							case 'first':
							case 'last':
								break;
						}
					}
					push = false;
				}
			}
			if(push) {
				previousValue.push(currentValue);
			}
			return previousValue;
		}, []);
		setReadyState(this.ReadyState.CACHING);
		fs.writeFile(jsfile, JSON.stringify(this), { encoding: 'utf8' }, function(err) {
			if(err) {
				setReadyState(this.ReadyState.UNINITIALIZED);
				this.error = err;
				this.emit('error', err);
				setImmediate(rejected, err);
			} else {
				setReadyState(this.ReadyState.READY);
				this.emit('ready', this);
				setImmediate(resolved, this);
			}
		}.bind(this));
	}.bind(this);

	parseblockfields = function(line) {
		// Parses a line from the Blocks.txt file into a UnicodeCharacter (or null, if the line
		// isn’t parsed.
		if(!line || (line.charAt(0) === '#')) { // Ignore blanks and comments
			return null;
		}
		var dotdot = line.indexOf('..');
		var semicolon = line.indexOf(';');
		if((dotdot < 2) || (semicolon < (dotdot+2))) { // Require at least two hex digits
			return null;
		}
		var fstr = line.substr(0,dotdot);
		var fnum = Number.parseInt(fstr, 16);
		var lstr = line.substr(dotdot+2,semicolon-dotdot-2);
		var lnum = Number.parseInt(lstr, 16);
		var nstr = line.substr(semicolon+1).trim();
		var fields = {
			'first': fnum,
			'last': lnum,
			'name': nstr
		};
		if(!fields.name || (fields.first > fields.last)) { // Require sane and meaningful values
			return null;
		}
		return new UnicodeCharacter(fields);
	};

	parsetextfields = function(line) {
		// Clean up the fields and if the record has some data use it to return a UnicodeCharacter
		// object instance.
		if(!line || (line.charAt(0) === '#')) {
			return null;
		}
		var fields = line.split(';');
		for(var i = 0; i < fields.length; ++i) {
			fields[i] = fields[i].trim();
		}
		if((fields.length < 1) || (fields[0] === '')) {
			return null;
		} else {
			return new UnicodeCharacter(fields);
		}
	}.bind(this);

	validateunidata = function(unidata) {
		// Verify the parsed JSON data has not expired.
		if(unidata && typeof(unidata) === 'object' && 'headers' in unidata) {
			var expires = new Date(unidata.headers.expires);
			var now = new Date();
			return expires.valueOf() > now.valueOf();
		}
		return false;
	};

	mkdirs = function(dirs, handler, cwd) {
		// Recursively create a folder hierarchy given an array of sub-directories. When finished,
		// call the provided handler, passing two argument: a directory path and an Error object
		// if an error occurred.
		if(dirs.length === 0) {
			handler(cwd, null);
		} else {
			var cd = dirs.shift();
			var pwd = cwd ? path.join(cwd, cd) : cd;
			exists(pwd, 'd', function(flag, fname, fmode, err, st) {
				if(flag) {
					mkdirs(dirs, handler, pwd);
				} else if(err) {
					handler(pwd, err);
				} else {
					try {
						fs.mkdir(pwd, function(error) {
							if(error) {
								handler(pwd, error)
							} else {
								mkdirs(dirs, handler, pwd);
							}
						});
					} catch(ex) {
						handler(pwd, ex);
					}
				}
			});
		}
	}.bind(this);

	exists = function(fname, fmode, handler) {
		// Determines if a file or folder exists. The fname parameter is the path to the file or
		// folder to check. The fmode is a stringth 'file' or 'dir' indicating the expected file
		// system entity type. The handler receives four arguments: a boolean flag that is true
		// if the file or folder exists as expected, the fname parameter provided, the fmode
		// parameter provided and an Error object if an error occurred (null if no error occurred,
		// even when no entity exists in the file system with the provided fname).
		try {
			fs.stat(fname, function(err, st) {
				if(!err) {
					switch(fmode || 'file') {
						default:
							handler(st.isFile(), fname, fmode, st.isFile() ? null : {
								code: 'EISDIR',
								syscall: 'stat'
							}, st);
							break;
						case 'directory':
						case 'dir':
						case 'd':
							handler(st.isDirectory(), fname, fmode, st.isDirectory() ? null : {
								code: 'ENOTDIR',
								syscall: 'stat'
							}, st);
							break;
					}
				} else {
					if(('errno' in err) && (err.code === 'ENOENT')) {
						handler(false, fname, fmode, null, null);
					} else {
						handler(false, fname, fmode, err, null);
					}
				}
			});
		} catch(err) {
			handler(false, fname, fmode, err, null);
		}
	}.bind(this);

	prom = new Promise(function(res,rej) {
		resolved = res;
		rejected = rej;
		setImmediate(main);
	});

	return this;
}

/**
 *	Searches the character database and returns an array of {@link UnicodeCharacter} references
 *	that satisfy a given predicate or have names which have a partial match with the terms supplied.
 *
 *	@param filter {string|Function} filter function or search string
 *	@param unique {Boolean} true to return only the first character found
 *	@param selection {string}	'cr' to select both individual characters and character ranges,
 *								'r' to select only ranges, or undefined (or, 'c') to select only
 *								characters
 *	@return {UnicodeCharacter|Array<UnicodeCharacter>}
 */
UnicodeData.prototype.find = function(filter, unique, selection) {
	var rv = [];
	if(typeof(filter) === "string") {
		var t = filter.toUpperCase();
		if(!selection || (selection.indexOf('c') >= 0)) {
			for(var i in this.characters) {
				var c = this.characters[i];
				if(c.name.indexOf(t) >= 0) {
					if(unique) {
						return c;
					} else {
						rv.push(c);
					}
				}
			}
		}
		if(selection && (selection.indexOf('r') >= 0)) {
			for(var i = 0; i < this.ranges.length; ++i) {
				var r = this.ranges[i];
				if(r.name.toUpperCase().indexOf(t) >= 0) {
					if(unique) {
						return r;
					} else {
						rv.push(r);
					}
				}
			}
		}
	} else if(typeof(filter) === "function") {
		if(!selection || selection.indexOf('c') >= 0) {
			for(var i in this.characters) {
				var c = this.characters[i];
				if(filter(c)) {
					if(unique) {
						return c;
					} else {
						rv.push(c);
					}
				}
			}
		}
		if(selection && selection.indexOf('r') >= 0) {
			for(var i = 0; i < this.ranges.length; ++i) {
				var r = this.ranges[i];
				if(filter(r)) {
					if(unique) {
						return r;
					} else {
						rv.push(r);
					}
				}
			}
		}
	} else {
		throw new TypeError(`${filter} must be a string or function`);
	}
	if(unique) {
		return null;
	} else {
		return rv;
	}
}

/**
 *	Gets detailed information about a character given its Unicode code point numeric value.
 *
 *	<p>If the character is uniquely defined in the database, its detailed information will be
 *	returned. Otherwise, if there is a range defined in the database that includes the character
 *	then the detailed information for the range will be returned. Otherwise, the database has no
 *	information about the character and null will be returned.
 *
 *	@param codePoint {number} Unicode code point numeric value
 *	@return {UnicodeCharacter}
 */
UnicodeData.prototype.get = function(codePoint) {
	var cc = Number(codePoint);
	if(cc in this.characters) {
		return this.characters[cc];
	}
	for(var i = 0; i < this.ranges.length; ++i) {
		var r = this.ranges[i];
		if(cc >= r.first && cc <= r.last) {
			return r;
		}
	}
	return null;
}

/**
 *	Splits a string into a sequence of {@link UnicodeCharacter} references unlike the built-in
 *	Javascript String.split function whcih splits into UTF-16 code points.
 *
 *	@param str {string} string to split
 *	@return {Array<number>}
 */
UnicodeData.prototype.split = function(str) {
	var rv = [];
	for(var i = 0; i < str.length; ++i) {
		var c = str.charCodeAt(i);

	}
}

/**
 *	Concatenates code points into a string.
 *
 *	The argument list can include arbitrary strings which are concatenated directly.
 *
 *	@param codepoints... {number|UnicodeCharacter|string} code points to join
 *	@return {string}
 */
UnicodeData.prototype.join = function(codepoints) {
	var args = Array.from(arguments);
	var rv = '';
	for(var i = 0; i < args.length; ++i) {
		var a = args[i];
		if(typeof(a) === 'number') {
			rv += (new UnicodeCharacter({ codePoint: a})).string();
		} else if(typeof(a) === 'string') {
			rv += a;
		} else if(typeof(a) === 'object') {
			if(a instanceof UnicodeCharacter) {
				rv += a.string();
			} else if(Array.isArray(a)) {
				rv += UnicodeData.prototype.join.apply(this, a);
			} else {
				throw new Error(`Illegal argument at index ${i}: “${a}”`);
			}
		}
	}
	return rv;
}

/**
 *	Enumeration of the general character categories indicated by {@link UnicodeCharacter#general}.
 *
 *	@readonly
 *	@enum {string}
 */
UnicodeData.prototype.Category = {
	/** Letter, Uppercase */
	Lu: 'Letter, Uppercase',
	/** Letter, Lowercase */
	Ll: 'Letter, Lowercase',
	/** Letter, Titlecase */
	Lt: 'Letter, Titlecase',
	/** Letter, Modifier */
	Lm: 'Letter, Modifier',
	/** Letter, Other */
	Lo: 'Letter, Other',
	/** Mark, Non-Spacing */
	Mn: 'Mark, Non-Spacing',
	/** Mark, Spacing Combining */
	Mc: 'Mark, Spacing Combining',
	/** Mark, Enclosing */
	Me: 'Mark, Enclosing',
	/** Number, Decimal Digit */
	Nd: 'Number, Decimal Digit',
	/** Number, Letter */
	Nl: 'Number, Letter',
	/** Number, Other */
	No: 'Number, Other',
	/** Punctuation, Connector */
	Pc: 'Punctuation, Connector',
	/** Punctuation, Dash */
	Pd: 'Punctuation, Dash',
	/** Punctuation, Open */
	Ps: 'Punctuation, Open',
	/** Punctuation, Close */
	Pe: 'Punctuation, Close',
	/** Punctuation, Initial quote (may behave like Ps or Pe depending on usage) */
	Pi: 'Punctuation, Initial quote (may behave like Ps or Pe depending on usage)',
	/** Punctuation, Final quote (may behave like Ps or Pe depending on usage) */
	Pf: 'Punctuation, Final quote (may behave like Ps or Pe depending on usage)',
	/** Punctuation, Other */
	Po: 'Punctuation, Other',
	/** Symbol, Math */
	Sm: 'Symbol, Math',
	/** Symbol, Currency */
	Sc: 'Symbol, Currency',
	/** Symbol, Modifier */
	Sk: 'Symbol, Modifier',
	/** Symbol, Other */
	So: 'Symbol, Other',
	/** Separator, Space */
	Zs: 'Separator, Space',
	/** Separator, Line */
	Zl: 'Separator, Line',
	/** Separator, Paragraph */
	Zp: 'Separator, Paragraph',
	/** Other, Control */
	Cc: 'Other, Control',
	/** Other, Format */
	Cf: 'Other, Format',
	/** Other, Surrogate */
	Cs: 'Other, Surrogate',
	/** Other, Private Use */
	Co: 'Other, Private Use',
	/** Other, Not Assigned (no characters in the file have this property) */
	Cn: 'Other, Not Assigned (no characters in the file have this property)',
	/** Default category (Lo) */
	'default': 'Lo'
};

/**
 *	Enumeration of character bi-directionality flags indicated in {@link UnicodeCharacter#bidi}.
 *
 *	@readonly
 *	@enum {string}
 */
UnicodeData.prototype.Bidirectionality = {
	/** Left-to-Right */
	L: 'Left-to-Right',
	/** Left-to-Right Embedding */
	LRE: 'Left-to-Right Embedding',
	/** Left-to-Right Override */
	LRO: 'Left-to-Right Override',
	/** Right-to-Left */
	R: 'Right-to-Left',
	/** Right-to-Left Arabic */
	AL: 'Right-to-Left Arabic',
	/** Right-to-Left Embedding */
	RLE: 'Right-to-Left Embedding',
	/** Right-to-Left Override */
	RLO: 'Right-to-Left Override',
	/** Pop Directional Format */
	PDF: 'Pop Directional Format',
	/** European Number */
	EN: 'European Number',
	/** European Number Separator */
	ES: 'European Number Separator',
	/** European Number Terminator */
	ET: 'European Number Terminator',
	/** Arabic Number */
	AN: 'Arabic Number',
	/** Common Number Separator */
	CS: 'Common Number Separator',
	/** Non-Spacing Mark */
	NSM: 'Non-Spacing Mark',
	/** Boundary Neutral */
	BN: 'Boundary Neutral',
	/** Paragraph Separator */
	B: 'Paragraph Separator',
	/** Segment Separator */
	S: 'Segment Separator',
	/** Whitespace */
	WS: 'Whitespace',
	/** Other Neutrals */
	ON: 'Other Neutrals',
	/** Default bi-directionality (L) */
	'default': 'L'
};

/**
 *	Enumeration of character decomposition flags indicated in {@link UnicodeCharacter#decomp}.
 *
 *	@readonly
 *	@enum {string}
 */
UnicodeData.prototype.Decomposition = {
	/** Canonical decomposition */
	canonical: 'Canonical decomposition',
	/** A font variant (e.g. a blackletter form) */
	font: 'A font variant (e.g. a blackletter form)',
	/** A no-break version of a space or hyphen */
	noBreak: 'A no-break version of a space or hyphen',
	/** An initial presentation form (Arabic) */
	initial: 'An initial presentation form (Arabic)',
	/** A medial presentation form (Arabic) */
	medial: 'A medial presentation form (Arabic)',
	/** A final presentation form (Arabic) */
	final: 'A final presentation form (Arabic)',
	/** An isolated presentation form (Arabic) */
	isolated: 'An isolated presentation form (Arabic)',
	/** An encircled form */
	circle: 'An encircled form',
	/** A superscript form */
	super: 'A superscript form',
	/** A subscript form */
	sub: 'A subscript form',
	/** A vertical layout presentation form */
	vertical: 'A vertical layout presentation form',
	/** A wide (or zenkaku) compatibility character */
	wide: 'A wide (or zenkaku) compatibility character',
	/** A narrow (or hankaku) compatibility character */
	narrow: 'A narrow (or hankaku) compatibility character',
	/** A small variant form (CNS compatibility) */
	small: 'A small variant form (CNS compatibility)',
	/** A CJK squared font variant */
	square: 'A CJK squared font variant',
	/** A vulgar fraction form */
	fraction: 'A vulgar fraction form',
	/** Otherwise unspecified compatibility character */
	compat: 'Otherwise unspecified compatibility character',
	/** Default decomposition (canonlical) */
	'default': 'canonical'
};

/**
 *	Enumeration of character combining flags indicated in {@link UnicodeCharacter#combining}.
 *
 *	@readonly
 *	@enum {number}
 */
UnicodeData.prototype.Combining = {
	/** Spacing, split, enclosing, reordrant, and Tibetan subjoined */
	0: 'Spacing, split, enclosing, reordrant, and Tibetan subjoined',
	/** Overlays and interior */
	1: 'Overlays and interior',
	/** Nuktas */
	7: 'Nuktas',
	/** Hiragana/Katakana voicing marks */
	8: 'Hiragana/Katakana voicing marks',
	/** Viramas */
	9: 'Viramas',
	/** Start of fixed position classes */
	10: 'Start of fixed position classes',
	/** End of fixed position classes */
	199: 'End of fixed position classes',
	/** Below left attached */
	200: 'Below left attached',
	/** Below attached */
	202: 'Below attached',
	/** Below right attached */
	204: 'Below right attached',
	/** Left attached (reordrant around single base character) */
	208: 'Left attached (reordrant around single base character)',
	/** Right attached */
	210: 'Right attached',
	/** Above left attached */
	212: 'Above left attached',
	/** Above attached */
	214: 'Above attached',
	/** Above right attached */
	216: 'Above right attached',
	/** Below left */
	218: 'Below left',
	/** Below */
	220: 'Below',
	/** Below right */
	222: 'Below right',
	/** Left (reordrant around single base character) */
	224: 'Left (reordrant around single base character)',
	/** Right */
	226: 'Right',
	/** Above left */
	228: 'Above left',
	/** Above */
	230: 'Above',
	/** Above right */
	232: 'Above right',
	/** Double below */
	233: 'Double below',
	/** Double above */
	234: 'Double above',
	/** Below (iota subscript) */
	240: 'Below (iota subscript)',
	/** Default combining flag (0 - Spacing, split, enclosing, reordrant, and Tibetan subjoined) */
	'default': 0
};

/**
 *	Provides date information about the Unicode character database.
 *
 *	<p>If the date of last modification is not provided, the download date is used.
 *
 *	<p>Database expiration can be specified as a date or as a time period (in milliseconds) that
 *	is added to the last modification date. If not provided, an expiration period of one year
 *	is chosen.
 *
 *	@class
 *	@constructor
 *	@param d {Date} date the database was downloaded
 *	@param m {Date} date of database last modification (optional)
 *	@param e {Date} expiration date or period (optional)
 */
function UnidataHeaders(d,m,e) {
	if(!d) {
		d = new Date();
	}
	if(!m) {
		m = d;
	}
	if(!e) {
		const year = 1000 * 60 * 60 * 24 * 365;
		e = new Date(m.valueOf() + year);
	} else if(typeof(e) === 'number') {
		e = new Date(m.valueOf() + e);
	}
	/**
	*	Date the database was downloaded.
	*
	*	@type {Date}
	*/
	this.date = d;
	/**
	*	Date the database was last updated on the server.
	*
	*	@type {Date}
	*/
	this.modified = m;
	/**
	*	Date the cached copy of the database is presumed to expire.
	*
	*	@type {Date}
	*/
	this.expires = e;
}

/**
 *	Encapsulates arguments to the {@Link UnicodeData} object’s {@link readystatechange} event.
 *
 *	@class
 *	@constructor
 *	@param s {UnicodeData} the object that emitted the event, i.e., the sender
 *	@param p {ReadyState} the previous ready state
 *	@param n {ReadyState} the new ready state
 */
function ReadyStateChangeEvent(s, p, n) {
	/**
	 *	The object that emitted the readystatechange event.
	 *
	 *	@type {UnicodeData}
	 */
	this.sender = s;
	/**
	 *	The previous ready state of the sender.
	 *
	 *	@type {ReadyState}
	 */
	this.prev = p;
	/**
	 *	The new (current) ready state of the sender.
	 *
	 *	@type {ReadyState}
	 */
	this.next = n;
}

/**
 *	Encapsulates arguments to the {@link UnicodeData} object’s {@link download} event.
 *
 *	@class
 *	@constructor
 *	@param s {UnicodeData} the object that emitted the event, i.e., the sender
 *	@param r {Request} the download request
 */
function DownloadEvent(s, r) {
	/**
	 *	The object that emitted the download event.
	 *
	 *	@type {UnicodeData}
	 */
	this.sender = s;
	/**
	 *	The HTTP GET request for the download.
	 *
	 *	@type {Request}
	 */
	this.request = r;
}

/**
 *	Encapsulates information about a single character or range of characters in the Unicode
 *	character database.
 *
 *	@class
 *	@constructor
 *	@param fields {Array<string>} fields from the UnicodeData.txt text database
 */
function UnicodeCharacter(fields) {
	if(Array.isArray(fields)) {
		/**
		 *	The numeric character code. For example, for LATIN CAPITAL LETTER A it is 65.
		 *	This member is present on all instances that represent single characters and is absent
		 *	on all instances that represent character ranges.
		 *
		 *	@type {number}
		 */
		this.codePoint = Number.parseInt(fields[0], 16);
		/**
		 *	The official name of the character as given in the Unicode standard. This string is
		 *	always upper-case. For example, the character U+0041 (A) has name “LATIN CAPITAL LETTER
		 *	A”. This emmber is present on all instances.
		 *
		 *	@type {string}
		 */
		this.name = fields[1];
		if(fields[2] && fields[2] !== UnicodeData.prototype.Category['default']) {
			/**
			 *	The two-letter abbreviation for this character’s general category as given in the
			 *	Unicode standard. For example, the character U+0041 (A) is in general category “Lu”
			 *	which includes all upper-case letters. If this member is absent the default value is
			 *	assumed.
			 *
			 *	@type {string}
			 *	@defaultvalue “Lo” (Letter, Other)
			 */
			this.general = fields[2];
		}
		if(fields[3]) {
			var n = Number.parseInt(fields[3]);
			if(n !== UnicodeData.prototype.Combining['default']) {
				/**
				 *	The numeric value of this character’s combining class as given in the Unicode
				 *	standard. For example, the character U+0041 (A) has combining class 0 which
				 *	includes all spacing, split, enclosing, reordrant, and Tibetan subjoined
				 *	characters. If this member is absent the default value is assumed.
				 *
				 *	@type {number}
				 *	@defaultvalue 0 (Spacing, split, enclosing, reordrant, and Tibetan subjoined)
				 */
				this.combining = n;
			}
		}
		if(fields[4] && fields[4] !== UnicodeData.prototype.Bidirectionality['default']) {
			/**
			 *	The two-or three-letter abbreviation that gives the bi-directionality of this
			 *	character as specified in the Unicode standard. For example, the character U+0041
			 *	(A) has bi-directionality “L” i.e., left-to-right. If this member is absent the
			 *	default value is assumed.
			 *
			 *	@type {string}
			 *	@defaultvalue “L” (Left-to-right)
			 */
			this.bidi = fields[4];
		}
		if(fields[5]) {
			var subfields = fields[5].split(' ').map(
				(x) => /\<\w+\>/.test(x) ? x.substring(1,x.length-1) : Number.parseInt(x, 16)
			);
			var decomp = {};
			var tag = UnicodeData.prototype.Decomposition['default'];
			for(var i = 0; i < subfields.length; ++i) {
				if(typeof(subfields[i]) === 'number') {
					if(tag in decomp) {
						decomp[tag].push(subfields[i]);
					} else {
						decomp[tag] = [subfields[i]];
						/**
						 *	The decomposition class of this character as given in the Unicode
						 *	standard. For example, the character U+0041 (A) has “canonical”
						 *	decomposition. If this member is absent, the default value is assumed.
						 *
						 *	@type {string}
						 *	@defaultvalue “canonical” (Canonical decomposition)
						 */
						this.decomp = decomp;
					}
				} else {
					tag = subfields[i];
				}
			}
		}
		if(fields[6]) {
			/**
			 *	The numeric value of this character if it represents a decimal digit. For example, the
			 *	decimal digit value of the character U+0665 (٥) ARABIC-INDIC DIGIT FIVE is 5. If
			 *	this member is absent the character does not represent a decimal digit: it may still
			 *	represent a non-decimal digit or other numeric value.
			 *
			 *	@type {number}
			 */
			this.decimal = Number.parseInt(fields[6]);
			this.digit = this.decimal;
			this.numeric = new Fraction(this.decimal);
		} else if(fields[7]) {
			/**
			 *	The numeric value of the digit if this character represents a digit. For example,
			 *	digit value of the character U+2075 (⁵) SUPERSCRIPT FIVE is 5. If this member is
			 *	absent the character does not represent a digit, but it may still represent a
			 *	numeric value.
			 *
			 *	@type {number}
			 */
			this.digit = Number.parseInt(fields[7]);
			this.numeric = new Fraction(this.digit);
		} else if(fields[8]) {
			/**
			 *	The fractional value of this character if it represents a number. For example,
			 *	the fractional numeric value of the character U+00BC (¼) VULGAR FRACTION ONE QUARTER
			 *	has numericator 1 and denominator 4. If this member is absent the character does
			 *	not have a numeric value.
			 *
			 *	@type {Fraction}
			 */
			this.numeric = new Fraction(fields[8]);
		}
		if(fields[9] === 'Y') {
			/**
			 *	Indicates the character is identified as a “mirrored” character in bi-directional
			 *	text. For example, character U+00AB («) LEFT-POINTING DOUBLE ANGLE QUOTATION MARK
			 *	is mirrored. If this member is absent the default value is assumed.
			 *
			 *	@type {Boolean}
			 *	@defaultvalue false
			 */
			this.mirrored = true;
		}
		if(fields[10]) {
			/**
			 *	The name of the character in the Unicode 1.0 standard, if different from the name
			 *	in the current standard.
			 *
			 *	@type {string}
			 */
			this.oldname = fields[10];
		}
		if(fields[11]) {
			/**
			 *	The comment given for the character in ISO 10646 — the ISO analogue of Unicode — if
			 *	the character has such a comment.
			 *
			 *	@type {string}
			 */
			this.comment = fields[11];
		}
		if(fields[12]) {
			/**
			 *	The numeric value of the code point of the character that is the uppercase
			 *	equivalent of this lowercase character. For example, the uppercase equivalent
			 *	of U+0061 (a) LATIN SMALL LETTER A is 65 (i.e., the code point for U+0041 (A) LATIN
			 *	CAPITAL LETTER A. If this member is absent, the letter has no uppercase equivalent.
			 *
			 *	@type {number}
			 */
			this.uppercase = Number.parseInt(fields[12], 16);
			if(fields[14]) {
				var tc = Number.parseInt(fields[14], 16);
				if(tc !== this.uppercase) {
					/**
					 *	The numeric value of the code point of the character that is the title case
					 *	equivalent of this lowercase character if different from the uppercase
					 *	equivalent. For example, the character U+01F3 (ǳ) LATIN SMALL LETTER DZ
					 *	has an uppercase equivalent of U+01F1 (Ǳ) LATIN CAPITAL LETTER DZ but its
					 *	titlecase equivalent is U+01F2 (ǲ) LATIN CAPITAL LETTER D WITH SMALL LETTER
					 *	Z. If this member is absent the character doesn’t have a titlecase
					 *	equivalent different from the uppercase equivalent.
					 *
					 *	@type {number}
					 */
					this.titlecase = tc;
				}
			}
		}
		if(fields[13]) {
			/**
			 *	The numeric value of the code point of the character that is the lowercase
			 *	equivalent of this uppercase character. For example, the lowercase equivalent
			 *	of U+0041 (A) LATIN CAPITAL LETTER A is 97 (i.e., the code point for U+0061 (a)
			 *	LATIN CAPITAL LETTER A. If this member is absent, the letter has no uppercase
			 *	equivalent.
			 *
			 *	@type {number}
			 */
			this.lowercase = Number.parseInt(fields[13], 16);
		}
		if(!this.name || this.name === '<control>') {
			if(this['oldname']) {
				this.name = this.oldname;
				delete this.oldname;
			} else if(this['comment']) {
				this.name = this.comment;
				delete this.comment;
			}
		} else if(this.name.endsWith(', First>')) {
			this.name = this.name.substring(1, this.name.length - ', First>'.length);
			/**
			 *	The first code point (inclusive) of a range of characters. This member is present
			 *	on all instances that represent range of characters and absent from instances that
			 *	represent single characters.
			 *
			 *	@type {number}
			 */
			this.first = this.codePoint;
			delete this.codePoint;
		} else if(this.name.endsWith(', Last>')) {
			this.name = this.name.substring(1, this.name.length - ', Last>'.length);
			/**
			 *	The last code point (inclusive) of a range of characters. This member is present on
			 *	all instances that represent range of characters and absent from instances that
			 *	represent single characters.
			 *
			 *	@type {number}
			 */
			this.last = this.codePoint;
			delete this.codePoint;
		}
	} else if(typeof(fields) === "object") {
		if('codePoint' in fields) {
			this.codePoint = fields.codePoint;
		} else if(('first' in fields) && ('last' in fields)) {
			this.first = fields.first;
			this.last = fields.last;
		}
		const subfields = [
			'name', 'general', 'combining', 'bidi', 'decomp', 'decimal', 'digit', 'numeric',
			'mirrored', 'oldname', 'comment', 'uppercase', 'titlecase', 'lowercase'
		];
		for(var i = 0; i < subfields.length; ++i) {
			if(subfields[i] in fields) {
				this[subfields[i]] = fields[subfields[i]];
			}
		}
		if('numeric' in this) {
			this.numeric = new Fraction(this.numeric);
		}
	}
}

/**
 *	Returns true if this character is printable.
 *
 *	@return {Boolean}
 */
UnicodeCharacter.prototype.isPrintable = function() {
	return [ 'Lm', 'Sk', 'Zs', 'Zl', 'Zp', 'Cc', 'Cf', 'Cs', 'Co', 'Cn' ].indexOf(
		this.general || UnicodeData.prototype.Category['default']
	) === -1;
}

/**
 *	Returns a human-readable string representation of this character. For example, “U+0041 (A) LATIN
 *	CAPITAL LETTER A”.
 *
 *	@return {string}
 */
UnicodeCharacter.prototype.toString = function() {
	var g = UnicodeData.prototype.Category[
		this.general || UnicodeData.prototype.Category['default']
	];
	var b = UnicodeData.prototype.Bidirectionality[
		this.bidi || UnicodeData.prototype.Bidirectionality['default']
	];
	if('codePoint' in this) {
		var u = this.codePoint.toString(16).toUpperCase();
		var n = this.codePoint < 0xFFFF ? 4 : 6;
		while(u.length < n) {
			u = '0' + u;
		}
		return 'U+'
			+ u
			+ (this.isPrintable() ? (' (' + this.string() + ') ') : ' ')
			+ this.name;
	} else if('first' in this && 'last' in this) {
		var u = this.first.toString(16).toUpperCase();
		var v = this.last.toString(16).toUpperCase();
		var n = Math.max(this.first, this.last) < 0xFFFF ? 4 : 6;
		while(u.length < n) {
			u = '0' + u;
		}
		while(v.length < n) {
			v = '0' + v;
		}
		return 'U+' + u + '~' + v + ' ' + this.name;
	} else {
		return JSON.stringify(this);
	}
}

/**
 *	Returns the bytes in the UTF-8 encoding of this character as an array of 8-bit numbers.
 *
 *	@returns {Uint8Array}
 */
UnicodeCharacter.prototype.utf8 = function() {
	if(this.codePoint > 0 && this.codePoint <= 0x7F) {
		return Uint8Arrray.of(this.codePoint);
	} else if(this.codePoint >= 0x80 && this.codePoint <= 0x7FF) {
		return Uint8Array.of(
			0xC0 | ((this.codePoint >> 6) & 0x1F),
			0x80 | (this.codePoint & 0x3F)
		);
	} else if(this.codePoint >= 0x800 && this.codePoint <= 0xFFFF) {
		return  Uint8Array.of(
			0xC0 | ((this.codePoint >> 12) & 0xF),
			0x80 | ((this.codePoint >> 6) & 0x3F),
			0x80 | (this.codePoint & 0x3F)
		);
	} else if(this.codePoint >= 0x10000 && this.codePoint <= 0x1FFFFF) {
		return  Uint8Array.of(
			0xF0 | ((this.codePoint >> 18) & 0x7),
			0x80 | ((this.codePoint >> 12) & 0x3F),
			0x80 | ((this.codePoint >> 6) & 0x3F),
			0x80 | (this.codePoint & 0x3F)
		);
	} else {
		throw new Error(`Invalid code point: ${this.codePoint}`);
	}
}

/**
 *	Returns the words in the UTF-16 encoding of this character as an array of 16-bit numbers.
 *
 *	@returns {Uint16Array}
 */
UnicodeCharacter.prototype.utf16 = function() {
	if((this.codePoint > 0 && this.codePoint <= 0xD7FF)
		|| (this.codePoint >= 0xE000 && this.codePoint <= 0xFFFF)) {
		return Uint16Array.of( this.codePoint );
	} else if(this.codePoint >= 0x10000 && this.codePoint <= 0x10FFFF) {
		var x = this.codePoint - 0x10000;
		return Uint16Array.of( 0xD800 + ((x >> 10) & 0x3FF), 0xDC00 + (x & 0x3FF) );
	} else {
		throw new Error(`Invalid code point: ${this.codePoint}`);
	}
}

/**
 *	Returns a string (UTF-16) representation of this character.
 *
 *	@returns {string}
 */
UnicodeCharacter.prototype.string = function() {
	if((this.codePoint > 0 && this.codePoint <= 0xD7FF)
		|| (this.codePoint >= 0xE000 && this.codePoint <= 0xFFFF)) {
		return String.fromCharCode( this.codePoint );
	} else if(this.codePoint >= 0x10000 && this.codePoint <= 0x10FFFF) {
		var x = this.codePoint - 0x10000;
		return String.fromCharCode(0xD800 + ((x >> 10) & 0x3FF)) + String.fromCharCode(0xDC00 + (x & 0x3FF));
	} else {
		throw new Error(`Invalid code point: ${this.codePoint}`);
	}
}

/**
 *	Represents a fraction i.e., a numerator and a denominator.
 *
 *	@class
 *	@constructor
 *	@param n {number|string} numerator or string representation of the fraction
 *	@param d {number} (optional) denominator of the fraction
 */
function Fraction(n, d) {
	if(typeof(d) === "number") {
		this.denominator = d;
	} else {
		this.denominator = 1;
	}
	if(typeof(n) === "number") {
		this.numerator = n;
	} else if(typeof(n) === "string") {
		var slash = n.indexOf('/');
		if(slash > 0) {
			/**
			 *	The numerator of the fraction.
			 *
			 *	@type {number}
			 */
			this.numerator = Number.parseInt(n.substring(0, slash));
			/**
			 *	The denominator of the fraction.
			 *
			 *	@type {number}
			 *	@defaultvalue 1
			 */
			this.denominator = Number.parseInt(n.substring(slash + 1));
		} else {
			this.numerator = Number.parseFloat(n);
		}
	} else if((typeof(n) === "object") && (n instanceof Fraction)) {
		this.numerator = n.numerator;
		this.denominator = n.denominator;
	} else {
		throw new TypeError(`${n} must be a number or a string`);
	}
	/**
	 *	The numeric value of the fraction i.e., numerator divided by denominator.
	 *
	 *	@type {number}
	 */
	this.value = this.numerator / this.denominator;
}

/**
 *	Formats the fraction either as a whole number (if the denominator is 1) or as a fraction string
 *	i.e., numerator / denominator.
 *
 *	@return {string}
 */
Fraction.prototype.toString = function() {
	if(this.denominator !== 1) {
		return String(this.numerator) + '/' + String(this.denominator);
	} else {
		return String(this.numerator);
	}
}

if((require.main.filename === __filename) && (process.argv.length > 2) && (process.argv[2] === '--update-sources')) {
	const path = require('path');
	const fs = require('fs');
	module.exports = new UnicodeData('clear');
	module.exports.on('download', function(ev) {
		console.log(`Downloading… ${ev.request.uri.href}`);
	});
	console.log('Clearing cache and source data files…');
	console.log('    » ' + DefaultCacheLocation().join(path.sep));
	console.log('    » ' + path.join(__dirname, 'UnicodeData.js'));
	var p = new Promise(function(res,rej) {
		fs.unlink(path.join(__dirname, 'UnicodeData.js'), function(err) {
			setImmediate(res);
		});
	});
	Promise.all([module.exports.uncache(), p]).then(function() {
		console.log('Rebuilding cache…');
		module.exports.reload().promise().then(function(unidata) {
			var dstfile = path.join(__dirname, 'UnicodeData.js');
			console.log(`Writing… ${dstfile}`);
			fs.writeFile(dstfile, JSON.stringify(unidata), { encoding: 'utf8' }, function(err) {
				if(err) {
					console.log(`Source update failed: ${err}`);
				} else {
					console.log(`Source update complete, valid until: ${unidata.headers.expires}`);
				}
			});
		}, function(err) {
			console.log(`Rebuild failed: ${err}`);
		});
	});
} else {
	module.exports = new UnicodeData();
}
