/// <reference types="node" />

import { EventEmitter } from 'events';

declare module 'mjtb-unidata' {

    export enum ReadyState {
        UNINITIALIZED = 0,
        INITIALIZING,
        LOADING,
        DOWNLOADING,
        PARSING,
        CACHED,
        READY
    }

    export interface UnidataHeaders {
        date: Date;
        modified: Date;
        expires: Date;
    }

    export interface Fraction {
        denominator: number;
        numerator: number;
        value: number;
        toString(): string;
    }

    export interface UnicodeCharacter {
        codePoint?: number;
        first?: number;
        last?: number;
        name: string;
        general?: string;
        combining?: number;
        bidi?: string;
        decomp?: string;
        decimal?: number;
        digit?: number;
        numeric?: Fraction;
        mirrored?: boolean;
        oldname?: string;
        uppercase?: number;
        titlecase?: number;
        lowercase?: number;
        isPrintable(): boolean;
        toString(): string;
        utf8(): string;
        string(): string;
    }

    type Codepoint = number | UnicodeCharacter | string;

    export const Category: {
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

	export const Bidirectionality: {
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

    export const Combining: {
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

    export const Decomposition: {
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

    export interface UnicodeData extends EventEmitter {
        toJSON(): any;
        uncache(cachedir?: string): Promise<void>;
        reload(cachedir?: string): Promise<UnicodeData>;
        readyState: ReadyState;
        headers: UnidataHeaders;
        characters: any;
        ranges: UnicodeCharacter[];
        promise(): Promise<UnicodeData>;
        find(filter: string | Function, unique: boolean, selection: string): UnicodeCharacter | UnicodeCharacter[];
        get(codePoint: number): UnicodeCharacter;
        split(str: string): number[];
        join(...codepoints: Codepoint[]): string;
    }

    export interface ReadyStateChangeEvent {
        sender: UnicodeData;
        prev: ReadyState;
        next: ReadyState;
    }

    export interface DownloaderEvent {
        sender: UnicodeData;
        request: Request;
    }

	export function instance(): UnicodeData;

}
