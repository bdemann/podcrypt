import { P as Principal$1 } from './index-4ec43205.js';

/**
 * Concatenate multiple array buffers.
 * @param buffers The buffers to concatenate.
 */
function concat(...buffers) {
    const result = new Uint8Array(buffers.reduce((acc, curr) => acc + curr.byteLength, 0));
    let index = 0;
    for (const b of buffers) {
        result.set(new Uint8Array(b), index);
        index += b.byteLength;
    }
    return result;
}
/**
 * A class that abstracts a pipe-like ArrayBuffer.
 */
class PipeArrayBuffer {
    /**
     * Creates a new instance of a pipe
     * @param buffer an optional buffer to start with
     * @param length an optional amount of bytes to use for the length.
     */
    constructor(buffer, length = (buffer === null || buffer === void 0 ? void 0 : buffer.byteLength) || 0) {
        this._buffer = buffer || new ArrayBuffer(0);
        this._view = new Uint8Array(this._buffer, 0, length);
    }
    get buffer() {
        // Return a copy of the buffer.
        return this._view.slice();
    }
    get byteLength() {
        return this._view.byteLength;
    }
    /**
     * Read `num` number of bytes from the front of the pipe.
     * @param num The number of bytes to read.
     */
    read(num) {
        const result = this._view.subarray(0, num);
        this._view = this._view.subarray(num);
        return result.slice().buffer;
    }
    readUint8() {
        const result = this._view[0];
        this._view = this._view.subarray(1);
        return result;
    }
    /**
     * Write a buffer to the end of the pipe.
     * @param buf The bytes to write.
     */
    write(buf) {
        const b = new Uint8Array(buf);
        const offset = this._view.byteLength;
        if (this._view.byteOffset + this._view.byteLength + b.byteLength >= this._buffer.byteLength) {
            // Alloc grow the view to include the new bytes.
            this.alloc(b.byteLength);
        }
        else {
            // Update the view to include the new bytes.
            this._view = new Uint8Array(this._buffer, this._view.byteOffset, this._view.byteLength + b.byteLength);
        }
        this._view.set(b, offset);
    }
    /**
     * Whether or not there is more data to read from the buffer
     */
    get end() {
        return this._view.byteLength === 0;
    }
    /**
     * Allocate a fixed amount of memory in the buffer. This does not affect the view.
     * @param amount A number of bytes to add to the buffer.
     */
    alloc(amount) {
        // Add a little bit of exponential growth.
        // tslint:disable-next-line:no-bitwise
        const b = new ArrayBuffer(((this._buffer.byteLength + amount) * 1.2) | 0);
        const v = new Uint8Array(b, 0, this._view.byteLength + amount);
        v.set(this._view);
        this._buffer = b;
        this._view = v;
    }
}

/**
 * Hashes a string to a number. Algorithm can be found here:
 * https://caml.inria.fr/pub/papers/garrigue-polymorphic_variants-ml98.pdf
 * @param s
 */
function idlHash(s) {
    const utf8encoder = new TextEncoder();
    const array = utf8encoder.encode(s);
    let h = 0;
    for (const c of array) {
        h = (h * 223 + c) % 2 ** 32;
    }
    return h;
}
/**
 *
 * @param label string
 * @returns number representing hashed label
 */
function idlLabelToId(label) {
    if (/^_\d+_$/.test(label) || /^_0x[0-9a-fA-F]+_$/.test(label)) {
        const num = +label.slice(1, -1);
        if (Number.isSafeInteger(num) && num >= 0 && num < 2 ** 32) {
            return num;
        }
    }
    return idlHash(label);
}

/* eslint-disable no-constant-condition */
function eob() {
    throw new Error('unexpected end of buffer');
}
/**
 *
 * @param pipe Pipe from buffer-pipe
 * @param num number
 * @returns Buffer
 */
function safeRead(pipe, num) {
    if (pipe.byteLength < num) {
        eob();
    }
    return pipe.read(num);
}
/**
 * @param pipe
 */
function safeReadUint8(pipe) {
    const byte = pipe.readUint8();
    if (byte === undefined) {
        eob();
    }
    return byte;
}
/**
 * Encode a positive number (or bigint) into a Buffer. The number will be floored to the
 * nearest integer.
 * @param value The number to encode.
 */
function lebEncode(value) {
    if (typeof value === 'number') {
        value = BigInt(value);
    }
    if (value < BigInt(0)) {
        throw new Error('Cannot leb encode negative values.');
    }
    const byteLength = (value === BigInt(0) ? 0 : Math.ceil(Math.log2(Number(value)))) + 1;
    const pipe = new PipeArrayBuffer(new ArrayBuffer(byteLength), 0);
    while (true) {
        const i = Number(value & BigInt(0x7f));
        value /= BigInt(0x80);
        if (value === BigInt(0)) {
            pipe.write(new Uint8Array([i]));
            break;
        }
        else {
            pipe.write(new Uint8Array([i | 0x80]));
        }
    }
    return pipe.buffer;
}
/**
 * Decode a leb encoded buffer into a bigint. The number will always be positive (does not
 * support signed leb encoding).
 * @param pipe A Buffer containing the leb encoded bits.
 */
function lebDecode(pipe) {
    let weight = BigInt(1);
    let value = BigInt(0);
    let byte;
    do {
        byte = safeReadUint8(pipe);
        value += BigInt(byte & 0x7f).valueOf() * weight;
        weight *= BigInt(128);
    } while (byte >= 0x80);
    return value;
}
/**
 * Encode a number (or bigint) into a Buffer, with support for negative numbers. The number
 * will be floored to the nearest integer.
 * @param value The number to encode.
 */
function slebEncode(value) {
    if (typeof value === 'number') {
        value = BigInt(value);
    }
    const isNeg = value < BigInt(0);
    if (isNeg) {
        value = -value - BigInt(1);
    }
    const byteLength = (value === BigInt(0) ? 0 : Math.ceil(Math.log2(Number(value)))) + 1;
    const pipe = new PipeArrayBuffer(new ArrayBuffer(byteLength), 0);
    while (true) {
        const i = getLowerBytes(value);
        value /= BigInt(0x80);
        // prettier-ignore
        if ((isNeg && value === BigInt(0) && (i & 0x40) !== 0)
            || (!isNeg && value === BigInt(0) && (i & 0x40) === 0)) {
            pipe.write(new Uint8Array([i]));
            break;
        }
        else {
            pipe.write(new Uint8Array([i | 0x80]));
        }
    }
    function getLowerBytes(num) {
        const bytes = num % BigInt(0x80);
        if (isNeg) {
            // We swap the bits here again, and remove 1 to do two's complement.
            return Number(BigInt(0x80) - bytes - BigInt(1));
        }
        else {
            return Number(bytes);
        }
    }
    return pipe.buffer;
}
/**
 * Decode a leb encoded buffer into a bigint. The number is decoded with support for negative
 * signed-leb encoding.
 * @param pipe A Buffer containing the signed leb encoded bits.
 */
function slebDecode(pipe) {
    // Get the size of the buffer, then cut a buffer of that size.
    const pipeView = new Uint8Array(pipe.buffer);
    let len = 0;
    for (; len < pipeView.byteLength; len++) {
        if (pipeView[len] < 0x80) {
            // If it's a positive number, we reuse lebDecode.
            if ((pipeView[len] & 0x40) === 0) {
                return lebDecode(pipe);
            }
            break;
        }
    }
    const bytes = new Uint8Array(safeRead(pipe, len + 1));
    let value = BigInt(0);
    for (let i = bytes.byteLength - 1; i >= 0; i--) {
        value = value * BigInt(0x80) + BigInt(0x80 - (bytes[i] & 0x7f) - 1);
    }
    return -value - BigInt(1);
}
/**
 *
 * @param value bigint or number
 * @param byteLength number
 * @returns Buffer
 */
function writeUIntLE(value, byteLength) {
    if (BigInt(value) < BigInt(0)) {
        throw new Error('Cannot write negative values.');
    }
    return writeIntLE(value, byteLength);
}
/**
 *
 * @param value
 * @param byteLength
 */
function writeIntLE(value, byteLength) {
    value = BigInt(value);
    const pipe = new PipeArrayBuffer(new ArrayBuffer(Math.min(1, byteLength)), 0);
    let i = 0;
    let mul = BigInt(256);
    let sub = BigInt(0);
    let byte = Number(value % mul);
    pipe.write(new Uint8Array([byte]));
    while (++i < byteLength) {
        if (value < 0 && sub === BigInt(0) && byte !== 0) {
            sub = BigInt(1);
        }
        byte = Number((value / mul - sub) % BigInt(256));
        pipe.write(new Uint8Array([byte]));
        mul *= BigInt(256);
    }
    return pipe.buffer;
}
/**
 *
 * @param pipe Pipe from buffer-pipe
 * @param byteLength number
 * @returns bigint
 */
function readUIntLE(pipe, byteLength) {
    let val = BigInt(safeReadUint8(pipe));
    let mul = BigInt(1);
    let i = 0;
    while (++i < byteLength) {
        mul *= BigInt(256);
        const byte = BigInt(safeReadUint8(pipe));
        val = val + mul * byte;
    }
    return val;
}
/**
 *
 * @param pipe Pipe from buffer-pipe
 * @param byteLength number
 * @returns bigint
 */
function readIntLE(pipe, byteLength) {
    let val = readUIntLE(pipe, byteLength);
    const mul = BigInt(2) ** (BigInt(8) * BigInt(byteLength - 1) + BigInt(7));
    if (val >= mul) {
        val -= mul * BigInt(2);
    }
    return val;
}

// tslint:disable:max-classes-per-file
const magicNumber = 'DIDL';
function zipWith(xs, ys, f) {
    return xs.map((x, i) => f(x, ys[i]));
}
/**
 * An IDL Type Table, which precedes the data in the stream.
 */
class TypeTable {
    constructor() {
        // List of types. Needs to be an array as the index needs to be stable.
        this._typs = [];
        this._idx = new Map();
    }
    has(obj) {
        return this._idx.has(obj.name);
    }
    add(type, buf) {
        const idx = this._typs.length;
        this._idx.set(type.name, idx);
        this._typs.push(buf);
    }
    merge(obj, knot) {
        const idx = this._idx.get(obj.name);
        const knotIdx = this._idx.get(knot);
        if (idx === undefined) {
            throw new Error('Missing type index for ' + obj);
        }
        if (knotIdx === undefined) {
            throw new Error('Missing type index for ' + knot);
        }
        this._typs[idx] = this._typs[knotIdx];
        // Delete the type.
        this._typs.splice(knotIdx, 1);
        this._idx.delete(knot);
    }
    encode() {
        const len = lebEncode(this._typs.length);
        const buf = concat(...this._typs);
        return concat(len, buf);
    }
    indexOf(typeName) {
        if (!this._idx.has(typeName)) {
            throw new Error('Missing type index for ' + typeName);
        }
        return slebEncode(this._idx.get(typeName) || 0);
    }
}
class Visitor {
    visitType(t, data) {
        throw new Error('Not implemented');
    }
    visitPrimitive(t, data) {
        return this.visitType(t, data);
    }
    visitEmpty(t, data) {
        return this.visitPrimitive(t, data);
    }
    visitBool(t, data) {
        return this.visitPrimitive(t, data);
    }
    visitNull(t, data) {
        return this.visitPrimitive(t, data);
    }
    visitReserved(t, data) {
        return this.visitPrimitive(t, data);
    }
    visitText(t, data) {
        return this.visitPrimitive(t, data);
    }
    visitNumber(t, data) {
        return this.visitPrimitive(t, data);
    }
    visitInt(t, data) {
        return this.visitNumber(t, data);
    }
    visitNat(t, data) {
        return this.visitNumber(t, data);
    }
    visitFloat(t, data) {
        return this.visitPrimitive(t, data);
    }
    visitFixedInt(t, data) {
        return this.visitNumber(t, data);
    }
    visitFixedNat(t, data) {
        return this.visitNumber(t, data);
    }
    visitPrincipal(t, data) {
        return this.visitPrimitive(t, data);
    }
    visitConstruct(t, data) {
        return this.visitType(t, data);
    }
    visitVec(t, ty, data) {
        return this.visitConstruct(t, data);
    }
    visitOpt(t, ty, data) {
        return this.visitConstruct(t, data);
    }
    visitRecord(t, fields, data) {
        return this.visitConstruct(t, data);
    }
    visitTuple(t, components, data) {
        const fields = components.map((ty, i) => [`_${i}_`, ty]);
        return this.visitRecord(t, fields, data);
    }
    visitVariant(t, fields, data) {
        return this.visitConstruct(t, data);
    }
    visitRec(t, ty, data) {
        return this.visitConstruct(ty, data);
    }
    visitFunc(t, data) {
        return this.visitConstruct(t, data);
    }
    visitService(t, data) {
        return this.visitConstruct(t, data);
    }
}
/**
 * Represents an IDL type.
 */
class Type {
    /* Display type name */
    display() {
        return this.name;
    }
    valueToString(x) {
        return toReadableString(x);
    }
    /* Implement `T` in the IDL spec, only needed for non-primitive types */
    buildTypeTable(typeTable) {
        if (!typeTable.has(this)) {
            this._buildTypeTableImpl(typeTable);
        }
    }
}
class PrimitiveType extends Type {
    checkType(t) {
        if (this.name !== t.name) {
            throw new Error(`type mismatch: type on the wire ${t.name}, expect type ${this.name}`);
        }
        return t;
    }
    _buildTypeTableImpl(typeTable) {
        // No type table encoding for Primitive types.
        return;
    }
}
class ConstructType extends Type {
    checkType(t) {
        if (t instanceof RecClass) {
            const ty = t.getType();
            if (typeof ty === 'undefined') {
                throw new Error('type mismatch with uninitialized type');
            }
            return ty;
        }
        throw new Error(`type mismatch: type on the wire ${t.name}, expect type ${this.name}`);
    }
    encodeType(typeTable) {
        return typeTable.indexOf(this.name);
    }
}
/**
 * Represents an IDL Empty, a type which has no inhabitants.
 * Since no values exist for this type, it cannot be serialised or deserialised.
 * Result types like `Result<Text, Empty>` should always succeed.
 */
class EmptyClass extends PrimitiveType {
    accept(v, d) {
        return v.visitEmpty(this, d);
    }
    covariant(x) {
        return false;
    }
    encodeValue() {
        throw new Error('Empty cannot appear as a function argument');
    }
    valueToString() {
        throw new Error('Empty cannot appear as a value');
    }
    encodeType() {
        return slebEncode(-17 /* Empty */);
    }
    decodeValue() {
        throw new Error('Empty cannot appear as an output');
    }
    get name() {
        return 'empty';
    }
}
/**
 * Represents an IDL Bool
 */
class BoolClass extends PrimitiveType {
    accept(v, d) {
        return v.visitBool(this, d);
    }
    covariant(x) {
        return typeof x === 'boolean';
    }
    encodeValue(x) {
        return new Uint8Array([x ? 1 : 0]);
    }
    encodeType() {
        return slebEncode(-2 /* Bool */);
    }
    decodeValue(b, t) {
        this.checkType(t);
        switch (safeReadUint8(b)) {
            case 0:
                return false;
            case 1:
                return true;
            default:
                throw new Error('Boolean value out of range');
        }
    }
    get name() {
        return 'bool';
    }
}
/**
 * Represents an IDL Null
 */
class NullClass extends PrimitiveType {
    accept(v, d) {
        return v.visitNull(this, d);
    }
    covariant(x) {
        return x === null;
    }
    encodeValue() {
        return new ArrayBuffer(0);
    }
    encodeType() {
        return slebEncode(-1 /* Null */);
    }
    decodeValue(b, t) {
        this.checkType(t);
        return null;
    }
    get name() {
        return 'null';
    }
}
/**
 * Represents an IDL Reserved
 */
class ReservedClass extends PrimitiveType {
    accept(v, d) {
        return v.visitReserved(this, d);
    }
    covariant(x) {
        return true;
    }
    encodeValue() {
        return new ArrayBuffer(0);
    }
    encodeType() {
        return slebEncode(-16 /* Reserved */);
    }
    decodeValue(b, t) {
        if (t.name !== this.name) {
            t.decodeValue(b, t);
        }
        return null;
    }
    get name() {
        return 'reserved';
    }
}
/**
 * Represents an IDL Text
 */
class TextClass extends PrimitiveType {
    accept(v, d) {
        return v.visitText(this, d);
    }
    covariant(x) {
        return typeof x === 'string';
    }
    encodeValue(x) {
        const buf = new TextEncoder().encode(x);
        const len = lebEncode(buf.byteLength);
        return concat(len, buf);
    }
    encodeType() {
        return slebEncode(-15 /* Text */);
    }
    decodeValue(b, t) {
        this.checkType(t);
        const len = lebDecode(b);
        const buf = safeRead(b, Number(len));
        const decoder = new TextDecoder('utf8', { fatal: true });
        return decoder.decode(buf);
    }
    get name() {
        return 'text';
    }
    valueToString(x) {
        return '"' + x + '"';
    }
}
/**
 * Represents an IDL Int
 */
class IntClass extends PrimitiveType {
    accept(v, d) {
        return v.visitInt(this, d);
    }
    covariant(x) {
        // We allow encoding of JavaScript plain numbers.
        // But we will always decode to bigint.
        return typeof x === 'bigint' || Number.isInteger(x);
    }
    encodeValue(x) {
        return slebEncode(x);
    }
    encodeType() {
        return slebEncode(-4 /* Int */);
    }
    decodeValue(b, t) {
        this.checkType(t);
        return slebDecode(b);
    }
    get name() {
        return 'int';
    }
    valueToString(x) {
        return x.toString();
    }
}
/**
 * Represents an IDL Nat
 */
class NatClass extends PrimitiveType {
    accept(v, d) {
        return v.visitNat(this, d);
    }
    covariant(x) {
        // We allow encoding of JavaScript plain numbers.
        // But we will always decode to bigint.
        return (typeof x === 'bigint' && x >= BigInt(0)) || (Number.isInteger(x) && x >= 0);
    }
    encodeValue(x) {
        return lebEncode(x);
    }
    encodeType() {
        return slebEncode(-3 /* Nat */);
    }
    decodeValue(b, t) {
        this.checkType(t);
        return lebDecode(b);
    }
    get name() {
        return 'nat';
    }
    valueToString(x) {
        return x.toString();
    }
}
/**
 * Represents an IDL Float
 */
class FloatClass extends PrimitiveType {
    constructor(_bits) {
        super();
        this._bits = _bits;
        if (_bits !== 32 && _bits !== 64) {
            throw new Error('not a valid float type');
        }
    }
    accept(v, d) {
        return v.visitFloat(this, d);
    }
    covariant(x) {
        return typeof x === 'number' || x instanceof Number;
    }
    encodeValue(x) {
        const buf = new ArrayBuffer(this._bits / 8);
        const view = new DataView(buf);
        if (this._bits === 32) {
            view.setFloat32(0, x, true);
        }
        else {
            view.setFloat64(0, x, true);
        }
        return buf;
    }
    encodeType() {
        const opcode = this._bits === 32 ? -13 /* Float32 */ : -14 /* Float64 */;
        return slebEncode(opcode);
    }
    decodeValue(b, t) {
        this.checkType(t);
        const bytes = safeRead(b, this._bits / 8);
        const view = new DataView(bytes);
        if (this._bits === 32) {
            return view.getFloat32(0, true);
        }
        else {
            return view.getFloat64(0, true);
        }
    }
    get name() {
        return 'float' + this._bits;
    }
    valueToString(x) {
        return x.toString();
    }
}
/**
 * Represents an IDL fixed-width Int(n)
 */
class FixedIntClass extends PrimitiveType {
    constructor(_bits) {
        super();
        this._bits = _bits;
    }
    accept(v, d) {
        return v.visitFixedInt(this, d);
    }
    covariant(x) {
        const min = BigInt(2) ** BigInt(this._bits - 1) * BigInt(-1);
        const max = BigInt(2) ** BigInt(this._bits - 1) - BigInt(1);
        if (typeof x === 'bigint') {
            return x >= min && x <= max;
        }
        else if (Number.isInteger(x)) {
            const v = BigInt(x);
            return v >= min && v <= max;
        }
        else {
            return false;
        }
    }
    encodeValue(x) {
        return writeIntLE(x, this._bits / 8);
    }
    encodeType() {
        const offset = Math.log2(this._bits) - 3;
        return slebEncode(-9 - offset);
    }
    decodeValue(b, t) {
        this.checkType(t);
        const num = readIntLE(b, this._bits / 8);
        if (this._bits <= 32) {
            return Number(num);
        }
        else {
            return num;
        }
    }
    get name() {
        return `int${this._bits}`;
    }
    valueToString(x) {
        return x.toString();
    }
}
/**
 * Represents an IDL fixed-width Nat(n)
 */
class FixedNatClass extends PrimitiveType {
    constructor(bits) {
        super();
        this.bits = bits;
    }
    accept(v, d) {
        return v.visitFixedNat(this, d);
    }
    covariant(x) {
        const max = BigInt(2) ** BigInt(this.bits);
        if (typeof x === 'bigint' && x >= BigInt(0)) {
            return x < max;
        }
        else if (Number.isInteger(x) && x >= 0) {
            const v = BigInt(x);
            return v < max;
        }
        else {
            return false;
        }
    }
    encodeValue(x) {
        return writeUIntLE(x, this.bits / 8);
    }
    encodeType() {
        const offset = Math.log2(this.bits) - 3;
        return slebEncode(-5 - offset);
    }
    decodeValue(b, t) {
        this.checkType(t);
        const num = readUIntLE(b, this.bits / 8);
        if (this.bits <= 32) {
            return Number(num);
        }
        else {
            return num;
        }
    }
    get name() {
        return `nat${this.bits}`;
    }
    valueToString(x) {
        return x.toString();
    }
}
/**
 * Represents an IDL Array
 * @param {Type} t
 */
class VecClass extends ConstructType {
    constructor(_type) {
        super();
        this._type = _type;
        // If true, this vector is really a blob and we can just use memcpy.
        this._blobOptimization = false;
        if (_type instanceof FixedNatClass && _type.bits === 8) {
            this._blobOptimization = true;
        }
    }
    accept(v, d) {
        return v.visitVec(this, this._type, d);
    }
    covariant(x) {
        return Array.isArray(x) && x.every(v => this._type.covariant(v));
    }
    encodeValue(x) {
        const len = lebEncode(x.length);
        if (this._blobOptimization) {
            return concat(len, new Uint8Array(x));
        }
        return concat(len, ...x.map(d => this._type.encodeValue(d)));
    }
    _buildTypeTableImpl(typeTable) {
        this._type.buildTypeTable(typeTable);
        const opCode = slebEncode(-19 /* Vector */);
        const buffer = this._type.encodeType(typeTable);
        typeTable.add(this, concat(opCode, buffer));
    }
    decodeValue(b, t) {
        const vec = this.checkType(t);
        if (!(vec instanceof VecClass)) {
            throw new Error('Not a vector type');
        }
        const len = Number(lebDecode(b));
        if (this._blobOptimization) {
            return [...new Uint8Array(b.read(len))];
        }
        const rets = [];
        for (let i = 0; i < len; i++) {
            rets.push(this._type.decodeValue(b, vec._type));
        }
        return rets;
    }
    get name() {
        return `vec ${this._type.name}`;
    }
    display() {
        return `vec ${this._type.display()}`;
    }
    valueToString(x) {
        const elements = x.map(e => this._type.valueToString(e));
        return 'vec {' + elements.join('; ') + '}';
    }
}
/**
 * Represents an IDL Option
 * @param {Type} t
 */
class OptClass extends ConstructType {
    constructor(_type) {
        super();
        this._type = _type;
    }
    accept(v, d) {
        return v.visitOpt(this, this._type, d);
    }
    covariant(x) {
        return Array.isArray(x) && (x.length === 0 || (x.length === 1 && this._type.covariant(x[0])));
    }
    encodeValue(x) {
        if (x.length === 0) {
            return new Uint8Array([0]);
        }
        else {
            return concat(new Uint8Array([1]), this._type.encodeValue(x[0]));
        }
    }
    _buildTypeTableImpl(typeTable) {
        this._type.buildTypeTable(typeTable);
        const opCode = slebEncode(-18 /* Opt */);
        const buffer = this._type.encodeType(typeTable);
        typeTable.add(this, concat(opCode, buffer));
    }
    decodeValue(b, t) {
        const opt = this.checkType(t);
        if (!(opt instanceof OptClass)) {
            throw new Error('Not an option type');
        }
        switch (safeReadUint8(b)) {
            case 0:
                return [];
            case 1:
                return [this._type.decodeValue(b, opt._type)];
            default:
                throw new Error('Not an option value');
        }
    }
    get name() {
        return `opt ${this._type.name}`;
    }
    display() {
        return `opt ${this._type.display()}`;
    }
    valueToString(x) {
        if (x.length === 0) {
            return 'null';
        }
        else {
            return `opt ${this._type.valueToString(x[0])}`;
        }
    }
}
/**
 * Represents an IDL Record
 * @param {Object} [fields] - mapping of function name to Type
 */
class RecordClass extends ConstructType {
    constructor(fields = {}) {
        super();
        this._fields = Object.entries(fields).sort((a, b) => idlLabelToId(a[0]) - idlLabelToId(b[0]));
    }
    accept(v, d) {
        return v.visitRecord(this, this._fields, d);
    }
    tryAsTuple() {
        const res = [];
        for (let i = 0; i < this._fields.length; i++) {
            const [key, type] = this._fields[i];
            if (key !== `_${i}_`) {
                return null;
            }
            res.push(type);
        }
        return res;
    }
    covariant(x) {
        return (typeof x === 'object' &&
            this._fields.every(([k, t]) => {
                // eslint-disable-next-line
                if (!x.hasOwnProperty(k)) {
                    throw new Error(`Record is missing key "${k}".`);
                }
                return t.covariant(x[k]);
            }));
    }
    encodeValue(x) {
        const values = this._fields.map(([key]) => x[key]);
        const bufs = zipWith(this._fields, values, ([, c], d) => c.encodeValue(d));
        return concat(...bufs);
    }
    _buildTypeTableImpl(T) {
        this._fields.forEach(([_, value]) => value.buildTypeTable(T));
        const opCode = slebEncode(-20 /* Record */);
        const len = lebEncode(this._fields.length);
        const fields = this._fields.map(([key, value]) => concat(lebEncode(idlLabelToId(key)), value.encodeType(T)));
        T.add(this, concat(opCode, len, concat(...fields)));
    }
    decodeValue(b, t) {
        const record = this.checkType(t);
        if (!(record instanceof RecordClass)) {
            throw new Error('Not a record type');
        }
        const x = {};
        let idx = 0;
        for (const [hash, type] of record._fields) {
            if (idx >= this._fields.length || idlLabelToId(this._fields[idx][0]) !== idlLabelToId(hash)) {
                // skip field
                type.decodeValue(b, type);
                continue;
            }
            const [expectKey, expectType] = this._fields[idx];
            x[expectKey] = expectType.decodeValue(b, type);
            idx++;
        }
        if (idx < this._fields.length) {
            throw new Error('Cannot find field ' + this._fields[idx][0]);
        }
        return x;
    }
    get name() {
        const fields = this._fields.map(([key, value]) => key + ':' + value.name);
        return `record {${fields.join('; ')}}`;
    }
    display() {
        const fields = this._fields.map(([key, value]) => key + ':' + value.display());
        return `record {${fields.join('; ')}}`;
    }
    valueToString(x) {
        const values = this._fields.map(([key]) => x[key]);
        const fields = zipWith(this._fields, values, ([k, c], d) => k + '=' + c.valueToString(d));
        return `record {${fields.join('; ')}}`;
    }
}
/**
 * Represents Tuple, a syntactic sugar for Record.
 * @param {Type} components
 */
class TupleClass extends RecordClass {
    constructor(_components) {
        const x = {};
        _components.forEach((e, i) => (x['_' + i + '_'] = e));
        super(x);
        this._components = _components;
    }
    accept(v, d) {
        return v.visitTuple(this, this._components, d);
    }
    covariant(x) {
        // `>=` because tuples can be covariant when encoded.
        return (Array.isArray(x) &&
            x.length >= this._fields.length &&
            this._components.every((t, i) => t.covariant(x[i])));
    }
    encodeValue(x) {
        const bufs = zipWith(this._components, x, (c, d) => c.encodeValue(d));
        return concat(...bufs);
    }
    decodeValue(b, t) {
        const tuple = this.checkType(t);
        if (!(tuple instanceof TupleClass)) {
            throw new Error('not a tuple type');
        }
        if (tuple._components.length < this._components.length) {
            throw new Error('tuple mismatch');
        }
        const res = [];
        for (const [i, wireType] of tuple._components.entries()) {
            if (i >= this._components.length) {
                // skip value
                wireType.decodeValue(b, wireType);
            }
            else {
                res.push(this._components[i].decodeValue(b, wireType));
            }
        }
        return res;
    }
    display() {
        const fields = this._components.map(value => value.display());
        return `record {${fields.join('; ')}}`;
    }
    valueToString(values) {
        const fields = zipWith(this._components, values, (c, d) => c.valueToString(d));
        return `record {${fields.join('; ')}}`;
    }
}
/**
 * Represents an IDL Variant
 * @param {Object} [fields] - mapping of function name to Type
 */
class VariantClass extends ConstructType {
    constructor(fields = {}) {
        super();
        this._fields = Object.entries(fields).sort((a, b) => idlLabelToId(a[0]) - idlLabelToId(b[0]));
    }
    accept(v, d) {
        return v.visitVariant(this, this._fields, d);
    }
    covariant(x) {
        return (typeof x === 'object' &&
            Object.entries(x).length === 1 &&
            this._fields.every(([k, v]) => {
                // eslint-disable-next-line
                return !x.hasOwnProperty(k) || v.covariant(x[k]);
            }));
    }
    encodeValue(x) {
        for (let i = 0; i < this._fields.length; i++) {
            const [name, type] = this._fields[i];
            // eslint-disable-next-line
            if (x.hasOwnProperty(name)) {
                const idx = lebEncode(i);
                const buf = type.encodeValue(x[name]);
                return concat(idx, buf);
            }
        }
        throw Error('Variant has no data: ' + x);
    }
    _buildTypeTableImpl(typeTable) {
        this._fields.forEach(([, type]) => {
            type.buildTypeTable(typeTable);
        });
        const opCode = slebEncode(-21 /* Variant */);
        const len = lebEncode(this._fields.length);
        const fields = this._fields.map(([key, value]) => concat(lebEncode(idlLabelToId(key)), value.encodeType(typeTable)));
        typeTable.add(this, concat(opCode, len, ...fields));
    }
    decodeValue(b, t) {
        const variant = this.checkType(t);
        if (!(variant instanceof VariantClass)) {
            throw new Error('Not a variant type');
        }
        const idx = Number(lebDecode(b));
        if (idx >= variant._fields.length) {
            throw Error('Invalid variant index: ' + idx);
        }
        const [wireHash, wireType] = variant._fields[idx];
        for (const [key, expectType] of this._fields) {
            if (idlLabelToId(wireHash) === idlLabelToId(key)) {
                const value = expectType.decodeValue(b, wireType);
                return { [key]: value };
            }
        }
        throw new Error('Cannot find field hash ' + wireHash);
    }
    get name() {
        const fields = this._fields.map(([key, type]) => key + ':' + type.name);
        return `variant {${fields.join('; ')}}`;
    }
    display() {
        const fields = this._fields.map(([key, type]) => key + (type.name === 'null' ? '' : `:${type.display()}`));
        return `variant {${fields.join('; ')}}`;
    }
    valueToString(x) {
        for (const [name, type] of this._fields) {
            // eslint-disable-next-line
            if (x.hasOwnProperty(name)) {
                const value = type.valueToString(x[name]);
                if (value === 'null') {
                    return `variant {${name}}`;
                }
                else {
                    return `variant {${name}=${value}}`;
                }
            }
        }
        throw new Error('Variant has no data: ' + x);
    }
}
/**
 * Represents a reference to an IDL type, used for defining recursive data
 * types.
 */
class RecClass extends ConstructType {
    constructor() {
        super(...arguments);
        this._id = RecClass._counter++;
        this._type = undefined;
    }
    accept(v, d) {
        if (!this._type) {
            throw Error('Recursive type uninitialized.');
        }
        return v.visitRec(this, this._type, d);
    }
    fill(t) {
        this._type = t;
    }
    getType() {
        return this._type;
    }
    covariant(x) {
        return this._type ? this._type.covariant(x) : false;
    }
    encodeValue(x) {
        if (!this._type) {
            throw Error('Recursive type uninitialized.');
        }
        return this._type.encodeValue(x);
    }
    _buildTypeTableImpl(typeTable) {
        if (!this._type) {
            throw Error('Recursive type uninitialized.');
        }
        typeTable.add(this, new Uint8Array([]));
        this._type.buildTypeTable(typeTable);
        typeTable.merge(this, this._type.name);
    }
    decodeValue(b, t) {
        if (!this._type) {
            throw Error('Recursive type uninitialized.');
        }
        return this._type.decodeValue(b, t);
    }
    get name() {
        return `rec_${this._id}`;
    }
    display() {
        if (!this._type) {
            throw Error('Recursive type uninitialized.');
        }
        return `μ${this.name}.${this._type.name}`;
    }
    valueToString(x) {
        if (!this._type) {
            throw Error('Recursive type uninitialized.');
        }
        return this._type.valueToString(x);
    }
}
RecClass._counter = 0;
function decodePrincipalId(b) {
    const x = safeReadUint8(b);
    if (x !== 1) {
        throw new Error('Cannot decode principal');
    }
    const len = Number(lebDecode(b));
    return Principal$1.fromUint8Array(new Uint8Array(safeRead(b, len)));
}
/**
 * Represents an IDL principal reference
 */
class PrincipalClass extends PrimitiveType {
    accept(v, d) {
        return v.visitPrincipal(this, d);
    }
    covariant(x) {
        return x && x._isPrincipal;
    }
    encodeValue(x) {
        const buf = x.toUint8Array();
        const len = lebEncode(buf.byteLength);
        return concat(new Uint8Array([1]), len, buf);
    }
    encodeType() {
        return slebEncode(-24 /* Principal */);
    }
    decodeValue(b, t) {
        this.checkType(t);
        return decodePrincipalId(b);
    }
    get name() {
        return 'principal';
    }
    valueToString(x) {
        return `${this.name} "${x.toText()}"`;
    }
}
/**
 * Represents an IDL function reference.
 * @param argTypes Argument types.
 * @param retTypes Return types.
 * @param annotations Function annotations.
 */
class FuncClass extends ConstructType {
    constructor(argTypes, retTypes, annotations = []) {
        super();
        this.argTypes = argTypes;
        this.retTypes = retTypes;
        this.annotations = annotations;
    }
    static argsToString(types, v) {
        if (types.length !== v.length) {
            throw new Error('arity mismatch');
        }
        return '(' + types.map((t, i) => t.valueToString(v[i])).join(', ') + ')';
    }
    accept(v, d) {
        return v.visitFunc(this, d);
    }
    covariant(x) {
        return (Array.isArray(x) && x.length === 2 && x[0] && x[0]._isPrincipal && typeof x[1] === 'string');
    }
    encodeValue([principal, methodName]) {
        const buf = principal.toUint8Array();
        const len = lebEncode(buf.byteLength);
        const canister = concat(new Uint8Array([1]), len, buf);
        const method = new TextEncoder().encode(methodName);
        const methodLen = lebEncode(method.byteLength);
        return concat(new Uint8Array([1]), canister, methodLen, method);
    }
    _buildTypeTableImpl(T) {
        this.argTypes.forEach(arg => arg.buildTypeTable(T));
        this.retTypes.forEach(arg => arg.buildTypeTable(T));
        const opCode = slebEncode(-22 /* Func */);
        const argLen = lebEncode(this.argTypes.length);
        const args = concat(...this.argTypes.map(arg => arg.encodeType(T)));
        const retLen = lebEncode(this.retTypes.length);
        const rets = concat(...this.retTypes.map(arg => arg.encodeType(T)));
        const annLen = lebEncode(this.annotations.length);
        const anns = concat(...this.annotations.map(a => this.encodeAnnotation(a)));
        T.add(this, concat(opCode, argLen, args, retLen, rets, annLen, anns));
    }
    decodeValue(b) {
        const x = safeReadUint8(b);
        if (x !== 1) {
            throw new Error('Cannot decode function reference');
        }
        const canister = decodePrincipalId(b);
        const mLen = Number(lebDecode(b));
        const buf = safeRead(b, mLen);
        const decoder = new TextDecoder('utf8', { fatal: true });
        const method = decoder.decode(buf);
        return [canister, method];
    }
    get name() {
        const args = this.argTypes.map(arg => arg.name).join(', ');
        const rets = this.retTypes.map(arg => arg.name).join(', ');
        const annon = ' ' + this.annotations.join(' ');
        return `(${args}) -> (${rets})${annon}`;
    }
    valueToString([principal, str]) {
        return `func "${principal.toText()}".${str}`;
    }
    display() {
        const args = this.argTypes.map(arg => arg.display()).join(', ');
        const rets = this.retTypes.map(arg => arg.display()).join(', ');
        const annon = ' ' + this.annotations.join(' ');
        return `(${args}) → (${rets})${annon}`;
    }
    encodeAnnotation(ann) {
        if (ann === 'query') {
            return new Uint8Array([1]);
        }
        else if (ann === 'oneway') {
            return new Uint8Array([2]);
        }
        else {
            throw new Error('Illeagal function annotation');
        }
    }
}
class ServiceClass extends ConstructType {
    constructor(fields) {
        super();
        this._fields = Object.entries(fields).sort((a, b) => idlLabelToId(a[0]) - idlLabelToId(b[0]));
    }
    accept(v, d) {
        return v.visitService(this, d);
    }
    covariant(x) {
        return x && x._isPrincipal;
    }
    encodeValue(x) {
        const buf = x.toUint8Array();
        const len = lebEncode(buf.length);
        return concat(new Uint8Array([1]), len, buf);
    }
    _buildTypeTableImpl(T) {
        this._fields.forEach(([_, func]) => func.buildTypeTable(T));
        const opCode = slebEncode(-23 /* Service */);
        const len = lebEncode(this._fields.length);
        const meths = this._fields.map(([label, func]) => {
            const labelBuf = new TextEncoder().encode(label);
            const labelLen = lebEncode(labelBuf.length);
            return concat(labelLen, labelBuf, func.encodeType(T));
        });
        T.add(this, concat(opCode, len, ...meths));
    }
    decodeValue(b) {
        return decodePrincipalId(b);
    }
    get name() {
        const fields = this._fields.map(([key, value]) => key + ':' + value.name);
        return `service {${fields.join('; ')}}`;
    }
    valueToString(x) {
        return `service "${x.toText()}"`;
    }
}
/**
 *
 * @param x
 * @returns {string}
 */
function toReadableString(x) {
    return JSON.stringify(x, (_key, value) => typeof value === 'bigint' ? `BigInt(${value})` : value);
}
/**
 * Encode a array of values
 * @param argTypes
 * @param args
 * @returns {Buffer} serialised value
 */
function encode(argTypes, args) {
    if (args.length < argTypes.length) {
        throw Error('Wrong number of message arguments');
    }
    const typeTable = new TypeTable();
    argTypes.forEach(t => t.buildTypeTable(typeTable));
    const magic = new TextEncoder().encode(magicNumber);
    const table = typeTable.encode();
    const len = lebEncode(args.length);
    const typs = concat(...argTypes.map(t => t.encodeType(typeTable)));
    const vals = concat(...zipWith(argTypes, args, (t, x) => {
        if (!t.covariant(x)) {
            throw new Error(`Invalid ${t.display()} argument: ${toReadableString(x)}`);
        }
        return t.encodeValue(x);
    }));
    return concat(magic, table, len, typs, vals);
}
/**
 * Decode a binary value
 * @param retTypes - Types expected in the buffer.
 * @param bytes - hex-encoded string, or buffer.
 * @returns Value deserialised to JS type
 */
function decode(retTypes, bytes) {
    const b = new PipeArrayBuffer(bytes);
    if (bytes.byteLength < magicNumber.length) {
        throw new Error('Message length smaller than magic number');
    }
    const magicBuffer = safeRead(b, magicNumber.length);
    const magic = new TextDecoder().decode(magicBuffer);
    if (magic !== magicNumber) {
        throw new Error('Wrong magic number: ' + JSON.stringify(magic));
    }
    function readTypeTable(pipe) {
        const typeTable = [];
        const len = Number(lebDecode(pipe));
        for (let i = 0; i < len; i++) {
            const ty = Number(slebDecode(pipe));
            switch (ty) {
                case -18 /* Opt */:
                case -19 /* Vector */: {
                    const t = Number(slebDecode(pipe));
                    typeTable.push([ty, t]);
                    break;
                }
                case -20 /* Record */:
                case -21 /* Variant */: {
                    const fields = [];
                    let objectLength = Number(lebDecode(pipe));
                    let prevHash;
                    while (objectLength--) {
                        const hash = Number(lebDecode(pipe));
                        if (hash >= Math.pow(2, 32)) {
                            throw new Error('field id out of 32-bit range');
                        }
                        if (typeof prevHash === 'number' && prevHash >= hash) {
                            throw new Error('field id collision or not sorted');
                        }
                        prevHash = hash;
                        const t = Number(slebDecode(pipe));
                        fields.push([hash, t]);
                    }
                    typeTable.push([ty, fields]);
                    break;
                }
                case -22 /* Func */: {
                    for (let k = 0; k < 2; k++) {
                        let funcLength = Number(lebDecode(pipe));
                        while (funcLength--) {
                            slebDecode(pipe);
                        }
                    }
                    const annLen = Number(lebDecode(pipe));
                    safeRead(pipe, annLen);
                    typeTable.push([ty, undefined]);
                    break;
                }
                case -23 /* Service */: {
                    let servLength = Number(lebDecode(pipe));
                    while (servLength--) {
                        const l = Number(lebDecode(pipe));
                        safeRead(pipe, l);
                        slebDecode(pipe);
                    }
                    typeTable.push([ty, undefined]);
                    break;
                }
                default:
                    throw new Error('Illegal op_code: ' + ty);
            }
        }
        const rawList = [];
        const length = Number(lebDecode(pipe));
        for (let i = 0; i < length; i++) {
            rawList.push(Number(slebDecode(pipe)));
        }
        return [typeTable, rawList];
    }
    const [rawTable, rawTypes] = readTypeTable(b);
    if (rawTypes.length < retTypes.length) {
        throw new Error('Wrong number of return values');
    }
    const table = rawTable.map(_ => Rec());
    function getType(t) {
        if (t < -24) {
            throw new Error('future value not supported');
        }
        if (t < 0) {
            switch (t) {
                case -1:
                    return Null;
                case -2:
                    return Bool;
                case -3:
                    return Nat;
                case -4:
                    return Int;
                case -5:
                    return Nat8;
                case -6:
                    return Nat16;
                case -7:
                    return Nat32;
                case -8:
                    return Nat64;
                case -9:
                    return Int8;
                case -10:
                    return Int16;
                case -11:
                    return Int32;
                case -12:
                    return Int64;
                case -13:
                    return Float32;
                case -14:
                    return Float64;
                case -15:
                    return Text;
                case -16:
                    return Reserved;
                case -17:
                    return Empty;
                case -24:
                    return Principal;
                default:
                    throw new Error('Illegal op_code: ' + t);
            }
        }
        if (t >= rawTable.length) {
            throw new Error('type index out of range');
        }
        return table[t];
    }
    function buildType(entry) {
        switch (entry[0]) {
            case -19 /* Vector */: {
                const ty = getType(entry[1]);
                return Vec(ty);
            }
            case -18 /* Opt */: {
                const ty = getType(entry[1]);
                return Opt(ty);
            }
            case -20 /* Record */: {
                const fields = {};
                for (const [hash, ty] of entry[1]) {
                    const name = `_${hash}_`;
                    fields[name] = getType(ty);
                }
                const record = Record(fields);
                const tuple = record.tryAsTuple();
                if (Array.isArray(tuple)) {
                    return Tuple(...tuple);
                }
                else {
                    return record;
                }
            }
            case -21 /* Variant */: {
                const fields = {};
                for (const [hash, ty] of entry[1]) {
                    const name = `_${hash}_`;
                    fields[name] = getType(ty);
                }
                return Variant(fields);
            }
            case -22 /* Func */: {
                return Func([], [], []);
            }
            case -23 /* Service */: {
                return Service({});
            }
            default:
                throw new Error('Illegal op_code: ' + entry[0]);
        }
    }
    rawTable.forEach((entry, i) => {
        const t = buildType(entry);
        table[i].fill(t);
    });
    const types = rawTypes.map(t => getType(t));
    const output = retTypes.map((t, i) => {
        return t.decodeValue(b, types[i]);
    });
    // skip unused values
    for (let ind = retTypes.length; ind < types.length; ind++) {
        types[ind].decodeValue(b, types[ind]);
    }
    if (b.byteLength > 0) {
        throw new Error('decode: Left-over bytes');
    }
    return output;
}
// Export Types instances.
const Empty = new EmptyClass();
const Reserved = new ReservedClass();
const Bool = new BoolClass();
const Null = new NullClass();
const Text = new TextClass();
const Int = new IntClass();
const Nat = new NatClass();
const Float32 = new FloatClass(32);
const Float64 = new FloatClass(64);
const Int8 = new FixedIntClass(8);
const Int16 = new FixedIntClass(16);
const Int32 = new FixedIntClass(32);
const Int64 = new FixedIntClass(64);
const Nat8 = new FixedNatClass(8);
const Nat16 = new FixedNatClass(16);
const Nat32 = new FixedNatClass(32);
const Nat64 = new FixedNatClass(64);
const Principal = new PrincipalClass();
/**
 *
 * @param types array of any types
 * @returns TupleClass from those types
 */
function Tuple(...types) {
    return new TupleClass(types);
}
/**
 *
 * @param t IDL Type
 * @returns VecClass from that type
 */
function Vec(t) {
    return new VecClass(t);
}
/**
 *
 * @param t IDL Type
 * @returns OptClass of Type
 */
function Opt(t) {
    return new OptClass(t);
}
/**
 *
 * @param t Record of string and IDL Type
 * @returns RecordClass of string and Type
 */
function Record(t) {
    return new RecordClass(t);
}
/**
 *
 * @param fields Record of string and IDL Type
 * @returns VariantClass
 */
function Variant(fields) {
    return new VariantClass(fields);
}
/**
 *
 * @returns new RecClass
 */
function Rec() {
    return new RecClass();
}
/**
 *
 * @param args array of IDL Types
 * @param ret array of IDL Types
 * @param annotations array of strings, [] by default
 * @returns new FuncClass
 */
function Func(args, ret, annotations = []) {
    return new FuncClass(args, ret, annotations);
}
/**
 *
 * @param t Record of string and FuncClass
 * @returns ServiceClass
 */
function Service(t) {
    return new ServiceClass(t);
}

var IDL = /*#__PURE__*/Object.freeze({
    __proto__: null,
    Visitor: Visitor,
    Type: Type,
    PrimitiveType: PrimitiveType,
    ConstructType: ConstructType,
    EmptyClass: EmptyClass,
    BoolClass: BoolClass,
    NullClass: NullClass,
    ReservedClass: ReservedClass,
    TextClass: TextClass,
    IntClass: IntClass,
    NatClass: NatClass,
    FloatClass: FloatClass,
    FixedIntClass: FixedIntClass,
    FixedNatClass: FixedNatClass,
    VecClass: VecClass,
    OptClass: OptClass,
    RecordClass: RecordClass,
    TupleClass: TupleClass,
    VariantClass: VariantClass,
    RecClass: RecClass,
    PrincipalClass: PrincipalClass,
    FuncClass: FuncClass,
    ServiceClass: ServiceClass,
    encode: encode,
    decode: decode,
    Empty: Empty,
    Reserved: Reserved,
    Bool: Bool,
    Null: Null,
    Text: Text,
    Int: Int,
    Nat: Nat,
    Float32: Float32,
    Float64: Float64,
    Int8: Int8,
    Int16: Int16,
    Int32: Int32,
    Int64: Int64,
    Nat8: Nat8,
    Nat16: Nat16,
    Nat32: Nat32,
    Nat64: Nat64,
    Principal: Principal,
    Tuple: Tuple,
    Vec: Vec,
    Opt: Opt,
    Record: Record,
    Variant: Variant,
    Rec: Rec,
    Func: Func,
    Service: Service
});

export { IDL as I, decode as d, encode as e, lebEncode as l };
