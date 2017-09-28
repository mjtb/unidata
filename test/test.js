var should = require('should');
var UnicodeData = require('../unidata.js');

describe('UnicodeData', function() {
	describe('#get', function() {
		it('should have LATIN CAPITAL LETTER A at index 0x41', function() {
			UnicodeData.instance().promise().should.eventually.match(() => {
				var A = UnicodeData.instance().get(0x41);
				A.should.be.ok();
				should(A.charCode).be.exactly(0x41);
				A.name.should.equal('LATIN CAPTIAL LETTER A');
				should(A.isPrintable()).be.true();
				should(A.lowercase).be.exactly(0x61);
				A.toString().should.be.exactly('U+0041 (A) LATIN CAPITAL LETTER A');
				var a = UnicodeData.instance().get(A.lowercase);
				a.should.be.ok();
				should(a.uppercase).be.exactly(0x41);
				return true;
			});
		});

	});
	describe('#find', function() {
		it('should be null if unique term not found', function() {
			UnicodeData.instance().promise().should.eventually.match(() => {
				should(UnicodeData.instance().find('blargle', true)).be.null();
				return true;
			});
		});
		it('should be empty if term not found and not unique', function() {
			UnicodeData.instance().promise().should.eventually.match(() => {
				var m = UnicodeData.instance().find('blargle');
				m.should.be.array();
				m.should.be.empty();
				return true;
			});
		});
		it('should find terms', function() {
			UnicodeData.instance().promise().should.eventually.match(() => {
				var m = UnicodeData.instance().find('spider');
				m.should.be.array();
				m.should.not.be.empty();
				m.should.matchAny((x) => x.charCode === 0x1F577);
				return true;
			});
		});
		it('should find filtered match', function() {
			UnicodeData.instance().promise().should.eventually.match(() => {
				var c = UnicodeData.instance().find((x) => x.charCode === 0x1F577, true);
				c.should.be.ok();
				should(c.charCode).be.exactly(0x1F577);
				return true;
			});
		});
	});
	describe('#utf8', function() {
		it('should encode < U+007F', function() {
			UnicodeData.instance().promise().should.eventually.match(() => {
				var A = UnicodeData.instance().get(0x41);
				A.should.be.ok();
				A.utf8().should.eql(Uint8Array.of(0x41));
				return true;
			});
		});
		it('should encode > U+FFFF', function() {
			UnicodeData.instance().promise().should.eventually.match(() => {
				var spider = UnicodeData.instance().get(0x1F577);
				spider.should.be.ok();
				spider.utf8().should.eql(Uint8Array.of( 0xF0, 0x9F, 0x95, 0xB7 ));
				return true;
			});
		});
	});
	describe('#utf16', function() {
		it('should encode < U+FFFF', function() {
			UnicodeData.instance().promise().should.eventually.match(() => {
				var A = UnicodeData.instance().get(0x41);
				A.should.be.ok();
				A.utf16().should.eql(Uint16Array.of( 0x41 ));
				var ellipses = UnicodeData.instance().get(0x2026);
				ellipses.should.be.ok();
				ellipses.utf16().should.eql(Uint16Array.of( 0x2026 ));
				return true;
			});
		});
		it('should encode > U+FFFF', function() {
			UnicodeData.instance().promise().should.eventually.match(() => {
				var spider = UnicodeData.instance().get(0x1F577);
				spider.should.be.ok();
				spider.utf16().should.eql(Uint16Array.of( 0xD83D, 0xDD77 ));
				return true;
			});
		});
	});
});
