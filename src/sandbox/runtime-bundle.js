"use strict";
var abaplintRuntime = (() => {
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __commonJS = (cb, mod) => function __require() {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  };

  // node_modules/@abaplint/runtime/build/src/context.js
  var require_context = __commonJS({
    "node_modules/@abaplint/runtime/build/src/context.js"(exports2) {
      "use strict";
      Object.defineProperty(exports2, "__esModule", { value: true });
      exports2.Context = void 0;
      var Context = class {
        console;
        cursorCounter = 0;
        cursors = {};
        // DEFAULT and secondary database connections
        databaseConnections = {};
        RFCDestinations = {};
        defaultDB() {
          if (this.databaseConnections["DEFAULT"] === void 0) {
            throw new Error("Runtime, database not initialized");
          }
          return this.databaseConnections["DEFAULT"];
        }
      };
      exports2.Context = Context;
    }
  });

  // node_modules/@abaplint/runtime/build/src/throw_error.js
  var require_throw_error = __commonJS({
    "node_modules/@abaplint/runtime/build/src/throw_error.js"(exports2) {
      "use strict";
      Object.defineProperty(exports2, "__esModule", { value: true });
      exports2.throwErrorWithParameters = throwErrorWithParameters;
      exports2.throwError = throwError;
      async function throwErrorWithParameters(name, parameters) {
        if (abap.Classes[name] !== void 0) {
          throw await new abap.Classes[name]().constructor_(parameters);
        } else {
          throw new Error(`Global class ${name} not found`);
        }
      }
      function throwError(name) {
        if (abap.Classes[name] !== void 0) {
          throw new abap.Classes[name]();
        } else {
          throw new Error(`Global class ${name} not found`);
        }
      }
    }
  });

  // node_modules/@abaplint/runtime/build/src/types/structure.js
  var require_structure = __commonJS({
    "node_modules/@abaplint/runtime/build/src/types/structure.js"(exports2) {
      "use strict";
      Object.defineProperty(exports2, "__esModule", { value: true });
      exports2.Structure = void 0;
      var field_symbol_1 = require_field_symbol();
      var table_1 = require_table();
      var _parse_1 = require_parse();
      var character_1 = require_character();
      var throw_error_1 = require_throw_error();
      var abap_object_1 = require_abap_object();
      var Structure = class _Structure {
        value;
        qualifiedName;
        ddicName;
        suffix;
        asInclude;
        constructor(fields, qualifiedName, ddicName, suffix, asInclude) {
          this.value = fields;
          this.qualifiedName = qualifiedName?.toUpperCase();
          this.ddicName = ddicName?.toUpperCase();
          this.suffix = suffix;
          this.asInclude = asInclude;
          this.linkGroupFields();
        }
        linkGroupFields() {
          for (const as of Object.keys(this.asInclude || {})) {
            const suffix = this.suffix?.[as] || "";
            for (const fieldName of Object.keys(this.value[as].get())) {
              this.value[fieldName + suffix] = this.value[as].get()[fieldName];
            }
          }
        }
        clone() {
          const newValues = {};
          for (const key in this.value) {
            newValues[key] = this.value[key].clone();
          }
          const n = new _Structure(newValues, this.qualifiedName, this.ddicName, this.suffix, this.asInclude);
          return n;
        }
        clear() {
          for (const f in this.value) {
            this.value[f].clear();
          }
          return this;
        }
        getDDICName() {
          return this.ddicName;
        }
        getRenamingSuffix() {
          return this.suffix;
        }
        getAsInclude() {
          return this.asInclude;
        }
        getQualifiedName() {
          return this.qualifiedName;
        }
        setField(name, value) {
          if (name.includes("->") || name.includes("=>")) {
            throw new Error("transpiler, structure setField todo, " + name);
          }
          if (name.includes("-")) {
            const [base, field] = name.split("-");
            if (field.includes("-")) {
              throw new Error("transpiler, structure setField todo");
            }
            this.value[base].setField(field, value);
          } else {
            if (this.value[name] === void 0) {
              throw new Error("Structure, setField, field not found: " + name);
            }
            this.value[name].set(value);
          }
          return this;
        }
        set(input) {
          if (input === void 0) {
            return;
          }
          if (input instanceof field_symbol_1.FieldSymbol) {
            this.set(input.getPointer());
          } else if (input instanceof table_1.Table) {
            throw new Error("Structure, input is a table");
          } else if (input instanceof _Structure) {
            const obj = input.get();
            const keys1 = Object.keys(obj);
            const keys2 = Object.keys(this.value);
            for (let i2 = 0; i2 < keys1.length; i2++) {
              const key1 = keys1[i2];
              const key2 = keys2[i2];
              if (this.value[key2] === void 0) {
                break;
              }
              this.value[key2].set(obj[key1].clone());
            }
          } else {
            this.setCharacter(input);
          }
          return this;
        }
        setCharacter(input) {
          this.clear();
          let val = input;
          if (typeof val !== "string") {
            val = val.get() + "";
          }
          for (const key of Object.keys(this.value)) {
            const targetLength = this.value[key].getLength();
            this.value[key].set(val.substr(0, targetLength));
            val = val.substr(targetLength);
          }
        }
        get() {
          return this.value;
        }
        getCharacter(allowObject = false) {
          let val = "";
          for (const v in this.value) {
            const foo = this.value[v];
            if (foo instanceof _Structure) {
              val += foo.getCharacter(allowObject);
            } else if (foo instanceof abap_object_1.ABAPObject) {
              if (allowObject === false) {
                throw new Error("Structure getCharacter: unexpected ABAPObject");
              }
              val += foo.getInternalID();
            } else {
              val += foo.get();
            }
          }
          return val;
        }
        getOffset(input) {
          let offset = input?.offset;
          if (offset) {
            offset = (0, _parse_1.parse)(offset);
          }
          let length = input?.length;
          if (length) {
            length = (0, _parse_1.parse)(length);
          }
          const val = this.getCharacter();
          if (offset && offset >= val.length || offset && offset < 0 || length && length < 0) {
            (0, throw_error_1.throwError)("CX_SY_RANGE_OUT_OF_BOUNDS");
          }
          let ret = val;
          if (offset) {
            ret = ret.substr(offset);
          }
          if (length !== void 0) {
            ret = ret.substr(0, length);
          }
          const r = new character_1.Character(ret.length);
          r.set(ret);
          return r;
        }
      };
      exports2.Structure = Structure;
    }
  });

  // node_modules/@abaplint/runtime/build/src/types/character.js
  var require_character = __commonJS({
    "node_modules/@abaplint/runtime/build/src/types/character.js"(exports2) {
      "use strict";
      Object.defineProperty(exports2, "__esModule", { value: true });
      exports2.Character = void 0;
      var _parse_1 = require_parse();
      var throw_error_1 = require_throw_error();
      var field_symbol_1 = require_field_symbol();
      var structure_1 = require_structure();
      var integer_1 = require_integer();
      var TRIMREGEX = / *$/;
      var initialValues = {};
      var Character = class _Character {
        value;
        constant = false;
        length;
        extra;
        constructor(length, extra) {
          this.length = length || 1;
          if (typeof this.length === "object") {
            throw "Character, invalid length, object: " + JSON.stringify(this.length);
          } else if (this.length <= 0) {
            throw "Character, invalid length, less than zero";
          }
          this.extra = extra;
          this.clear();
        }
        clone() {
          const n = new _Character(this.length, this.extra);
          n.value = this.value;
          return n;
        }
        setConstant() {
          this.constant = true;
          return this;
        }
        set(value) {
          if (this.constant === true) {
            throw new Error("Changing constant");
          }
          if (typeof value === "string") {
            this.value = value;
          } else if (typeof value === "number") {
            this.value = value + "";
          } else if (value instanceof field_symbol_1.FieldSymbol) {
            if (value.getPointer() === void 0) {
              throw new Error("GETWA_NOT_ASSIGNED");
            }
            this.set(value.getPointer());
            return this;
          } else if (value instanceof structure_1.Structure) {
            this.set(value.getCharacter());
            return this;
          } else if (value instanceof integer_1.Integer) {
            this.value = Math.abs(value.get()) + (value.get() < 0 ? "-" : " ");
            this.value = this.value.padStart(this.length, " ");
          } else {
            this.value = value.get() + "";
          }
          if (this.value.length > this.length) {
            this.value = this.value.substr(0, this.length);
          } else if (this.value.length < this.length) {
            this.value = this.value.padEnd(this.length, " ");
          }
          return this;
        }
        getQualifiedName() {
          return this.extra?.qualifiedName;
        }
        getConversionExit() {
          return this.extra?.conversionExit;
        }
        getDDICName() {
          return this.extra?.ddicName;
        }
        getLength() {
          return this.length;
        }
        clear() {
          if (initialValues[this.length] === void 0) {
            initialValues[this.length] = " ".repeat(this.length);
          }
          this.value = initialValues[this.length];
        }
        get() {
          return this.value;
        }
        getTrimEnd() {
          if (this.value.endsWith(" ") === true) {
            return this.value.replace(TRIMREGEX, "");
          } else {
            return this.value;
          }
        }
        getOffset(input) {
          let offset = input?.offset;
          if (offset) {
            offset = (0, _parse_1.parse)(offset);
          }
          let length = input?.length;
          if (length) {
            length = (0, _parse_1.parse)(length);
          }
          if (offset && offset >= this.length || length && length > this.length || offset && length && offset + length > this.length || offset && offset < 0 || length && length < 0) {
            (0, throw_error_1.throwError)("CX_SY_RANGE_OUT_OF_BOUNDS");
          }
          let ret = this.value;
          if (offset) {
            ret = ret.substr(offset);
          }
          if (length !== void 0) {
            ret = ret.substr(0, length);
          }
          const r = new _Character(ret.length);
          r.set(ret);
          return r;
        }
      };
      exports2.Character = Character;
    }
  });

  // node_modules/@abaplint/runtime/build/src/statements/get_bit.js
  var require_get_bit = __commonJS({
    "node_modules/@abaplint/runtime/build/src/statements/get_bit.js"(exports2) {
      "use strict";
      Object.defineProperty(exports2, "__esModule", { value: true });
      exports2.getBit = getBit;
      var types_12 = require_types();
      function getBit(number, hex, output) {
        const byteIndex = Math.floor((number.get() - 1) / 8);
        const bitIndex = (number.get() - 1) % 8;
        if (hex instanceof types_12.HexUInt8) {
          let int = hex.getOffsetRaw(byteIndex);
          int >>= 8 - bitIndex - 1;
          int &= 1;
          output.set(int);
        } else {
          if (bitIndex < 0) {
            throw new Error("BIT_OFFSET_NOT_POSITIVE");
          }
          const h = hex.get().substr(byteIndex * 2, 2);
          const parsed = parseInt(h, 16).toString(2);
          const bits = parsed.padStart(8, "0");
          output.set(bits.substr(bitIndex, 1));
        }
      }
    }
  });

  // node_modules/@abaplint/runtime/build/src/types/hex_uint8.js
  var require_hex_uint8 = __commonJS({
    "node_modules/@abaplint/runtime/build/src/types/hex_uint8.js"(exports2) {
      "use strict";
      Object.defineProperty(exports2, "__esModule", { value: true });
      exports2.HexUInt8 = void 0;
      var _parse_1 = require_parse();
      var float_1 = require_float();
      var xstring_1 = require_xstring();
      var throw_error_1 = require_throw_error();
      var integer8_1 = require_integer8();
      var REGEXP = /^(?![A-F0-9])/;
      var LUT_HEX_4b = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "A", "B", "C", "D", "E", "F"];
      var LUT_HEX_8b = new Array(256);
      for (let n = 0; n < 256; n++) {
        LUT_HEX_8b[n] = `${LUT_HEX_4b[n >>> 4 & 15]}${LUT_HEX_4b[n & 15]}`;
      }
      var HexUInt8 = class _HexUInt8 {
        value;
        length;
        qualifiedName;
        constructor(input) {
          this.length = input?.length ? input?.length : 1;
          this.qualifiedName = input?.qualifiedName;
          this.value = new Uint8Array(this.length);
        }
        getQualifiedName() {
          return this.qualifiedName;
        }
        clone() {
          const n = new _HexUInt8({ length: this.length, qualifiedName: this.qualifiedName });
          n.value = this.value.slice(0);
          return n;
        }
        setOffset(offset, value) {
          this.value[offset] = value;
        }
        getOffsetRaw(offset) {
          return this.value[offset];
        }
        set(value) {
          let hexString = "";
          if (typeof value === "string") {
            hexString = value;
            if (hexString.length < this.length * 2) {
              hexString = hexString.padEnd(this.length * 2, "0");
            }
          } else if (typeof value === "number") {
            const maxVal = Math.pow(2, this.length * 8);
            if (value < 0) {
              hexString = Math.round(value + 4294967296).toString(16).toUpperCase();
            } else if (value >= maxVal) {
              const sub = value % maxVal;
              hexString = Math.round(sub).toString(16).toUpperCase();
            } else {
              hexString = Math.round(value).toString(16).toUpperCase();
            }
            if (hexString.length > this.length * 2) {
              hexString = hexString.substring(hexString.length - this.length * 2);
            } else if (hexString.length < this.length * 2) {
              hexString = hexString.padStart(this.length * 2, "0");
            }
          } else if (value instanceof integer8_1.Integer8) {
            if (value.get() < 0) {
              hexString = (value.get() + 0x10000000000000000n).toString(16).toUpperCase();
            } else {
              hexString = value.get().toString(16).toUpperCase();
            }
            if (hexString.length > this.length * 2) {
              hexString = hexString.substring(hexString.length - this.length * 2);
            } else if (hexString.length < this.length * 2) {
              hexString = hexString.padStart(this.length * 2, "0");
            }
          } else if (value instanceof _HexUInt8 || value instanceof xstring_1.XString) {
            hexString = value.get();
            if (hexString.length < this.length * 2) {
              hexString = hexString.padEnd(this.length * 2, "0");
            }
          } else {
            const v = value.get();
            if (value instanceof float_1.Float) {
              return this.set(value.getRaw());
            } else if (typeof v === "number") {
              return this.set(v);
            } else {
              hexString = v;
              if (hexString.match(REGEXP)) {
                hexString = "";
              }
              if (hexString.length < this.length * 2) {
                hexString = hexString.padEnd(this.length * 2, "0");
              }
            }
          }
          if (hexString.length > this.length * 2) {
            hexString = hexString.substring(0, this.length * 2);
          }
          this.value = Uint8Array.from(Buffer.from(hexString, "hex"));
          return this;
        }
        getLength() {
          return this.length;
        }
        clear() {
          for (let i2 = 0; i2 < this.value.length; i2++) {
            this.value[i2] = 0;
          }
        }
        get() {
          let out = "";
          for (let idx = 0; idx < this.value.length; idx++) {
            out += LUT_HEX_8b[this.value[idx]];
          }
          return out;
        }
        getOffset(input) {
          let offset = input?.offset;
          if (offset) {
            if (offset instanceof integer8_1.Integer8) {
              offset = Number(offset.get());
            } else {
              offset = (0, _parse_1.parse)(offset);
            }
            if (offset > this.length || offset < 0) {
              (0, throw_error_1.throwError)("CX_SY_RANGE_OUT_OF_BOUNDS");
            }
          } else {
            offset = 0;
          }
          let length = input?.length;
          if (length) {
            if (length instanceof integer8_1.Integer8) {
              length = Number(length.get());
            } else {
              length = (0, _parse_1.parse)(length);
            }
            if (length > this.length || length < 0) {
              (0, throw_error_1.throwError)("CX_SY_RANGE_OUT_OF_BOUNDS");
            }
          }
          if (offset !== void 0 && length !== void 0) {
            if (offset + length > this.length) {
              (0, throw_error_1.throwError)("CX_SY_RANGE_OUT_OF_BOUNDS");
            }
          }
          let str = "";
          const until = length ? offset + length : this.value.length;
          for (let idx = offset; idx < until; idx++) {
            str += LUT_HEX_8b[this.value[idx]];
          }
          return new xstring_1.XString().set(str);
        }
      };
      exports2.HexUInt8 = HexUInt8;
    }
  });

  // node_modules/@abaplint/runtime/build/src/types/integer8.js
  var require_integer8 = __commonJS({
    "node_modules/@abaplint/runtime/build/src/types/integer8.js"(exports2) {
      "use strict";
      Object.defineProperty(exports2, "__esModule", { value: true });
      exports2.Integer8 = void 0;
      var throw_error_1 = require_throw_error();
      var float_1 = require_float();
      var hex_1 = require_hex();
      var xstring_1 = require_xstring();
      var integer_1 = require_integer();
      var get_bit_1 = require_get_bit();
      var character_1 = require_character();
      var hex_uint8_1 = require_hex_uint8();
      var digits = new RegExp(/^\s*-?\+?\d+\.?\d* *$/i);
      var Integer8 = class _Integer8 {
        value;
        qualifiedName;
        constructor(input) {
          this.value = 0n;
          this.qualifiedName = input?.qualifiedName;
        }
        clone() {
          const n = new _Integer8({ qualifiedName: this.qualifiedName });
          n.value = this.value;
          return n;
        }
        getQualifiedName() {
          return this.qualifiedName;
        }
        set(value) {
          if (typeof value === "number") {
            this.value = BigInt(value);
          } else if (typeof value === "bigint") {
            this.value = value;
          } else if (typeof value === "string") {
            if (value.endsWith("-")) {
              value = "-" + value.substring(0, value.length - 1);
            }
            if (value.trim().length === 0) {
              value = "0";
            } else if (digits.test(value) === false) {
              (0, throw_error_1.throwError)("CX_SY_CONVERSION_NO_NUMBER");
            }
            this.value = BigInt(value);
          } else if (value instanceof float_1.Float) {
            this.set(Math.round(value.getRaw()));
          } else if (value instanceof hex_1.Hex || value instanceof xstring_1.XString || value instanceof hex_uint8_1.HexUInt8) {
            if (value.get().length === 16) {
              const lv_bit = new character_1.Character();
              (0, get_bit_1.getBit)(new integer_1.Integer().set(1), value, lv_bit);
              if (lv_bit.get() === "1") {
                const val = BigInt("0x" + value.get());
                this.value = val - BigInt("0x10000000000000000");
              } else {
                this.value = BigInt("0x" + value.get());
              }
            } else {
              this.value = BigInt("0x" + value.get());
            }
          } else {
            this.set(value.get());
          }
          return this;
        }
        clear() {
          this.value = 0n;
        }
        get() {
          return this.value;
        }
      };
      exports2.Integer8 = Integer8;
    }
  });

  // node_modules/@abaplint/runtime/build/src/types/xstring.js
  var require_xstring = __commonJS({
    "node_modules/@abaplint/runtime/build/src/types/xstring.js"(exports2) {
      "use strict";
      Object.defineProperty(exports2, "__esModule", { value: true });
      exports2.XString = void 0;
      var _parse_1 = require_parse();
      var float_1 = require_float();
      var character_1 = require_character();
      var throw_error_1 = require_throw_error();
      var integer8_1 = require_integer8();
      var XString = class _XString {
        value;
        qualifiedName;
        constructor(input) {
          this.value = "";
          this.qualifiedName = input?.qualifiedName;
        }
        clone() {
          const n = new _XString({ qualifiedName: this.qualifiedName });
          n.value = this.value;
          return n;
        }
        getQualifiedName() {
          return this.qualifiedName;
        }
        set(value) {
          if (typeof value === "string") {
            this.value = value;
            if (this.value.length % 2 === 1) {
              this.value = this.value + "0";
            }
          } else if (typeof value === "number") {
            this.value = Math.round(value).toString(16).toUpperCase();
            if (this.value.length % 2 === 1) {
              this.value = "0" + this.value;
            }
          } else {
            let v = value.get();
            if (value instanceof float_1.Float) {
              v = value.getRaw();
              this.set(v);
            } else if (value instanceof character_1.Character) {
              this.set(value.getTrimEnd());
            } else if (typeof v === "number") {
              this.value = v.toString(16).toUpperCase();
              if (this.value.length % 2 === 1) {
                this.value = "0" + this.value;
              }
            } else {
              this.set(v);
            }
          }
          return this;
        }
        clear() {
          this.value = "";
        }
        get() {
          return this.value;
        }
        getOffset(input) {
          let offset = input?.offset;
          if (offset) {
            if (offset instanceof integer8_1.Integer8) {
              offset = Number(offset.get());
            } else {
              offset = (0, _parse_1.parse)(offset);
            }
            if (offset * 2 > this.value.length || offset < 0) {
              (0, throw_error_1.throwError)("CX_SY_RANGE_OUT_OF_BOUNDS");
            }
          }
          let length = input?.length;
          if (length) {
            if (length instanceof integer8_1.Integer8) {
              length = Number(length.get());
            } else {
              length = (0, _parse_1.parse)(length);
            }
            if (length * 2 > this.value.length || length < 0) {
              (0, throw_error_1.throwError)("CX_SY_RANGE_OUT_OF_BOUNDS");
            }
          }
          if (offset !== void 0 && length !== void 0) {
            if (offset * 2 + length * 2 > this.value.length) {
              (0, throw_error_1.throwError)("CX_SY_RANGE_OUT_OF_BOUNDS");
            }
            return new _XString().set(this.value.substr(offset * 2, length * 2));
          } else if (offset !== void 0) {
            return new _XString().set(this.value.substr(offset * 2));
          } else if (length !== void 0) {
            return new _XString().set(this.value.substr(0, length * 2));
          } else {
            throw new Error("xstring: getOffset, unexpected");
          }
        }
      };
      exports2.XString = XString;
    }
  });

  // node_modules/@abaplint/runtime/build/src/operators/_parse.js
  var require_parse = __commonJS({
    "node_modules/@abaplint/runtime/build/src/operators/_parse.js"(exports2) {
      "use strict";
      Object.defineProperty(exports2, "__esModule", { value: true });
      exports2.parse = parse;
      var types_12 = require_types();
      var xstring_1 = require_xstring();
      function parse(val) {
        if (typeof val === "number") {
          return val;
        } else if (typeof val === "string") {
          if (val.includes(".")) {
            return parseFloat(val);
          } else {
            return parseInt(val, 10);
          }
        } else if (val instanceof types_12.Integer) {
          return val.get();
        } else if (val instanceof types_12.Float) {
          return val.getRaw();
        } else if (val instanceof xstring_1.XString) {
          if (val.get() === "") {
            return 0;
          }
          return parseInt(val.get(), 16);
        } else if (val instanceof types_12.Hex || val instanceof types_12.HexUInt8) {
          let num = parseInt(val.get(), 16);
          if (val.getLength() >= 4) {
            const maxVal = Math.pow(2, val.get().length / 2 * 8);
            if (num > maxVal / 2 - 1) {
              num = num - maxVal;
            }
          }
          return num;
        } else if (val instanceof types_12.Time || val instanceof types_12.Date) {
          return val.getNumeric();
        } else if (val instanceof types_12.DecFloat34) {
          return val.getRaw();
        } else if (val instanceof types_12.Integer8) {
          const bigint = val.get();
          if (bigint > BigInt(Number.MAX_SAFE_INTEGER) || bigint < BigInt(Number.MIN_SAFE_INTEGER)) {
            throw new Error("int8 value too large for table expression index");
          }
          return Number(bigint);
        } else {
          return parse(val.get());
        }
      }
    }
  });

  // node_modules/@abaplint/runtime/build/src/types/hex.js
  var require_hex = __commonJS({
    "node_modules/@abaplint/runtime/build/src/types/hex.js"(exports2) {
      "use strict";
      Object.defineProperty(exports2, "__esModule", { value: true });
      exports2.Hex = void 0;
      var _parse_1 = require_parse();
      var float_1 = require_float();
      var xstring_1 = require_xstring();
      var throw_error_1 = require_throw_error();
      var integer8_1 = require_integer8();
      var REGEXP = /^(?![A-F0-9])/;
      var Hex = class _Hex {
        value;
        length;
        qualifiedName;
        constructor(input) {
          this.length = input?.length ? input?.length : 1;
          this.qualifiedName = input?.qualifiedName;
          this.clear();
        }
        clone() {
          const n = new _Hex({ length: this.length, qualifiedName: this.qualifiedName });
          n.value = this.value;
          return n;
        }
        getQualifiedName() {
          return this.qualifiedName;
        }
        set(value) {
          const doubleLength = this.length * 2;
          if (typeof value === "string") {
            this.value = value;
          } else if (typeof value === "number") {
            const maxVal = Math.pow(2, this.length * 8);
            if (value < 0) {
              let hex = Math.round(value + 4294967296).toString(16).toUpperCase();
              if (hex.length > doubleLength) {
                hex = hex.substring(hex.length - doubleLength);
              }
              this.value = hex;
            } else if (value >= maxVal) {
              const sub = value % maxVal;
              this.value = Math.round(sub).toString(16).toUpperCase();
            } else {
              this.value = Math.round(value).toString(16).toUpperCase();
            }
            this.value = this.value.padStart(doubleLength, "0");
          } else if (value instanceof integer8_1.Integer8) {
            let hex = "";
            if (value.get() < 0) {
              hex = (value.get() + 0x10000000000000000n).toString(16).toUpperCase();
              if (hex.length > doubleLength) {
                hex = hex.substring(hex.length - doubleLength);
              }
            } else {
              hex = value.get().toString(16).toUpperCase();
              hex = hex.padStart(doubleLength, "0");
            }
            return this.set(hex);
          } else if (value instanceof _Hex || value instanceof xstring_1.XString) {
            this.value = value.get();
          } else {
            const v = value.get();
            if (value instanceof float_1.Float) {
              return this.set(value.getRaw());
            } else if (typeof v === "number") {
              return this.set(v);
            } else {
              this.value = v;
              if (this.value.match(REGEXP)) {
                this.value = "";
              }
            }
          }
          if (this.value.length > doubleLength) {
            this.value = this.value.substr(0, doubleLength);
          } else if (this.value.length < doubleLength) {
            this.value = this.value.padEnd(doubleLength, "0");
          }
          return this;
        }
        getLength() {
          return this.length;
        }
        clear() {
          this.value = "0".repeat(this.length * 2);
        }
        get() {
          return this.value;
        }
        getOffset(input) {
          let offset = input?.offset;
          if (offset) {
            if (offset instanceof integer8_1.Integer8) {
              offset = Number(offset.get());
            } else {
              offset = (0, _parse_1.parse)(offset);
            }
            if (offset * 2 > this.value.length || offset < 0) {
              (0, throw_error_1.throwError)("CX_SY_RANGE_OUT_OF_BOUNDS");
            }
          }
          let length = input?.length;
          if (length) {
            if (length instanceof integer8_1.Integer8) {
              length = Number(length.get());
            } else {
              length = (0, _parse_1.parse)(length);
            }
            if (length * 2 > this.value.length || length < 0) {
              (0, throw_error_1.throwError)("CX_SY_RANGE_OUT_OF_BOUNDS");
            }
          }
          if (offset !== void 0 && length !== void 0) {
            if (offset * 2 + length * 2 > this.value.length) {
              (0, throw_error_1.throwError)("CX_SY_RANGE_OUT_OF_BOUNDS");
            }
            return new xstring_1.XString().set(this.value.substr(offset * 2, length * 2));
          } else if (offset !== void 0) {
            return new xstring_1.XString().set(this.value.substr(offset * 2));
          } else if (length !== void 0) {
            return new xstring_1.XString().set(this.value.substr(0, length * 2));
          } else {
            throw new Error("hex: getOffset, unexpected");
          }
        }
      };
      exports2.Hex = Hex;
    }
  });

  // node_modules/@abaplint/runtime/build/src/types/float.js
  var require_float = __commonJS({
    "node_modules/@abaplint/runtime/build/src/types/float.js"(exports2) {
      "use strict";
      Object.defineProperty(exports2, "__esModule", { value: true });
      exports2.Float = void 0;
      var hex_1 = require_hex();
      var xstring_1 = require_xstring();
      var integer8_1 = require_integer8();
      var Float = class _Float {
        value;
        qualifiedName;
        constructor(input) {
          this.value = 0;
          this.qualifiedName = input?.qualifiedName;
        }
        clone() {
          const n = new _Float({ qualifiedName: this.qualifiedName });
          n.value = this.value;
          return n;
        }
        getQualifiedName() {
          return this.qualifiedName;
        }
        set(value) {
          if (typeof value === "number") {
            this.value = value;
          } else if (typeof value === "string" && value.trim().length === 0) {
            this.value = 0;
          } else if (typeof value === "string") {
            this.value = parseFloat(value);
          } else if (value instanceof integer8_1.Integer8) {
            this.value = Number(value.get());
          } else if (value instanceof _Float) {
            this.value = value.getRaw();
          } else if (value instanceof hex_1.Hex || value instanceof xstring_1.XString) {
            this.set(parseInt(value.get(), 16));
          } else {
            this.set(value.get());
          }
          return this;
        }
        clear() {
          this.value = 0;
        }
        getRaw() {
          return this.value;
        }
        get() {
          let text2 = new Number(this.value).toExponential(16);
          text2 = text2.replace(".", ",");
          if (text2.includes("e+")) {
            const split = text2.split("e+");
            const mantissa = split[0];
            const exponent = split[1].padStart(2, "0");
            return mantissa + "E+" + exponent;
          } else {
            const split = text2.split("e-");
            const mantissa = split[0];
            const exponent = split[1].padStart(2, "0");
            return mantissa + "E-" + exponent;
          }
        }
      };
      exports2.Float = Float;
    }
  });

  // node_modules/@abaplint/runtime/build/src/types/packed.js
  var require_packed = __commonJS({
    "node_modules/@abaplint/runtime/build/src/types/packed.js"(exports2) {
      "use strict";
      Object.defineProperty(exports2, "__esModule", { value: true });
      exports2.Packed = void 0;
      var float_1 = require_float();
      var throw_error_1 = require_throw_error();
      var integer8_1 = require_integer8();
      var digits = new RegExp(/^\s*-?\+?\d*\.?\d* *$/i);
      var Packed = class _Packed {
        // todo: change this to bigint to get the proper precision? for larger than maxsafeint
        value;
        length;
        decimals;
        qualifiedName;
        constructor(input) {
          this.value = 0;
          this.length = 666;
          if (input?.length) {
            this.length = input.length;
          }
          this.decimals = 0;
          if (input?.decimals) {
            this.decimals = input.decimals;
          }
          this.qualifiedName = input?.qualifiedName;
        }
        clone() {
          const n = new _Packed({ length: this.length, decimals: this.decimals, qualifiedName: this.qualifiedName });
          n.value = this.value;
          return n;
        }
        getQualifiedName() {
          return this.qualifiedName;
        }
        round(value, places) {
          return +(Math.round(value + "e+" + places) + "e-" + places);
        }
        set(value) {
          if (typeof value === "number") {
            this.value = value;
          } else if (typeof value === "string") {
            if (value.trim().length === 0) {
              this.value = 0;
              return this;
            } else if (digits.test(value) === false) {
              (0, throw_error_1.throwError)("CX_SY_CONVERSION_NO_NUMBER");
            }
            this.value = this.round(parseFloat(value), this.decimals);
          } else if (value instanceof integer8_1.Integer8) {
            this.value = Number(value.get());
          } else if (value instanceof float_1.Float) {
            this.value = this.round(value.getRaw(), this.decimals);
          } else {
            this.set(value.get());
          }
          return this;
        }
        getLength() {
          return this.length;
        }
        getDecimals() {
          return this.decimals;
        }
        clear() {
          this.value = 0;
        }
        get() {
          return this.value;
        }
      };
      exports2.Packed = Packed;
    }
  });

  // node_modules/@abaplint/runtime/build/src/types/string.js
  var require_string = __commonJS({
    "node_modules/@abaplint/runtime/build/src/types/string.js"(exports2) {
      "use strict";
      Object.defineProperty(exports2, "__esModule", { value: true });
      exports2.String = void 0;
      var _parse_1 = require_parse();
      var throw_error_1 = require_throw_error();
      var character_1 = require_character();
      var field_symbol_1 = require_field_symbol();
      var integer_1 = require_integer();
      var packed_1 = require_packed();
      var structure_1 = require_structure();
      var float_1 = require_float();
      var String2 = class _String {
        value;
        qualifiedName;
        constructor(input) {
          this.value = "";
          this.qualifiedName = input?.qualifiedName;
        }
        clone() {
          const n = new _String({ qualifiedName: this.qualifiedName });
          n.value = this.value;
          return n;
        }
        getQualifiedName() {
          return this.qualifiedName;
        }
        set(value) {
          if (value instanceof field_symbol_1.FieldSymbol) {
            if (value.getPointer() === void 0) {
              throw new Error("GETWA_NOT_ASSIGNED");
            }
            return this.set(value.getPointer());
          } else if (typeof value === "string") {
            this.value = value;
          } else if (typeof value === "number") {
            this.value = value.toString();
          } else if (value instanceof character_1.Character) {
            this.value = value.getTrimEnd();
          } else if (value instanceof structure_1.Structure) {
            this.value = value.getCharacter().trimEnd();
          } else if (value instanceof packed_1.Packed) {
            const lv_sign = value.get() >= 0 ? " " : "-";
            this.value = Math.abs(value.get()).toFixed(value.getDecimals());
            this.value += lv_sign;
          } else if (value instanceof integer_1.Integer) {
            const lv_sign = value.get() >= 0 ? " " : "-";
            this.value = Math.abs(value.get()) + "";
            this.value += lv_sign;
          } else if (value instanceof float_1.Float) {
            this.value = value.get() + "";
            this.value = this.value.replace(",", ".");
          } else {
            this.value = value.get() + "";
          }
          return this;
        }
        clear() {
          this.value = "";
        }
        get() {
          return this.value;
        }
        getOffset(input) {
          let offset = input?.offset;
          if (offset) {
            offset = (0, _parse_1.parse)(offset);
          }
          let length = input?.length;
          if (length) {
            length = (0, _parse_1.parse)(length);
          }
          if (offset && offset > this.value.length || length && length > this.value.length || offset && length && offset + length > this.value.length || offset && offset < 0 || length && length < 0) {
            (0, throw_error_1.throwError)("CX_SY_RANGE_OUT_OF_BOUNDS");
          }
          let ret = this.value;
          if (offset) {
            ret = ret.substr(offset);
          }
          if (length !== void 0) {
            ret = ret.substr(0, length);
          }
          const r = new _String();
          r.set(ret);
          return r;
        }
      };
      exports2.String = String2;
    }
  });

  // node_modules/@abaplint/runtime/build/src/types/integer.js
  var require_integer = __commonJS({
    "node_modules/@abaplint/runtime/build/src/types/integer.js"(exports2) {
      "use strict";
      Object.defineProperty(exports2, "__esModule", { value: true });
      exports2.Integer = exports2.MIN_INTEGER = exports2.MAX_INTEGER = exports2.DIGITS = void 0;
      exports2.toInteger = toInteger;
      var throw_error_1 = require_throw_error();
      var float_1 = require_float();
      var hex_1 = require_hex();
      var xstring_1 = require_xstring();
      var integer8_1 = require_integer8();
      var hex_uint8_1 = require_hex_uint8();
      var character_1 = require_character();
      var string_1 = require_string();
      exports2.DIGITS = new RegExp(/^\s*-?\+?\d+\.?\d* *$/i);
      exports2.MAX_INTEGER = 2147483647;
      exports2.MIN_INTEGER = -2147483648;
      function toInteger(value, exception = true) {
        if (value.endsWith("-")) {
          value = "-" + value.substring(0, value.length - 1);
        }
        if (exports2.DIGITS.test(value) === false) {
          if (value.trim().length === 0) {
            value = "0";
          } else if (exception === true) {
            (0, throw_error_1.throwError)("CX_SY_CONVERSION_NO_NUMBER");
          } else {
            throw new Error("CONVT_NO_NUMBER");
          }
        }
        return Math.round(parseFloat(value));
      }
      var Integer = class _Integer {
        value;
        constant = false;
        qualifiedName;
        constructor(input) {
          this.value = 0;
          this.qualifiedName = input?.qualifiedName;
        }
        getQualifiedName() {
          return this.qualifiedName;
        }
        clone() {
          const n = new _Integer({ qualifiedName: this.qualifiedName });
          n.value = this.value;
          return n;
        }
        setConstant() {
          this.constant = true;
          return this;
        }
        set(value) {
          if (this.constant === true) {
            throw new Error("Changing constant");
          }
          if (typeof value === "number") {
            this.value = Math.round(value);
          } else if (value instanceof _Integer) {
            this.set(value.get());
          } else if (value instanceof character_1.Character) {
            this.value = toInteger(value.get());
          } else if (value instanceof string_1.String) {
            this.value = toInteger(value.get());
          } else if (value instanceof integer8_1.Integer8) {
            this.set(Number(value.get()));
          } else if (value instanceof float_1.Float) {
            this.set(Math.round(value.getRaw()));
          } else if (value instanceof hex_1.Hex || value instanceof xstring_1.XString || value instanceof hex_uint8_1.HexUInt8) {
            let num = parseInt(value.get(), 16);
            if ((value instanceof hex_1.Hex || value instanceof hex_uint8_1.HexUInt8) && value.getLength() >= 4) {
              const maxVal = Math.pow(2, value.get().length / 2 * 8);
              if (num > maxVal / 2 - 1) {
                num = num - maxVal;
              }
            }
            this.set(num);
          } else if (typeof value === "string") {
            this.value = toInteger(value);
          } else {
            this.set(value.get());
          }
          return this;
        }
        clear() {
          this.value = 0;
        }
        get() {
          return this.value;
        }
      };
      exports2.Integer = Integer;
    }
  });

  // node_modules/@abaplint/runtime/build/src/types/data_reference.js
  var require_data_reference = __commonJS({
    "node_modules/@abaplint/runtime/build/src/types/data_reference.js"(exports2) {
      "use strict";
      Object.defineProperty(exports2, "__esModule", { value: true });
      exports2.DataReference = void 0;
      var string_1 = require_string();
      var _parse_1 = require_parse();
      var field_symbol_1 = require_field_symbol();
      var DataReference = class _DataReference {
        pointer;
        type;
        constructor(type) {
          this.pointer = void 0;
          this.type = type;
        }
        clone() {
          const n = new _DataReference(this.type);
          n.pointer = this.pointer;
          return n;
        }
        getType() {
          return this.type;
        }
        assign(pointer) {
          this.pointer = pointer;
          return this;
        }
        unassign() {
          this.pointer = void 0;
        }
        getPointer() {
          return this.pointer;
        }
        dereference() {
          return this.pointer;
        }
        ///////////////
        clear() {
          this.unassign();
        }
        get() {
          if (this.pointer === this) {
            throw "Cyclic data reference";
          }
          return this.pointer?.get();
        }
        array() {
          return this.pointer?.array();
        }
        getArrayLength() {
          return this.pointer?.getArrayLength();
        }
        set(value) {
          if (value instanceof _DataReference) {
            this.pointer = value.getPointer();
            return this;
          } else if (value instanceof field_symbol_1.FieldSymbol) {
            if (value.getPointer() === void 0) {
              throw new Error("GETWA_NOT_ASSIGNED");
            } else if (value.getPointer() instanceof _DataReference) {
              this.pointer = value.getPointer().getPointer();
              return this;
            } else {
              throw new Error("OBJECTS_MOVE_NOT_SUPPORTED");
            }
          }
          return this.pointer?.set(value);
        }
        getOffset(input) {
          if (input?.offset) {
            input.offset = (0, _parse_1.parse)(input.offset);
          }
          if (input?.length) {
            input.length = (0, _parse_1.parse)(input.length);
          }
          let ret = this.get();
          if (input?.offset) {
            ret = ret.substr(input.offset);
          }
          if (input?.length !== void 0) {
            ret = ret.substr(0, input.length);
          }
          const r = new string_1.String();
          r.set(ret);
          return r;
        }
      };
      exports2.DataReference = DataReference;
    }
  });

  // node_modules/@abaplint/runtime/build/src/compare/assigned.js
  var require_assigned = __commonJS({
    "node_modules/@abaplint/runtime/build/src/compare/assigned.js"(exports2) {
      "use strict";
      Object.defineProperty(exports2, "__esModule", { value: true });
      exports2.assigned = assigned;
      function assigned(val) {
        return val.isAssigned();
      }
    }
  });

  // node_modules/@abaplint/runtime/build/src/compare/ge.js
  var require_ge = __commonJS({
    "node_modules/@abaplint/runtime/build/src/compare/ge.js"(exports2) {
      "use strict";
      Object.defineProperty(exports2, "__esModule", { value: true });
      exports2.ge = ge;
      var _1 = require_compare();
      function ge(left, right) {
        return (0, _1.gt)(left, right) || (0, _1.eq)(left, right);
      }
    }
  });

  // node_modules/@abaplint/runtime/build/src/compare/le.js
  var require_le = __commonJS({
    "node_modules/@abaplint/runtime/build/src/compare/le.js"(exports2) {
      "use strict";
      Object.defineProperty(exports2, "__esModule", { value: true });
      exports2.le = le;
      var _1 = require_compare();
      function le(left, right) {
        return (0, _1.lt)(left, right) || (0, _1.eq)(left, right);
      }
    }
  });

  // node_modules/@abaplint/runtime/build/src/compare/between.js
  var require_between = __commonJS({
    "node_modules/@abaplint/runtime/build/src/compare/between.js"(exports2) {
      "use strict";
      Object.defineProperty(exports2, "__esModule", { value: true });
      exports2.between = between;
      var ge_1 = require_ge();
      var le_1 = require_le();
      function between(left, and1, and2) {
        return (0, ge_1.ge)(left, and1) && (0, le_1.le)(left, and2);
      }
    }
  });

  // node_modules/@abaplint/runtime/build/src/compare/ca.js
  var require_ca = __commonJS({
    "node_modules/@abaplint/runtime/build/src/compare/ca.js"(exports2) {
      "use strict";
      Object.defineProperty(exports2, "__esModule", { value: true });
      exports2.ca = ca;
      var types_12 = require_types();
      function ca(left, right) {
        if (left instanceof types_12.FieldSymbol) {
          return ca(left.getPointer(), right);
        } else if (right instanceof types_12.FieldSymbol) {
          return ca(left, right.getPointer());
        }
        let l = "";
        if (typeof left === "number" || typeof left === "string") {
          l = left.toString();
        } else if (left instanceof types_12.Structure) {
          l = left.getCharacter();
        } else {
          l = left.get().toString();
        }
        if (l === "") {
          l = " ";
        }
        let r = "";
        if (typeof right === "string") {
          r = right.toString();
        } else {
          r = right.get().toString();
        }
        let fdpos = 0;
        for (const c of l) {
          if (r.includes(c) === true) {
            abap.builtin.sy.get().fdpos.set(fdpos);
            return true;
          }
          fdpos++;
        }
        abap.builtin.sy.get().fdpos.set(fdpos);
        return false;
      }
    }
  });

  // node_modules/@abaplint/runtime/build/src/compare/co.js
  var require_co = __commonJS({
    "node_modules/@abaplint/runtime/build/src/compare/co.js"(exports2) {
      "use strict";
      Object.defineProperty(exports2, "__esModule", { value: true });
      exports2.co = co;
      var types_12 = require_types();
      function co(left, right) {
        let l = "";
        if (typeof left === "number" || typeof left === "string") {
          l = left.toString();
        } else {
          l = left.get().toString();
        }
        let r = "";
        if (typeof right === "string") {
          r = right.toString();
        } else if (right instanceof types_12.Structure) {
          r = right.getCharacter();
        } else {
          r = right.get().toString();
        }
        let fdpos = 0;
        for (const c of l) {
          if (r.includes(c) === false) {
            abap.builtin.sy.get().fdpos.set(fdpos);
            return false;
          }
          fdpos++;
        }
        abap.builtin.sy.get().fdpos.set(fdpos);
        return true;
      }
    }
  });

  // node_modules/@abaplint/runtime/build/src/compare/cn.js
  var require_cn = __commonJS({
    "node_modules/@abaplint/runtime/build/src/compare/cn.js"(exports2) {
      "use strict";
      Object.defineProperty(exports2, "__esModule", { value: true });
      exports2.cn = cn;
      var co_1 = require_co();
      function cn(left, right) {
        return (0, co_1.co)(left, right) === false;
      }
    }
  });

  // node_modules/@abaplint/runtime/build/src/compare/cp.js
  var require_cp = __commonJS({
    "node_modules/@abaplint/runtime/build/src/compare/cp.js"(exports2) {
      "use strict";
      Object.defineProperty(exports2, "__esModule", { value: true });
      exports2.cp = cp;
      var types_12 = require_types();
      function escapeRegExpCharacter(input) {
        return input.replace(/[\\^$.*+?()[\]{}|]/g, "\\$&");
      }
      function cp(left, right) {
        let l = "";
        if (typeof left === "number" || typeof left === "string") {
          l = left.toString();
        } else if (left instanceof types_12.Structure) {
          l = left.getCharacter();
        } else if (left instanceof types_12.FieldSymbol) {
          if (left.getPointer() === void 0) {
            throw new Error("GETWA_NOT_ASSIGNED");
          }
          return cp(left.getPointer(), right);
        } else if (left instanceof types_12.Character) {
          l = left.getTrimEnd();
        } else {
          l = left.get().toString();
        }
        let r = "";
        if (typeof right === "string") {
          r = right.toString();
        } else if (right instanceof types_12.Character) {
          r = right.getTrimEnd();
        } else {
          r = right.get().toString().trimEnd();
        }
        let pattern = "";
        for (let i2 = 0; i2 < r.length; i2++) {
          const current = r[i2];
          if (current === "#") {
            if (i2 + 1 < r.length) {
              const next = r[i2 + 1];
              if (next === "#") {
                pattern += "#";
                i2++;
              } else {
                pattern += escapeRegExpCharacter(next);
                i2++;
              }
            } else {
              pattern += "#";
            }
          } else if (current === "*") {
            pattern += "[\\s\\S]*";
          } else if (current === "+") {
            pattern += "[\\s\\S]";
          } else {
            pattern += escapeRegExpCharacter(current);
          }
        }
        const reg = new RegExp("^" + pattern + "$", "iu");
        return l.match(reg) !== null;
      }
    }
  });

  // node_modules/@abaplint/runtime/build/src/compare/cs.js
  var require_cs = __commonJS({
    "node_modules/@abaplint/runtime/build/src/compare/cs.js"(exports2) {
      "use strict";
      Object.defineProperty(exports2, "__esModule", { value: true });
      exports2.cs = cs;
      var types_12 = require_types();
      function cs(left, right) {
        let l = "";
        if (typeof left === "number" || typeof left === "string") {
          l = left.toString();
        } else {
          l = left.get().toString();
        }
        l = l.toUpperCase();
        let r = "";
        if (typeof right === "string") {
          r = right.toString();
        } else if (right instanceof types_12.Character) {
          r = right.getTrimEnd();
        } else {
          r = right.get().toString();
        }
        r = r.toUpperCase();
        const index = l.indexOf(r);
        if (index < 0) {
          abap.builtin.sy.get().fdpos.set(l.length);
          return false;
        } else {
          abap.builtin.sy.get().fdpos.set(index);
          return true;
        }
      }
    }
  });

  // node_modules/@abaplint/runtime/build/src/compare/initial.js
  var require_initial = __commonJS({
    "node_modules/@abaplint/runtime/build/src/compare/initial.js"(exports2) {
      "use strict";
      Object.defineProperty(exports2, "__esModule", { value: true });
      exports2.initial = initial;
      var types_12 = require_types();
      var REGEX_ZEROS = /^0+$/;
      var REGEX_SPACES = /^ *$/;
      function initial(val) {
        if (val instanceof types_12.Table || val instanceof types_12.HashedTable) {
          return val.array().length === 0;
        } else if (val instanceof types_12.Integer8) {
          return val.get() === 0n;
        } else if (val instanceof types_12.DataReference) {
          return val.getPointer() === void 0;
        } else if (val instanceof types_12.Date) {
          return val.get() === "00000000";
        } else if (val instanceof types_12.Numc) {
          return val.get().match(REGEX_ZEROS) !== null;
        } else if (val instanceof types_12.Hex || val instanceof types_12.HexUInt8) {
          return val.get().match(REGEX_ZEROS) !== null;
        } else if (val instanceof types_12.Time) {
          return val.get() === "000000";
        } else if (val instanceof types_12.Float) {
          return val.getRaw() === 0;
        } else if (val instanceof types_12.Character) {
          return val.get().match(REGEX_SPACES) !== null;
        } else if (val instanceof types_12.FieldSymbol && val.getPointer() === void 0) {
          throw new Error("FS not assigned");
        } else if (val instanceof types_12.FieldSymbol) {
          const res = initial(val.getPointer());
          return res;
        }
        if (typeof val === "string") {
          return val === "";
        } else if (typeof val === "number") {
          return val === 0;
        }
        const value = val.get();
        if (typeof value === "string") {
          return value === "";
        } else if (typeof value === "number") {
          return value === 0;
        } else if (val instanceof types_12.ABAPObject) {
          return value === void 0;
        } else if (typeof value === "object") {
          for (const f of Object.keys(value)) {
            if (initial(value[f]) === false) {
              return false;
            }
          }
          return true;
        } else {
          throw new Error("runtime, initial, missing implementation");
        }
      }
    }
  });

  // node_modules/@abaplint/runtime/build/src/compare/eq.js
  var require_eq = __commonJS({
    "node_modules/@abaplint/runtime/build/src/compare/eq.js"(exports2) {
      "use strict";
      Object.defineProperty(exports2, "__esModule", { value: true });
      exports2.eq = eq;
      var types_12 = require_types();
      var _parse_1 = require_parse();
      var initial_1 = require_initial();
      function compareTables(left, right) {
        const leftArray = left.array();
        const rightArray = right.array();
        if (leftArray.length !== rightArray.length) {
          return false;
        }
        for (let i2 = 0; i2 < leftArray.length; i2++) {
          const rowCompare = eq(leftArray[i2], rightArray[i2]);
          if (rowCompare === false) {
            return false;
          }
        }
        return true;
      }
      function eq(left, right) {
        if (right instanceof types_12.FieldSymbol) {
          return eq(left, right.getPointer());
        } else if (left instanceof types_12.FieldSymbol) {
          return eq(left.getPointer(), right);
        }
        if (left instanceof types_12.Integer8 || right instanceof types_12.Integer8) {
          if (left instanceof types_12.Table || left instanceof types_12.HashedTable || right instanceof types_12.Table || right instanceof types_12.HashedTable) {
            return false;
          }
          const l2 = left instanceof types_12.Integer8 ? left.get() : BigInt((0, _parse_1.parse)(left));
          const r2 = right instanceof types_12.Integer8 ? right.get() : BigInt((0, _parse_1.parse)(right));
          return l2 === r2;
        }
        if (right instanceof types_12.Character) {
          if (left instanceof types_12.Character) {
            if (right.getLength() === left.getLength()) {
              return right.get() === left.get();
            } else {
              return right.getTrimEnd() === left.getTrimEnd();
            }
          } else if (left instanceof types_12.Integer) {
            return (0, types_12.toInteger)(right.get(), false) === left.get();
          } else if (left instanceof types_12.String || left instanceof types_12.XString || left instanceof types_12.Numc || left instanceof types_12.HexUInt8 || left instanceof types_12.Hex) {
            return right.getTrimEnd() === left.get();
          }
        } else if (right instanceof types_12.String) {
          if (left instanceof types_12.Character) {
            return right.get() === left.getTrimEnd();
          } else if (left instanceof types_12.String) {
            return right.get() === left.get();
          }
        } else if (right instanceof types_12.Numc) {
          if (left instanceof types_12.Numc && right.getLength() === left.getLength()) {
            return right.get() === left.get();
          } else if (left instanceof types_12.Integer) {
            return left.get() === parseInt(right.get(), 10);
          }
        } else if (right instanceof types_12.Integer) {
          if (left instanceof types_12.Integer || left instanceof types_12.Integer8) {
            return right.get() === left.get();
          } else if (left instanceof types_12.Character) {
            return (parseInt(left.get(), 10) || 0) === right.get();
          } else if (left instanceof types_12.String) {
            return (parseInt(left.get(), 10) || 0) === right.get();
          } else if (left instanceof types_12.Float) {
            return right.get() === left.getRaw();
          } else if (left instanceof types_12.Numc) {
            return right.get() === parseInt(left.get(), 10);
          } else if (left instanceof types_12.Packed) {
            return right.get() === left.get();
          }
        } else if (right instanceof types_12.DataReference && left instanceof types_12.DataReference) {
          return right.getPointer() === left.getPointer();
        } else if (right instanceof types_12.Table || right instanceof types_12.HashedTable) {
          if (left instanceof types_12.Table || left instanceof types_12.HashedTable) {
            return compareTables(left, right);
          } else {
            return false;
          }
        } else if (right instanceof types_12.Hex || right instanceof types_12.XString || right instanceof types_12.HexUInt8) {
          if (left instanceof types_12.Hex || left instanceof types_12.HexUInt8) {
            if (right.getLength && right.getLength() !== left.getLength()) {
              return (0, initial_1.initial)(left) && (0, initial_1.initial)(right);
            }
            return right.get() === left.get();
          } else if (left instanceof types_12.XString) {
            return right.get() === left.get();
          }
        } else if (right instanceof types_12.ABAPObject) {
          if (left instanceof types_12.ABAPObject) {
            return right.get() === left.get();
          }
        } else if (right instanceof types_12.Date) {
          if (left instanceof types_12.Date) {
            return right.get() === left.get();
          }
        } else if (right instanceof types_12.Packed) {
          if (left instanceof types_12.Packed) {
            return right.get() === left.get();
          } else if (left instanceof types_12.Integer) {
            return right.get() === left.get();
          }
        } else if (right instanceof types_12.Integer8) {
          if (left instanceof types_12.Integer || left instanceof types_12.Integer8 || left instanceof types_12.Packed) {
            return right.get() === left.get();
          } else if (left instanceof types_12.Float) {
            return right.get() === left.getRaw();
          }
        } else if (right instanceof types_12.Float) {
          if (left instanceof types_12.Float) {
            return right.getRaw() === left.getRaw();
          } else if (left instanceof types_12.Integer || left instanceof types_12.Integer8) {
            return right.getRaw() === left.get();
          }
        }
        if (left instanceof types_12.Structure || right instanceof types_12.Structure) {
          if (!(right instanceof types_12.Structure)) {
            return eq(left.getCharacter(), right);
          } else if (!(left instanceof types_12.Structure)) {
            return eq(left, right.getCharacter());
          }
          const l2 = left.get();
          const r2 = right.get();
          const leftKeys = Object.keys(l2);
          const rightKeys = Object.keys(r2);
          if (leftKeys.length !== rightKeys.length) {
            return false;
          }
          for (const k of leftKeys) {
            const e = eq(l2[k], r2[k]);
            if (e === false) {
              return false;
            }
          }
          return true;
        }
        let l = void 0;
        if (left instanceof types_12.Character) {
          l = left.getTrimEnd();
        } else if (left instanceof types_12.Date) {
          l = left.get().trimEnd();
        } else if (left instanceof types_12.Table || left instanceof types_12.HashedTable) {
          return false;
        } else if (typeof left === "object") {
          l = left.get();
        } else {
          l = left;
        }
        let r = void 0;
        if (right instanceof types_12.Character) {
          r = right.getTrimEnd();
        } else if (right instanceof types_12.Date) {
          r = right.get().trimEnd();
        } else if (typeof right === "object") {
          r = right.get();
        } else {
          r = right;
        }
        if ((right instanceof types_12.Hex || right instanceof types_12.HexUInt8) && typeof l === "number") {
          r = parseInt(right.get(), 16);
        } else if ((left instanceof types_12.Hex || left instanceof types_12.HexUInt8) && typeof r === "number") {
          l = parseInt(left.get(), 16);
        }
        if (right instanceof types_12.Float && left instanceof types_12.Float) {
          r = right.getRaw();
          l = left.getRaw();
        } else if (right instanceof types_12.Float && typeof l === "number") {
          r = right.getRaw();
        } else if (left instanceof types_12.Float) {
          if (typeof r === "number") {
            l = left.getRaw();
          } else if (typeof r === "string") {
            l = left.getRaw();
            r = Number(r);
          }
        }
        if (right instanceof types_12.Numc && left instanceof types_12.Integer) {
          l = left.get();
          r = parseInt(right.get(), 10);
        } else if (right instanceof types_12.Integer && left instanceof types_12.Numc) {
          r = right.get();
          l = parseInt(left.get(), 10);
        }
        if (typeof l !== typeof r) {
          if (typeof l === "string" && typeof r === "number") {
            r = r.toString();
          } else if (typeof l === "number" && typeof r === "string") {
            if (r === "") {
              r = 0;
            } else if (r.includes(".")) {
              r = parseFloat(r);
            } else {
              r = parseInt(r, 10);
            }
          }
        }
        return l === r;
      }
    }
  });

  // node_modules/@abaplint/runtime/build/src/compare/gt.js
  var require_gt = __commonJS({
    "node_modules/@abaplint/runtime/build/src/compare/gt.js"(exports2) {
      "use strict";
      Object.defineProperty(exports2, "__esModule", { value: true });
      exports2.gt = gt;
      var _parse_1 = require_parse();
      var types_12 = require_types();
      var integer_1 = require_integer();
      function gt(left, right) {
        if (right instanceof integer_1.Integer) {
          if (left instanceof integer_1.Integer) {
            return left.get() > right.get();
          } else if (left instanceof types_12.Float) {
            return left.getRaw() > right.get();
          } else if (left instanceof types_12.Character) {
            return (0, _parse_1.parse)(left) > right.get();
          } else if (left instanceof types_12.Integer8) {
            const l2 = left.get();
            const r2 = BigInt(right.get());
            return l2 > r2;
          }
        } else if (right instanceof types_12.Float) {
          if (left instanceof types_12.Float) {
            return left.getRaw() > right.getRaw();
          } else if (left instanceof integer_1.Integer) {
            return left.get() > right.getRaw();
          } else if (left instanceof types_12.Integer8) {
            const l2 = left.get();
            const r2 = BigInt(right.getRaw());
            return l2 > r2;
          }
        } else if (right instanceof types_12.Integer8) {
          if (left instanceof types_12.Table || left instanceof types_12.HashedTable) {
            throw new Error("runtime_todo, gt TABLE");
          }
          const l2 = left instanceof types_12.Integer8 ? left.get() : BigInt((0, _parse_1.parse)(left));
          const r2 = right instanceof types_12.Integer8 ? right.get() : BigInt((0, _parse_1.parse)(right));
          return l2 > r2;
        }
        if (left instanceof types_12.FieldSymbol) {
          if (left.getPointer() === void 0) {
            throw new Error("GETWA_NOT_ASSIGNED");
          }
          return gt(left.getPointer(), right);
        } else if (right instanceof types_12.FieldSymbol) {
          if (right.getPointer() === void 0) {
            throw new Error("GETWA_NOT_ASSIGNED");
          }
          return gt(left, right.getPointer());
        }
        if (left instanceof types_12.Table || right instanceof types_12.Table || left instanceof types_12.HashedTable || right instanceof types_12.HashedTable) {
          throw new Error("runtime_todo, gt TABLE");
        } else if (left instanceof types_12.Hex || right instanceof types_12.Hex || left instanceof types_12.HexUInt8 || right instanceof types_12.HexUInt8) {
          return gt_with_hex(left, right);
        }
        if (left instanceof types_12.Integer8) {
          const l2 = left.get();
          const r2 = BigInt((0, _parse_1.parse)(right));
          return l2 > r2;
        }
        if (left instanceof types_12.Structure || right instanceof types_12.Structure) {
          if (!(right instanceof types_12.Structure)) {
            return gt(left.getCharacter(), right);
          } else if (!(left instanceof types_12.Structure)) {
            return gt(left, right.getCharacter());
          }
        }
        let l = void 0;
        if (typeof left === "number" || typeof left === "string") {
          l = left;
        } else if (left instanceof types_12.Float || left instanceof types_12.DecFloat34) {
          l = left.getRaw();
        } else {
          l = left.get();
        }
        let r = void 0;
        if (typeof right === "number" || typeof right === "string") {
          r = right;
        } else if (right instanceof types_12.Float || right instanceof types_12.DecFloat34) {
          r = right.getRaw();
        } else {
          r = right.get();
        }
        if (typeof l === "string" && typeof r === "number") {
          if (l === "") {
            l = 0;
          } else {
            l = parseInt(l, 10);
          }
        } else if (typeof l === "number" && typeof r === "string") {
          if (r === "") {
            r = 0;
          } else {
            r = parseInt(r, 10);
          }
        }
        if (l === void 0) {
          return true;
        } else if (r === void 0) {
          return true;
        }
        return l > r;
      }
      function gt_with_hex(left, right) {
        const left_hex = get_hex_from_parameter(left);
        const right_hex = get_hex_from_parameter(right);
        return left_hex > right_hex;
      }
      function get_hex_from_parameter(comparison_part) {
        let hex_from_parameter = "";
        switch (typeof comparison_part) {
          case "number":
            hex_from_parameter = comparison_part.toString(16);
            break;
          case "string":
            hex_from_parameter = comparison_part.split("").map((c) => c.charCodeAt(0).toString(16).padStart(2, "0")).join("");
            break;
          case "object":
            if (comparison_part instanceof types_12.Hex || comparison_part instanceof types_12.XString || comparison_part instanceof types_12.HexUInt8 || comparison_part instanceof types_12.Character) {
              hex_from_parameter = comparison_part.get();
            } else if (comparison_part instanceof integer_1.Integer) {
              hex_from_parameter = comparison_part.get().toString(16).toUpperCase();
              if (hex_from_parameter.length % 2 === 1) {
                hex_from_parameter = "0" + hex_from_parameter;
              }
            } else {
              throw new Error("runtime_todo, gt hex1");
            }
            break;
          default:
            throw new Error("runtime_todo, gt hex2");
        }
        return hex_from_parameter;
      }
    }
  });

  // node_modules/@abaplint/runtime/build/src/compare/instance_of.js
  var require_instance_of = __commonJS({
    "node_modules/@abaplint/runtime/build/src/compare/instance_of.js"(exports2) {
      "use strict";
      Object.defineProperty(exports2, "__esModule", { value: true });
      exports2.instance_of = instance_of;
      function instance_of(val, cname) {
        return val.get() instanceof cname;
      }
    }
  });

  // node_modules/@abaplint/runtime/build/src/compare/lt.js
  var require_lt = __commonJS({
    "node_modules/@abaplint/runtime/build/src/compare/lt.js"(exports2) {
      "use strict";
      Object.defineProperty(exports2, "__esModule", { value: true });
      exports2.lt = lt;
      var gt_1 = require_gt();
      function lt(left, right) {
        return (0, gt_1.gt)(right, left);
      }
    }
  });

  // node_modules/@abaplint/runtime/build/src/compare/m.js
  var require_m = __commonJS({
    "node_modules/@abaplint/runtime/build/src/compare/m.js"(exports2) {
      "use strict";
      Object.defineProperty(exports2, "__esModule", { value: true });
      exports2.hexToBinary = hexToBinary;
      exports2.m = m;
      function hexToBinary(input) {
        let ret = "";
        const hex = input.get();
        for (let index = 0; index < hex.length / 2; index++) {
          const byte = hex.substring(index * 2, index * 2 + 2);
          ret += parseInt(byte, 16).toString(2).padStart(8, "0");
        }
        return ret;
      }
      function m(operand1, operand2) {
        let operand1Bits = hexToBinary(operand1);
        const operand2Bits = hexToBinary(operand2);
        if (operand1Bits.length < operand2Bits.length) {
          operand1Bits = operand1Bits.padEnd(operand2Bits.length, "0");
        }
        let oneFound = false;
        let zeroFound = false;
        for (let index = 0; index < operand2Bits.length; index++) {
          const o1bit = operand1Bits.substring(index, index + 1);
          const o2bit = operand2Bits.substring(index, index + 1);
          if (o2bit === "1") {
            if (o1bit === "1") {
              oneFound = true;
            } else {
              zeroFound = true;
            }
          }
        }
        return oneFound && zeroFound;
      }
    }
  });

  // node_modules/@abaplint/runtime/build/src/compare/na.js
  var require_na = __commonJS({
    "node_modules/@abaplint/runtime/build/src/compare/na.js"(exports2) {
      "use strict";
      Object.defineProperty(exports2, "__esModule", { value: true });
      exports2.na = na;
      var ca_1 = require_ca();
      function na(left, right) {
        return !(0, ca_1.ca)(left, right);
      }
    }
  });

  // node_modules/@abaplint/runtime/build/src/compare/ne.js
  var require_ne = __commonJS({
    "node_modules/@abaplint/runtime/build/src/compare/ne.js"(exports2) {
      "use strict";
      Object.defineProperty(exports2, "__esModule", { value: true });
      exports2.ne = ne;
      var eq_1 = require_eq();
      function ne(left, right) {
        return !(0, eq_1.eq)(left, right);
      }
    }
  });

  // node_modules/@abaplint/runtime/build/src/compare/np.js
  var require_np = __commonJS({
    "node_modules/@abaplint/runtime/build/src/compare/np.js"(exports2) {
      "use strict";
      Object.defineProperty(exports2, "__esModule", { value: true });
      exports2.np = np;
      var cp_1 = require_cp();
      function np(left, right) {
        return !(0, cp_1.cp)(left, right);
      }
    }
  });

  // node_modules/@abaplint/runtime/build/src/compare/ns.js
  var require_ns = __commonJS({
    "node_modules/@abaplint/runtime/build/src/compare/ns.js"(exports2) {
      "use strict";
      Object.defineProperty(exports2, "__esModule", { value: true });
      exports2.ns = ns;
      var cs_1 = require_cs();
      function ns(left, right) {
        return !(0, cs_1.cs)(left, right);
      }
    }
  });

  // node_modules/@abaplint/runtime/build/src/compare/o.js
  var require_o = __commonJS({
    "node_modules/@abaplint/runtime/build/src/compare/o.js"(exports2) {
      "use strict";
      Object.defineProperty(exports2, "__esModule", { value: true });
      exports2.o = o;
      var m_1 = require_m();
      function o(operand1, operand2) {
        let operand1Bits = (0, m_1.hexToBinary)(operand1);
        const operand2Bits = (0, m_1.hexToBinary)(operand2);
        if (operand1Bits.length < operand2Bits.length) {
          operand1Bits = operand1Bits.padEnd(operand2Bits.length, "0");
        }
        let zeroFound = false;
        for (let index = 0; index < operand2Bits.length; index++) {
          const o1bit = operand1Bits.substring(index, index + 1);
          const o2bit = operand2Bits.substring(index, index + 1);
          if (o2bit === "1") {
            if (o1bit === "1") {
            } else {
              zeroFound = true;
            }
          }
        }
        return zeroFound === false;
      }
    }
  });

  // node_modules/@abaplint/runtime/build/src/compare/z.js
  var require_z = __commonJS({
    "node_modules/@abaplint/runtime/build/src/compare/z.js"(exports2) {
      "use strict";
      Object.defineProperty(exports2, "__esModule", { value: true });
      exports2.z = z;
      var m_1 = require_m();
      function z(operand1, operand2) {
        let operand1Bits = (0, m_1.hexToBinary)(operand1);
        const operand2Bits = (0, m_1.hexToBinary)(operand2);
        if (operand1Bits.length < operand2Bits.length) {
          operand1Bits = operand1Bits.padEnd(operand2Bits.length, "0");
        }
        let oneFound = false;
        for (let index = 0; index < operand2Bits.length; index++) {
          const o1bit = operand1Bits.substring(index, index + 1);
          const o2bit = operand2Bits.substring(index, index + 1);
          if (o2bit === "1") {
            if (o1bit === "1") {
              oneFound = true;
            } else {
            }
          }
        }
        return oneFound === false;
      }
    }
  });

  // node_modules/@abaplint/runtime/build/src/compare/in.js
  var require_in = __commonJS({
    "node_modules/@abaplint/runtime/build/src/compare/in.js"(exports2) {
      "use strict";
      Object.defineProperty(exports2, "__esModule", { value: true });
      exports2.compareIn = compareIn;
      var cp_1 = require_cp();
      var eq_1 = require_eq();
      var ne_1 = require_ne();
      function compareIn(left, right) {
        if (right.array().length === 0) {
          return true;
        }
        for (const row of right.array()) {
          if ((0, eq_1.eq)(row.get()["sign"], "I") && (0, eq_1.eq)(row.get()["option"], "EQ")) {
            if ((0, eq_1.eq)(row.get()["low"], left)) {
              return true;
            }
          } else if ((0, eq_1.eq)(row.get()["sign"], "E") && (0, eq_1.eq)(row.get()["option"], "EQ")) {
            if ((0, ne_1.ne)(row.get()["low"], left)) {
              return true;
            }
          } else if ((0, eq_1.eq)(row.get()["sign"], "I") && (0, eq_1.eq)(row.get()["option"], "CP")) {
            if ((0, cp_1.cp)(left, row.get()["low"])) {
              return true;
            }
          } else {
            console.dir(row);
            throw new Error("compareIn todo");
          }
        }
        return false;
      }
    }
  });

  // node_modules/@abaplint/runtime/build/src/compare/index.js
  var require_compare = __commonJS({
    "node_modules/@abaplint/runtime/build/src/compare/index.js"(exports2) {
      "use strict";
      var __createBinding = exports2 && exports2.__createBinding || (Object.create ? (function(o, m, k, k2) {
        if (k2 === void 0) k2 = k;
        var desc = Object.getOwnPropertyDescriptor(m, k);
        if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
          desc = { enumerable: true, get: function() {
            return m[k];
          } };
        }
        Object.defineProperty(o, k2, desc);
      }) : (function(o, m, k, k2) {
        if (k2 === void 0) k2 = k;
        o[k2] = m[k];
      }));
      var __exportStar = exports2 && exports2.__exportStar || function(m, exports3) {
        for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports3, p)) __createBinding(exports3, m, p);
      };
      Object.defineProperty(exports2, "__esModule", { value: true });
      exports2.in = void 0;
      __exportStar(require_assigned(), exports2);
      __exportStar(require_between(), exports2);
      __exportStar(require_ca(), exports2);
      __exportStar(require_cn(), exports2);
      __exportStar(require_co(), exports2);
      __exportStar(require_cp(), exports2);
      __exportStar(require_cs(), exports2);
      __exportStar(require_eq(), exports2);
      __exportStar(require_ge(), exports2);
      __exportStar(require_gt(), exports2);
      __exportStar(require_initial(), exports2);
      __exportStar(require_instance_of(), exports2);
      __exportStar(require_le(), exports2);
      __exportStar(require_lt(), exports2);
      __exportStar(require_m(), exports2);
      __exportStar(require_na(), exports2);
      __exportStar(require_ne(), exports2);
      __exportStar(require_np(), exports2);
      __exportStar(require_ns(), exports2);
      __exportStar(require_o(), exports2);
      __exportStar(require_z(), exports2);
      var in_1 = require_in();
      Object.defineProperty(exports2, "in", { enumerable: true, get: function() {
        return in_1.compareIn;
      } });
    }
  });

  // node_modules/@abaplint/runtime/build/src/binary_search.js
  var require_binary_search = __commonJS({
    "node_modules/@abaplint/runtime/build/src/binary_search.js"(exports2) {
      "use strict";
      Object.defineProperty(exports2, "__esModule", { value: true });
      exports2.binarySearchFromRow = binarySearchFromRow;
      exports2.binarySearchFrom = binarySearchFrom;
      exports2.binarySearchTo = binarySearchTo;
      var compare_1 = require_compare();
      var types_12 = require_types();
      function binarySearchFromRow(array, left, right, keyField, keyValue, usesTableLine) {
        if (right <= 0) {
          return 0;
        }
        const isStructured = array[0] instanceof types_12.Structure;
        while (right - left > 1) {
          const middle = Math.floor((right - left) / 2 + left);
          const a2 = array[middle];
          let row2 = void 0;
          if (usesTableLine === false && isStructured === true) {
            row2 = a2.get();
          } else {
            row2 = isStructured ? { table_line: a2, ...a2.get() } : { table_line: a2 };
          }
          if ((0, compare_1.ge)(keyField(row2), keyValue)) {
            right = middle;
          } else {
            left = middle;
          }
        }
        const a = array[left];
        let row = void 0;
        if (usesTableLine === false && isStructured === true) {
          row = a.get();
        } else {
          row = isStructured ? { table_line: a, ...a.get() } : { table_line: a };
        }
        if ((0, compare_1.le)(keyValue, keyField(row))) {
          return left;
        }
        return right;
      }
      function binarySearchFrom(array, left, right, keyField, keyValue) {
        while (right - left > 1) {
          const middle = Math.floor((right - left) / 2 + left);
          if ((0, compare_1.ge)(array[middle].get()[keyField], keyValue)) {
            right = middle;
          } else {
            left = middle;
          }
        }
        return right;
      }
      function binarySearchTo(array, left, right, keyField, keyValue) {
        while (right - left > 1) {
          const middle = Math.floor((right - left) / 2 + left);
          if ((0, compare_1.le)(array[middle].get()[keyField], keyValue)) {
            left = middle;
          } else {
            right = middle;
          }
        }
        return right;
      }
    }
  });

  // node_modules/@abaplint/runtime/build/src/statements/read_table.js
  var require_read_table = __commonJS({
    "node_modules/@abaplint/runtime/build/src/statements/read_table.js"(exports2) {
      "use strict";
      Object.defineProperty(exports2, "__esModule", { value: true });
      exports2.searchWithKey = searchWithKey;
      exports2.searchWithKeyPromise = searchWithKeyPromise;
      exports2.readTable = readTable;
      var binary_search_12 = require_binary_search();
      var compare_1 = require_compare();
      var types_12 = require_types();
      function searchWithKeyEarlyExit(arr, withKey, startIndex = 0, usesTableLine, firstKeyName, firstValue) {
        const isStructured = arr[0] instanceof types_12.Structure;
        for (let index = startIndex; index < arr.length; index++) {
          const a = arr[index];
          let row = void 0;
          if (usesTableLine === false && isStructured === true) {
            row = a.get();
          } else {
            row = isStructured ? { table_line: a, ...a.get() } : { table_line: a };
          }
          if (withKey(row) === true) {
            return {
              found: a,
              foundIndex: index + 1
            };
          }
          if ((0, compare_1.gt)(row[firstKeyName.toLowerCase()], firstValue)) {
            return {
              found: void 0,
              foundIndex: 0
            };
          }
        }
        return {
          found: void 0,
          foundIndex: 0
        };
      }
      function searchWithKey(arr, withKey, startIndex = 0, usesTableLine) {
        const isStructured = arr[0] instanceof types_12.Structure;
        for (let index = startIndex; index < arr.length; index++) {
          const a = arr[index];
          let row = void 0;
          if (usesTableLine === false && isStructured === true) {
            row = a.get();
          } else {
            row = isStructured ? { table_line: a, ...a.get() } : { table_line: a };
          }
          if (withKey(row) === true) {
            return {
              found: a,
              foundIndex: index + 1
            };
          }
        }
        return {
          found: void 0,
          foundIndex: 0
        };
      }
      async function searchWithKeyPromise(arr, withKey, startIndex = 0, usesTableLine) {
        const isStructured = arr[0] instanceof types_12.Structure;
        for (let index = startIndex; index < arr.length; index++) {
          const a = arr[index];
          let row = void 0;
          if (usesTableLine === false && isStructured === true) {
            row = a.get();
          } else {
            row = isStructured ? { table_line: a, ...a.get() } : { table_line: a };
          }
          if (await withKey(row) === true) {
            return {
              found: a,
              foundIndex: index + 1
            };
          }
        }
        return {
          found: void 0,
          foundIndex: 0
        };
      }
      function readTable(table, options) {
        let found = void 0;
        let foundIndex = 0;
        let binarySubrc = void 0;
        if (table instanceof types_12.FieldSymbol) {
          if (table.getPointer() === void 0) {
            throw new Error("GETWA_NOT_ASSIGNED");
          }
          table = table.getPointer();
        }
        if (options?.withTableKey === void 0 && options?.withKeySimple && (table.getOptions().primaryKey?.keyFields || []).length > 0) {
          if (table instanceof types_12.HashedTable) {
            const fields = new Set(table.getOptions().primaryKey.keyFields);
            for (const name in options.withKeySimple) {
              fields.delete(name.toUpperCase());
            }
            if (fields.size === 0) {
              options.withTableKey = true;
            }
          } else {
            const firstKeyField = table.getOptions().primaryKey.keyFields[0];
            let useKey = false;
            for (const name in options.withKeySimple) {
              if (firstKeyField === name.toUpperCase()) {
                useKey = true;
              }
            }
            if (useKey === true) {
              options.withTableKey = true;
            }
          }
        }
        if (options?.index) {
          if (table instanceof types_12.HashedTable) {
            throw new Error("Hashed table, READ INDEX not possible");
          }
          const arr = table.array();
          let index = options.index;
          if (typeof index !== "number") {
            if (index instanceof types_12.FieldSymbol) {
              if (index.getPointer() === void 0) {
                throw new Error("GETWA_NOT_ASSIGNED");
              }
              index = index.getPointer();
            }
            if (index instanceof types_12.Float || index instanceof types_12.DecFloat34) {
              index = index.getRaw();
            } else if (index instanceof types_12.Integer8) {
              index = Number(index.get());
            } else {
              index = index.get();
            }
          }
          found = arr[index - 1];
          if (found && options?.withKey && options?.withKey(found.get()) === false) {
            found = void 0;
          }
          if (found) {
            foundIndex = index;
          }
        } else if (table instanceof types_12.HashedTable && options?.withTableKey === true && options.withKeySimple) {
          const hash = table.buildHashFromSimple(options.withKeySimple);
          found = table.read(hash);
          foundIndex = 0;
        } else if (table instanceof types_12.HashedTable && options?.withKey) {
          const searchResult = searchWithKey(table.array(), options.withKey, 0, options?.usesTableLine);
          found = searchResult.found;
          foundIndex = 0;
        } else if (options?.keyName && options.withKey && options.withKeySimple) {
          const arr = table.getSecondaryIndex(options.keyName);
          const keyInformation = table.getKeyByName(options.keyName);
          const firstKeyName = keyInformation?.keyFields[0];
          if (firstKeyName === void 0) {
            throw new Error("readTable, first key name not found");
          }
          const firstValue = options.withKeySimple[firstKeyName.toLowerCase()];
          if (firstValue === void 0) {
            return readTable(table, { ...options, withKeySimple: void 0 });
          }
          const startIndex = (0, binary_search_12.binarySearchFrom)(arr, 0, arr.length, firstKeyName.toLowerCase(), firstValue) - 1;
          if (startIndex >= 0) {
            const searchResult = searchWithKeyEarlyExit(arr, options.withKey, startIndex, options.usesTableLine, firstKeyName, firstValue);
            found = searchResult.found;
            foundIndex = searchResult.foundIndex;
          }
        } else if ((options?.binarySearch === true || options?.withTableKey === true) && options.withKeyValue && (options?.binarySearch === true || table.getOptions().primaryKey?.type !== types_12.TableAccessType.standard) && options.withKey) {
          const first = options.withKeyValue[0];
          const arr = table.array();
          const startIndex = (0, binary_search_12.binarySearchFromRow)(arr, 0, arr.length - 1, first.key, first.value, options.usesTableLine);
          const searchResult = searchWithKey(arr, options.withKey, startIndex, options.usesTableLine);
          found = searchResult.found;
          foundIndex = searchResult.foundIndex;
          if (found === void 0) {
            if (arr.length === 0) {
              binarySubrc = 8;
              foundIndex = 1;
            } else {
              binarySubrc = 4;
              foundIndex = startIndex + 1;
              const last = arr[arr.length - 1];
              const isStructured = last instanceof types_12.Structure;
              let row = void 0;
              if (options.usesTableLine === false && isStructured === true) {
                row = last.get();
              } else {
                row = isStructured ? { table_line: last, ...last.get() } : { table_line: last };
              }
              if ((0, compare_1.ge)(first.value, first.key(row))) {
                binarySubrc = 8;
              }
            }
          }
        } else if (options?.withKey) {
          const arr = table.array();
          const searchResult = searchWithKey(arr, options.withKey, 0, options.usesTableLine);
          found = searchResult.found;
          foundIndex = searchResult.foundIndex;
        } else if (options?.from) {
          if (options.from instanceof types_12.FieldSymbol) {
            options.from = options.from.getPointer();
          }
          if (table instanceof types_12.Table && options.from instanceof types_12.Structure) {
            const arr = table.array();
            const keys = table.getOptions()?.primaryKey?.keyFields;
            const isStructured = arr[0] instanceof types_12.Structure;
            if (keys !== void 0 && isStructured === true) {
              for (const a of arr) {
                foundIndex++;
                let matches2 = true;
                for (const k of keys) {
                  if ((0, compare_1.eq)(a.get()[k.toLowerCase()], options.from.get()[k.toLowerCase()]) === false) {
                    matches2 = false;
                    break;
                  }
                }
                if (matches2 === true) {
                  found = a;
                  break;
                }
              }
            }
          } else if (table instanceof types_12.HashedTable && options.from instanceof types_12.Structure) {
            const key = table.buildHashFromData(options.from);
            found = table.read(key);
          }
          if (found === void 0) {
            foundIndex = 0;
          }
          if (found === void 0 && table.getOptions().primaryKey?.type === types_12.TableAccessType.sorted) {
            binarySubrc = 8;
          }
        } else {
          throw new Error("runtime, readTable, unexpected input");
        }
        let subrc = found ? 0 : 4;
        if (binarySubrc) {
          subrc = binarySubrc;
        } else if (subrc === 4 && (options?.binarySearch === true || options?.keyName !== void 0)) {
          subrc = 8;
        }
        abap.builtin.sy.get().subrc.set(subrc);
        abap.builtin.sy.get().tabix.set(foundIndex);
        if (found) {
          if (options.into) {
            if (options.into instanceof types_12.DataReference) {
              if (found instanceof types_12.DataReference) {
                options.into.assign(found.getPointer());
              } else {
                options.into.assign(found);
              }
            } else {
              options.into.set(found);
            }
          } else if (options.referenceInto) {
            options.referenceInto.assign(found);
          } else if (options.assigning) {
            options.assigning.assign(found);
          }
        }
        return { subrc, foundIndex };
      }
    }
  });

  // node_modules/@abaplint/runtime/build/src/statements/sort.js
  var require_sort = __commonJS({
    "node_modules/@abaplint/runtime/build/src/statements/sort.js"(exports2) {
      "use strict";
      Object.defineProperty(exports2, "__esModule", { value: true });
      exports2.sort = sort;
      var types_12 = require_types();
      var compare_1 = require_compare();
      function compare(a, b, input) {
        const componentName = input.component;
        const descending = input.descending;
        let vala = void 0;
        let valb = void 0;
        if (componentName === "table_line") {
          vala = a.get();
          valb = b.get();
        } else if (componentName.includes("->")) {
          const sub = componentName.split("->");
          vala = a;
          valb = b;
          for (const s of sub) {
            if (s === "table_line") {
              continue;
            }
            if (vala.get()[s] !== void 0) {
              vala = vala.get()[s];
            } else {
              vala = vala.get().FRIENDS_ACCESS_INSTANCE[s];
            }
            if (valb.get()[s] !== void 0) {
              valb = valb.get()[s];
            } else {
              valb = valb.get().FRIENDS_ACCESS_INSTANCE[s];
            }
          }
        } else if (componentName.includes("-")) {
          const sub = componentName.split("-");
          vala = a;
          valb = b;
          for (const s of sub) {
            vala = vala.get()[s];
            valb = valb.get()[s];
          }
        } else {
          vala = a.get()[componentName];
          valb = b.get()[componentName];
        }
        if (vala === void 0 || valb === void 0) {
          throw new Error("sort compare, wrong component name, " + componentName);
        }
        if (descending && (0, compare_1.gt)(vala, valb)) {
          return -1;
        } else if (!descending && (0, compare_1.lt)(vala, valb)) {
          return -1;
        } else if ((0, compare_1.eq)(vala, valb)) {
          return 0;
        } else {
          return 1;
        }
      }
      function sort(input, options) {
        if (input instanceof types_12.FieldSymbol) {
          const pnt = input.getPointer();
          if (pnt === void 0) {
            throw new Error("GETWA_NOT_ASSIGNED");
          }
          sort(pnt, options);
          return;
        } else if (options?.skipSortedCheck !== true && input instanceof types_12.Table && input.getOptions()?.primaryKey?.type === types_12.TableAccessType.sorted) {
          throw new Error("SORT called on sorted table");
        }
        if (input instanceof types_12.HashedTable) {
          throw new Error("Sort hashed table, ugh?");
        }
        if (options?.by) {
          if (options.by.length === 0) {
            throw "SortByLengthZero";
          }
          input.sort((a, b) => {
            for (const c of options.by || []) {
              const res = compare(a, b, c);
              if (res !== 0) {
                return res;
              }
            }
            return 0;
          });
        } else {
          const descending = options?.descending === true;
          input.sort((a, b) => {
            if ((0, compare_1.eq)(a, b)) {
              return 0;
            } else if (descending && (0, compare_1.gt)(a, b)) {
              return -1;
            } else if (!descending && (0, compare_1.lt)(a, b)) {
              return -1;
            } else {
              return 1;
            }
          });
        }
      }
    }
  });

  // node_modules/@abaplint/runtime/build/src/statements/insert_internal.js
  var require_insert_internal = __commonJS({
    "node_modules/@abaplint/runtime/build/src/statements/insert_internal.js"(exports2) {
      "use strict";
      Object.defineProperty(exports2, "__esModule", { value: true });
      exports2.insertInternal = insertInternal;
      var compare_1 = require_compare();
      var types_12 = require_types();
      var read_table_1 = require_read_table();
      var sort_1 = require_sort();
      function insertInternal(options) {
        if (options.table instanceof types_12.FieldSymbol) {
          if (options.table.getPointer() === void 0) {
            throw new Error("GETWA_NOT_ASSIGNED");
          }
          options.table = options.table.getPointer();
        }
        if (options.data instanceof types_12.FieldSymbol) {
          if (options.data.getPointer() === void 0) {
            throw new Error("GETWA_NOT_ASSIGNED");
          }
          options.data = options.data.getPointer();
        }
        const tableOptions = options.table.getOptions();
        let isSorted = tableOptions?.primaryKey?.type === types_12.TableAccessType.sorted || tableOptions?.primaryKey?.type === types_12.TableAccessType.hashed;
        if (options.table instanceof types_12.HashedTable) {
          isSorted = false;
        } else if (isSorted) {
          const insert = options.data instanceof types_12.Structure ? options.data.get() : { table_line: options.data };
          let compare = (row) => {
            for (const key of tableOptions?.primaryKey?.keyFields || []) {
              if (key.includes("-")) {
                const [first, second] = key.split("-");
                if ((0, compare_1.ne)(row[first.toLowerCase()].get()[second.toLowerCase()], insert[first.toLowerCase()].get()[second.toLowerCase()])) {
                  return false;
                }
              } else {
                if ((0, compare_1.ne)(row[key.toLowerCase()], insert[key.toLowerCase()])) {
                  return false;
                }
              }
            }
            return true;
          };
          if (tableOptions.primaryKey?.isUnique === true) {
            const withKeyValue = [];
            let binary = false;
            const data2 = options?.data;
            if (data2 instanceof types_12.Structure) {
              const fieldName = tableOptions.primaryKey.keyFields[0].toLowerCase();
              if (fieldName !== "table_line" && fieldName.includes("-") === false) {
                withKeyValue.push({ key: (i2) => {
                  return i2[fieldName];
                }, value: data2.get()[fieldName] });
                binary = true;
              }
            } else {
              compare = (row) => {
                return (0, compare_1.eq)(row.table_line, options.data);
              };
            }
            (0, read_table_1.readTable)(options.table, { withKey: compare, withKeyValue, binarySearch: binary });
            if (abap.builtin.sy.get().subrc.get() === 0) {
              abap.builtin.sy.get().subrc.set(4);
              return;
            }
          }
        }
        let data = options.data;
        if (typeof data === "string") {
          const tmp = options.table.getRowType().clone();
          tmp.set(data);
          data = tmp;
        }
        if (data && options.index) {
          const index = options.index.get() - 1;
          const val = options.table.insertIndex(data, index);
          if (options.assigning) {
            options.assigning.assign(val);
          }
        } else if (options.lines && (options.data instanceof types_12.Table || options.data instanceof types_12.HashedTable)) {
          if (options.table instanceof types_12.HashedTable) {
            for (const source of options.data.array()) {
              const result = options.table.insert(source);
              if (result.subrc !== 0) {
                throw new Error("ITAB_DUPLICATE_KEY");
              }
            }
          } else {
            for (const i2 of options.data.array()) {
              options.table.append(i2);
            }
          }
        } else if (options.initial === true) {
          let index = options.table.getArrayLength();
          if (options.index) {
            index = options.index.get() - 1;
          }
          const val = options.table.insertIndex(options.table.getRowType(), index);
          if (options.assigning) {
            options.assigning.assign(val);
          }
          if (options.referenceInto) {
            options.referenceInto.assign(val);
          }
        } else if (options.table instanceof types_12.HashedTable && data) {
          const { value: val, subrc } = options.table.insert(data);
          if (options.assigning) {
            options.assigning.assign(val);
          }
          if (options.referenceInto) {
            options.referenceInto.assign(val);
          }
          abap.builtin.sy.get().subrc.set(subrc);
          return;
        } else if (data) {
          const val = options.table.insertIndex(data, options.table.getArrayLength(), options.noClone);
          if (options.assigning) {
            options.assigning.assign(val);
          }
          if (options.referenceInto) {
            options.referenceInto.assign(val);
          }
        }
        abap.builtin.sy.get().subrc.set(0);
        if (isSorted && !(options.table instanceof types_12.HashedTable)) {
          let by = tableOptions?.primaryKey?.keyFields?.map((f) => {
            return { component: f.toLowerCase() };
          });
          if (by?.length === 1 && by[0].component === "table_line") {
            by = [];
          }
          if (by && by.length > 0) {
            (0, sort_1.sort)(options.table, { by, skipSortedCheck: true });
          } else {
            (0, sort_1.sort)(options.table, { skipSortedCheck: true });
          }
        }
      }
    }
  });

  // node_modules/@abaplint/runtime/build/src/types/table.js
  var require_table = __commonJS({
    "node_modules/@abaplint/runtime/build/src/types/table.js"(exports2) {
      "use strict";
      Object.defineProperty(exports2, "__esModule", { value: true });
      exports2.Table = exports2.HashedTable = exports2.TableFactory = exports2.LoopController = exports2.TableKeyType = exports2.TableAccessType = void 0;
      var integer_1 = require_integer();
      var abap_object_1 = require_abap_object();
      var string_1 = require_string();
      var structure_1 = require_structure();
      var field_symbol_1 = require_field_symbol();
      var data_reference_1 = require_data_reference();
      var insert_internal_1 = require_insert_internal();
      var sort_1 = require_sort();
      var character_1 = require_character();
      var hex_1 = require_hex();
      var hex_uint8_1 = require_hex_uint8();
      var TableAccessType;
      (function(TableAccessType2) {
        TableAccessType2["standard"] = "STANDARD";
        TableAccessType2["sorted"] = "SORTED";
        TableAccessType2["hashed"] = "HASHED";
        TableAccessType2["index"] = "INDEX";
        TableAccessType2["any"] = "ANY";
      })(TableAccessType || (exports2.TableAccessType = TableAccessType = {}));
      var TableKeyType;
      (function(TableKeyType2) {
        TableKeyType2["default"] = "DEFAULT";
        TableKeyType2["user"] = "USER";
        TableKeyType2["empty"] = "EMPTY";
      })(TableKeyType || (exports2.TableKeyType = TableKeyType = {}));
      var LoopController = class {
        index;
        loopTo;
        array;
        constructor(from, loopTo, array) {
          this.index = from;
          this.loopTo = loopTo;
          this.array = array;
        }
      };
      exports2.LoopController = LoopController;
      var TableFactory = class {
        static construct(rowType, options, qualifiedName) {
          if (options === void 0) {
            options = {
              primaryKey: {
                name: "primary_key",
                type: TableAccessType.standard,
                keyFields: [],
                isUnique: false
              },
              keyType: TableKeyType.default,
              withHeader: false
            };
          }
          if (options.primaryKey?.type === TableAccessType.hashed) {
            return new HashedTable(rowType, options, qualifiedName);
          } else {
            return new Table(rowType, options, qualifiedName);
          }
        }
      };
      exports2.TableFactory = TableFactory;
      var HashedTable = class _HashedTable {
        value;
        header;
        rowType;
        loops;
        options;
        qualifiedName;
        isStructured;
        secondaryIndexes;
        constructor(rowType, options, qualifiedName) {
          this.value = {};
          this.secondaryIndexes = {};
          this.loops = /* @__PURE__ */ new Set();
          this.rowType = rowType;
          this.options = options;
          this.isStructured = rowType instanceof structure_1.Structure;
          if (options?.withHeader === true) {
            this.header = this.rowType.clone();
          }
          this.qualifiedName = qualifiedName?.toUpperCase();
        }
        clone() {
          const copy = new _HashedTable(this.rowType, this.options, this.qualifiedName);
          for (const hash in this.value) {
            copy.value[hash] = this.value[hash].clone();
          }
          return copy;
        }
        getArrayLength() {
          return Object.keys(this.value).length;
        }
        getKeyByName(name) {
          return this.getOptions()?.secondary?.find((s) => s.name.toUpperCase() === name.toUpperCase());
        }
        getSecondaryIndex(name) {
          if (this.secondaryIndexes[name.toUpperCase()]) {
            return this.secondaryIndexes[name.toUpperCase()];
          }
          const secondary = this.getKeyByName(name);
          if (secondary === void 0) {
            throw `Table, secondary key "${name}" not found`;
          }
          const copy = this.array();
          (0, sort_1.sort)(copy, { by: secondary.keyFields.map((k) => {
            return { component: k.toLowerCase() };
          }) });
          this.secondaryIndexes[name.toUpperCase()] = copy;
          return copy;
        }
        buildHashFromData(data) {
          let hash = "";
          for (const k of this.options.primaryKey.keyFields) {
            if (k === "TABLE_LINE") {
              if (data instanceof structure_1.Structure) {
                hash += k + ":" + data.getCharacter(true) + "|";
              } else if (data instanceof abap_object_1.ABAPObject) {
                const moo = data.getInternalID();
                hash += k + ":" + moo + "|";
              } else {
                hash += k + ":" + data.get() + "|";
              }
            } else {
              let val = data.get()[k.toLowerCase()];
              if (val instanceof structure_1.Structure) {
                val = val.getCharacter(true);
              } else if (val instanceof abap_object_1.ABAPObject) {
                val = val.getInternalID();
              } else {
                val = val.get();
              }
              hash += k + ":" + val + "|";
            }
          }
          return hash;
        }
        deleteIndex(_index) {
          throw new Error("HashedTable, deleteIndex");
        }
        deleteFrom(row) {
          const hash = this.buildHashFromData(row);
          delete this.value[hash];
        }
        buildHashFromSimple(data) {
          let hash = "";
          const tableRowType = this.getRowType();
          const isStructured = tableRowType instanceof structure_1.Structure;
          for (const k of this.options.primaryKey.keyFields) {
            let val = data[k.toLowerCase()];
            if (val === void 0 && tableRowType.get()[k.toLowerCase()] instanceof structure_1.Structure && Object.keys(tableRowType.get()[k.toLowerCase()].get()).length === 1) {
              val = data[Object.keys(tableRowType.get()[k.toLowerCase()].get())[0]];
            }
            if (k === "TABLE_LINE") {
              const row = tableRowType.clone();
              row.set(val.get());
              val = row.get();
            } else if (isStructured === true) {
              const field = tableRowType.get()[k.toLowerCase()];
              if (field instanceof string_1.String && val instanceof string_1.String) {
                val = val.get();
              } else if (field instanceof character_1.Character && val instanceof character_1.Character && field.getLength() === val.getLength()) {
                val = val.get();
              } else if (field instanceof hex_1.Hex && val instanceof hex_1.Hex && field.getLength() === val.getLength()) {
                val = val.get();
              } else if (field instanceof hex_uint8_1.HexUInt8 && val instanceof hex_uint8_1.HexUInt8 && field.getLength() === val.getLength()) {
                val = val.get();
              } else if (val instanceof abap_object_1.ABAPObject) {
                val = val.getInternalID();
              } else if (val instanceof structure_1.Structure) {
                val = val.getCharacter(true);
              } else {
                const row = field.clone();
                row.set(val.get());
                val = row.get();
              }
            } else {
              throw new Error("HashedTable, buildHashFromSimple, unexpected type");
            }
            hash += k + ":" + val + "|";
          }
          return hash;
        }
        read(hash) {
          return this.value[hash];
        }
        insert(data) {
          const hash = this.buildHashFromData(data);
          if (this.value[hash] !== void 0) {
            return { value: void 0, subrc: 4 };
          } else {
            const val = this.cloneRow(data);
            for (const loopController of this.loops.values()) {
              loopController.array.push(val);
            }
            this.value[hash] = val;
            return { value: val, subrc: 0 };
          }
        }
        appendThis(data) {
          this.insert(data);
          return this;
        }
        array() {
          const ret = [];
          for (const hash in this.value) {
            ret.push(this.value[hash]);
          }
          return ret;
        }
        startLoop(from, to, array) {
          const l = new LoopController(from, to, array);
          this.loops.add(l);
          return l;
        }
        unregisterLoop(loop2) {
          this.loops.delete(loop2);
        }
        insertIndex(_item, _index) {
          throw new Error("Hash table insert index");
        }
        append(_item) {
          throw new Error("Hash table append");
        }
        getQualifiedName() {
          return this.qualifiedName;
        }
        getOptions() {
          return this.options;
        }
        getRowType() {
          return this.rowType;
        }
        clear() {
          this.value = {};
          this.secondaryIndexes = {};
        }
        set(tab) {
          if (tab instanceof field_symbol_1.FieldSymbol) {
            if (tab.getPointer() === void 0) {
              throw new Error("GETWA_NOT_ASSIGNED");
            }
            return this.set(tab.getPointer());
          }
          if (tab === this) {
            return this;
          }
          this.clear();
          if (tab instanceof Table || tab instanceof _HashedTable) {
            for (const a of tab.array()) {
              this.insert(a);
            }
            return this;
          } else {
            throw new Error("Method not implemented, set hashed table");
          }
        }
        getHeader() {
          if (this.header === void 0) {
            throw "table, getHeader";
          }
          return this.header;
        }
        ///////////////////////////
        cloneRow(item) {
          if (typeof item === "number") {
            const tmp = this.getRowType().clone();
            tmp.set(new integer_1.Integer().set(item));
            return tmp;
          } else if (typeof item === "string") {
            const tmp = this.getRowType().clone();
            tmp.set(new string_1.String().set(item));
            return tmp;
          } else if (this.isStructured === true && item.getQualifiedName && this.rowType.getQualifiedName && item.getQualifiedName() !== "" && item.getQualifiedName() === this.rowType.getQualifiedName()) {
            const val = item.clone();
            return val;
          } else {
            const tmp = this.getRowType().clone();
            tmp.set(item);
            return tmp;
          }
        }
      };
      exports2.HashedTable = HashedTable;
      var Table = class _Table {
        value;
        header;
        rowType;
        loops;
        options;
        qualifiedName;
        isStructured;
        secondaryIndexes;
        constructor(rowType, options, qualifiedName) {
          this.value = [];
          this.secondaryIndexes = {};
          this.loops = /* @__PURE__ */ new Set();
          this.rowType = rowType;
          this.options = options;
          this.isStructured = rowType instanceof structure_1.Structure;
          if (options?.withHeader === true) {
            this.header = this.rowType.clone();
          }
          this.qualifiedName = qualifiedName?.toUpperCase();
        }
        clone() {
          const copy = new _Table(this.rowType, this.options, this.qualifiedName);
          for (const val of this.value) {
            copy.value.push(val.clone());
          }
          return copy;
        }
        getArrayLength() {
          return this.value.length;
        }
        getKeyByName(name) {
          return this.getOptions()?.secondary?.find((s) => s.name.toUpperCase() === name.toUpperCase());
        }
        getSecondaryIndex(name) {
          if (this.secondaryIndexes[name.toUpperCase()]) {
            return this.secondaryIndexes[name.toUpperCase()];
          }
          const secondary = this.getKeyByName(name);
          if (secondary === void 0) {
            throw `Table, secondary key "${name}" not found`;
          }
          const copy = [...this.value];
          (0, sort_1.sort)(copy, { by: secondary.keyFields.map((k) => {
            return { component: k.toLowerCase() };
          }), skipSortedCheck: true });
          this.secondaryIndexes[name.toUpperCase()] = copy;
          return copy;
        }
        getQualifiedName() {
          return this.qualifiedName;
        }
        getOptions() {
          return this.options;
        }
        startLoop(from, to, array) {
          const l = new LoopController(from, to, array);
          this.loops.add(l);
          return l;
        }
        getCurrentLoopIndex() {
          if (this.loops.size !== 1) {
            throw new Error("More than one LOOP");
          }
          return Array.from(this.loops)[0].index;
        }
        unregisterLoop(loop2) {
          this.loops.delete(loop2);
        }
        getRowType() {
          return this.rowType;
        }
        // Modifications to the array must be done inside this class, in order to keep track of LOOP indexes
        array() {
          return this.value;
        }
        clear() {
          this.value = [];
          this.secondaryIndexes = {};
        }
        set(tab) {
          this.secondaryIndexes = {};
          if (this.options?.withHeader === true) {
            this.header?.set(tab);
          } else {
            if (tab instanceof field_symbol_1.FieldSymbol) {
              tab = tab.getPointer();
            }
            if (!(tab instanceof _Table) && !(tab instanceof HashedTable)) {
              throw new Error("Table, set error, " + tab?.constructor.name);
            }
            if (tab === this) {
              return this;
            }
            this.clear();
            (0, insert_internal_1.insertInternal)({ table: this, data: tab, lines: true });
          }
          return this;
        }
        getHeader() {
          if (this.header === void 0) {
            throw new Error("table, getHeader");
          }
          return this.header;
        }
        get() {
          if (this.header === void 0) {
            throw new Error("table, no header line");
          }
          return this.header.get();
        }
        insertIndex(item, index, noClone = false) {
          this.secondaryIndexes = {};
          if (item instanceof field_symbol_1.FieldSymbol) {
            const p = item.getPointer();
            if (p === void 0) {
              throw new Error("insertIndex, fs not assigned");
            }
            this.insertIndex(p, index);
            return p;
          }
          let val;
          if (noClone === false) {
            val = this.cloneRow(item);
          } else {
            val = item;
          }
          if (index === 0) {
            this.value.unshift(val);
          } else if (index === this.value.length) {
            this.value.push(val);
          } else {
            this.value.splice(index, 0, val);
          }
          for (const loopController of this.loops.values()) {
            if (index <= loopController.index) {
              loopController.index++;
            }
          }
          return val;
        }
        /** index = javascript indexed */
        deleteIndex(index) {
          this.secondaryIndexes = {};
          if (index > this.value.length) {
            return;
          }
          if (index === this.value.length - 1) {
            this.value.pop();
          } else if (index === 0) {
            this.value.shift();
          } else {
            this.value.splice(index, 1);
          }
          for (const l of this.loops.values()) {
            if (l.index >= index) {
              l.index--;
            }
          }
        }
        append(item) {
          if (item === void 0) {
            throw new Error("APPEND, item is undefined");
          }
          this.secondaryIndexes = {};
          if (item instanceof field_symbol_1.FieldSymbol) {
            const p = item.getPointer();
            if (p === void 0) {
              throw new Error("APPEND, fs not assigned");
            }
            this.append(p);
            return p;
          } else if (item instanceof data_reference_1.DataReference) {
            const ref = new data_reference_1.DataReference(item.getType());
            ref.assign(item.getPointer());
            this.value.push(ref);
            return ref;
          } else {
            const val = this.cloneRow(item);
            this.value.push(val);
            return val;
          }
        }
        /* appends and returns this */
        appendThis(item) {
          this.append(item);
          return this;
        }
        appendInitial() {
          this.secondaryIndexes = {};
          this.append(this.rowType);
          abap.builtin.sy.get().tabix.set(this.value.length);
          return this.value[this.value.length - 1];
        }
        sort(compareFn) {
          this.value.sort(compareFn);
        }
        ///////////////////////////
        cloneRow(item) {
          if (typeof item === "number") {
            const tmp = this.getRowType().clone();
            tmp.set(new integer_1.Integer().set(item));
            return tmp;
          } else if (typeof item === "string") {
            const tmp = this.getRowType().clone();
            tmp.set(new string_1.String().set(item));
            return tmp;
          } else if (this.isStructured === true && item.getQualifiedName && this.rowType.getQualifiedName && item.getQualifiedName() !== "" && item.getQualifiedName() === this.rowType.getQualifiedName()) {
            const val = item.clone();
            return val;
          } else {
            const tmp = this.getRowType().clone();
            tmp.set(item);
            return tmp;
          }
        }
      };
      exports2.Table = Table;
    }
  });

  // node_modules/@abaplint/runtime/build/src/types/field_symbol.js
  var require_field_symbol = __commonJS({
    "node_modules/@abaplint/runtime/build/src/types/field_symbol.js"(exports2) {
      "use strict";
      Object.defineProperty(exports2, "__esModule", { value: true });
      exports2.FieldSymbol = void 0;
      var table_1 = require_table();
      var string_1 = require_string();
      var hex_1 = require_hex();
      var float_1 = require_float();
      var data_reference_1 = require_data_reference();
      var hex_uint8_1 = require_hex_uint8();
      var FieldSymbol = class {
        pointer;
        casting;
        type;
        constructor(type) {
          this.pointer = void 0;
          this.casting = false;
          this.type = type;
        }
        clone() {
          throw new Error("FieldSymbol cannot be cloned");
        }
        getQualifiedName() {
          return this.type.getQualifiedName();
        }
        assign(pointer) {
          this.pointer = pointer;
        }
        setCasting() {
          this.casting = true;
        }
        unassign() {
          this.pointer = void 0;
        }
        isAssigned() {
          return this.pointer !== void 0;
        }
        getPointer() {
          if (this.casting) {
            return this.get();
          }
          return this.pointer;
        }
        dereference() {
          if (this.pointer instanceof data_reference_1.DataReference) {
            return this.pointer.getPointer();
          } else {
            return this.pointer;
          }
        }
        ///////////////
        clear() {
          return this.pointer?.clear();
        }
        get() {
          if (this.casting) {
            if (this.type instanceof hex_1.Hex || this.type instanceof hex_uint8_1.HexUInt8) {
              const pt = this.pointer;
              if (pt instanceof float_1.Float) {
                const buf = Buffer.allocUnsafe(8);
                buf.writeDoubleLE(pt.getRaw());
                return buf.toString("hex").toUpperCase();
              } else {
                const ret = new string_1.String().set(Buffer.from(this.pointer?.get(), "utf16le").toString("hex"));
                return ret.get();
              }
            } else {
              const ret = new string_1.String().set(Buffer.from(this.pointer?.get(), "hex").toString("utf16le"));
              return ret.get();
            }
          } else {
            return this.pointer?.get();
          }
        }
        appendInitial() {
          if (this.pointer instanceof table_1.Table) {
            return this.pointer.appendInitial();
          }
          return void 0;
        }
        array() {
          return this.pointer?.array();
        }
        getArrayLength() {
          return this.pointer?.getArrayLength();
        }
        set(value) {
          if (this.casting) {
            if (this.type instanceof hex_1.Hex || this.type instanceof hex_uint8_1.HexUInt8) {
              const pt = this.pointer;
              if (pt instanceof float_1.Float) {
                const buf = Buffer.from(value.get(), "hex");
                pt.set(buf.readDoubleLE());
                return;
              }
            }
          }
          this.pointer?.set(value);
          return this;
        }
        getOffset(input) {
          return this.getPointer().getOffset(input);
        }
      };
      exports2.FieldSymbol = FieldSymbol;
    }
  });

  // node_modules/@abaplint/runtime/build/src/types/abap_object.js
  var require_abap_object = __commonJS({
    "node_modules/@abaplint/runtime/build/src/types/abap_object.js"(exports2) {
      "use strict";
      Object.defineProperty(exports2, "__esModule", { value: true });
      exports2.ABAPObject = void 0;
      var field_symbol_1 = require_field_symbol();
      var ABAPObject = class _ABAPObject {
        value;
        qualifiedName;
        RTTIName;
        constructor(input) {
          this.qualifiedName = input?.qualifiedName;
          this.RTTIName = input?.RTTIName;
          this.clear();
        }
        clone() {
          const n = new _ABAPObject({ qualifiedName: this.qualifiedName, RTTIName: this.RTTIName });
          n.value = this.value;
          return n;
        }
        get() {
          return this.value;
        }
        getInternalID() {
          return "OpenABAPInternalObjectId=" + this.value?.INTERNAL_ID;
        }
        clear() {
          this.value = void 0;
        }
        getQualifiedName() {
          return this.qualifiedName;
        }
        getRTTIName() {
          return this.RTTIName;
        }
        set(value) {
          if (value instanceof _ABAPObject) {
            this.value = value.get();
          } else if (value instanceof field_symbol_1.FieldSymbol) {
            this.value = value.getPointer().get();
          } else {
            this.value = value;
          }
          return this;
        }
      };
      exports2.ABAPObject = ABAPObject;
    }
  });

  // node_modules/@abaplint/runtime/build/src/types/_date_helper.js
  var require_date_helper = __commonJS({
    "node_modules/@abaplint/runtime/build/src/types/_date_helper.js"(exports2) {
      "use strict";
      Object.defineProperty(exports2, "__esModule", { value: true });
      exports2.getDateFromNumber = getDateFromNumber;
      exports2.getNumberFromDate = getNumberFromDate;
      function getDateFromNumber(value) {
        const msInOneDay = 24 * 60 * 60 * 1e3;
        const date = new Date(-621355968e5 + value * msInOneDay);
        let removeJulianLeaps = 2;
        if (value <= 577736) {
          let beforeGregorian = date.getFullYear() <= 1582 ? date.getFullYear() : 1582;
          if (date.getMonth() < 1 || date.getMonth() === 1 && date.getDay() < 29) {
            beforeGregorian -= 1;
          }
          removeJulianLeaps = Math.floor(beforeGregorian / 100) - Math.floor(beforeGregorian / 400);
        }
        date.setTime(date.getTime() - removeJulianLeaps * msInOneDay);
        let ret = date.getFullYear().toString().padStart(4, "0");
        ret += (date.getMonth() + 1).toString().padStart(2, "0");
        ret += date.getDate().toString().padStart(2, "0");
        return ret;
      }
      function getNumberFromDate(value) {
        const msInOneDay = 24 * 60 * 60 * 1e3;
        const date = /* @__PURE__ */ new Date(-621355968e5);
        date.setUTCFullYear(parseInt(value.substr(0, 4), 10));
        date.setUTCMonth(parseInt(value.substr(4, 2), 10) - 1);
        date.setUTCDate(parseInt(value.substr(6, 2), 10));
        let days = Math.floor((date.getTime() + 621355968e5) / msInOneDay);
        let addJulianLeaps = 2;
        if (days <= 577736) {
          let beforeGregorian = date.getFullYear() <= 1582 ? date.getFullYear() : 1582;
          if (date.getMonth() < 1 || date.getMonth() === 1 && date.getDay() < 29) {
            beforeGregorian -= 1;
          }
          addJulianLeaps = Math.floor(beforeGregorian / 100) - Math.floor(beforeGregorian / 400);
        }
        days = days + addJulianLeaps;
        return days;
      }
    }
  });

  // node_modules/@abaplint/runtime/build/src/types/date.js
  var require_date = __commonJS({
    "node_modules/@abaplint/runtime/build/src/types/date.js"(exports2) {
      "use strict";
      Object.defineProperty(exports2, "__esModule", { value: true });
      exports2.Date = void 0;
      var string_1 = require_string();
      var _date_helper_1 = require_date_helper();
      var float_1 = require_float();
      var _parse_1 = require_parse();
      var Date2 = class _Date {
        value;
        qualifiedName;
        constructor(input) {
          this.clear();
          this.qualifiedName = input?.qualifiedName;
        }
        clone() {
          const n = new _Date({ qualifiedName: this.qualifiedName });
          n.value = this.value;
          return n;
        }
        getQualifiedName() {
          return this.qualifiedName;
        }
        set(value) {
          if (typeof value === "number") {
            if (value <= 0 || value > 3652060) {
              this.value = "00000000";
            } else {
              this.value = (0, _date_helper_1.getDateFromNumber)(value);
            }
          } else if (value instanceof float_1.Float) {
            this.set(Math.round(value.getRaw()));
          } else if (typeof value === "string") {
            this.value = value;
          } else {
            this.set(value.get());
          }
          if (this.value.length > 8) {
            this.value = this.value.substr(0, 8);
          } else if (this.value.length < 8) {
            this.value = this.value.padEnd(8, " ");
          }
          return this;
        }
        clear() {
          this.value = "00000000";
        }
        get() {
          return this.value;
        }
        getNumeric() {
          return (0, _date_helper_1.getNumberFromDate)(this.value);
        }
        getOffset(input) {
          if (input?.offset) {
            input.offset = (0, _parse_1.parse)(input.offset);
          }
          if (input?.length) {
            input.length = (0, _parse_1.parse)(input.length);
          }
          let ret = this.value;
          if (input?.offset) {
            ret = ret.substr(input.offset);
          }
          if (input?.length !== void 0) {
            ret = ret.substr(0, input.length);
          }
          const r = new string_1.String();
          r.set(ret);
          return r;
        }
      };
      exports2.Date = Date2;
    }
  });

  // node_modules/@abaplint/runtime/build/src/types/decfloat34.js
  var require_decfloat34 = __commonJS({
    "node_modules/@abaplint/runtime/build/src/types/decfloat34.js"(exports2) {
      "use strict";
      Object.defineProperty(exports2, "__esModule", { value: true });
      exports2.DecFloat34 = void 0;
      var _1 = require_types();
      var hex_1 = require_hex();
      var xstring_1 = require_xstring();
      var DecFloat34 = class _DecFloat34 {
        value;
        constructor() {
          this.value = 0;
        }
        clone() {
          const n = new _DecFloat34();
          n.value = this.value;
          return n;
        }
        set(value) {
          if (typeof value === "number") {
            this.value = value;
          } else if (typeof value === "string" && value.trim().length === 0) {
            this.value = 0;
          } else if (typeof value === "string") {
            this.value = parseFloat(value);
          } else if (value instanceof _1.Float) {
            this.value = value.getRaw();
          } else if (value instanceof hex_1.Hex || value instanceof xstring_1.XString) {
            this.set(parseInt(value.get(), 16));
          } else {
            this.set(value.get());
          }
          return this;
        }
        clear() {
          this.value = 0;
        }
        getRaw() {
          return this.value;
        }
        get() {
          let text2 = new Number(this.value).toString();
          text2 = text2.replace(".", ",");
          return text2;
        }
      };
      exports2.DecFloat34 = DecFloat34;
    }
  });

  // node_modules/@abaplint/runtime/build/src/types/numc.js
  var require_numc = __commonJS({
    "node_modules/@abaplint/runtime/build/src/types/numc.js"(exports2) {
      "use strict";
      Object.defineProperty(exports2, "__esModule", { value: true });
      exports2.Numc = void 0;
      var _parse_1 = require_parse();
      var throw_error_1 = require_throw_error();
      var float_1 = require_float();
      var initialValues = {};
      var regexCharacters = /[a-zA-Z]/g;
      var Numc = class _Numc {
        value;
        length;
        qualifiedName;
        constructor(input) {
          this.length = input?.length ? input?.length : 1;
          this.qualifiedName = input?.qualifiedName;
          this.clear();
        }
        clone() {
          const n = new _Numc({ length: this.length, qualifiedName: this.qualifiedName });
          n.value = this.value;
          return n;
        }
        getQualifiedName() {
          return this.qualifiedName;
        }
        set(value, raw = false) {
          if (value instanceof _Numc && value.getLength() === this.length) {
            this.value = value.get();
            return this;
          } else if (typeof value === "number") {
            this.value = Math.trunc(value) + "";
          } else if (typeof value === "string") {
            value = value.trim().replace(regexCharacters, "");
            if (value === "") {
              this.clear();
            } else {
              this.value = parseInt(value, 10) + "";
            }
          } else if (value instanceof float_1.Float) {
            this.value = Math.trunc(value.getRaw()) + "";
          } else {
            this.set(value.get());
            return this;
          }
          if (this.value.length > this.length) {
            this.value = this.value.substr(this.value.length - this.length, this.length);
          } else {
            const pad = this.length - this.value.length;
            if (pad > 0 && raw === false) {
              this.value = "0".repeat(pad) + this.value;
            }
          }
          return this;
        }
        getLength() {
          return this.length;
        }
        clear() {
          if (initialValues[this.length] === void 0) {
            initialValues[this.length] = "0".repeat(this.length);
          }
          this.value = initialValues[this.length];
        }
        get() {
          return this.value;
        }
        getOffset(input) {
          let offset = input?.offset;
          if (offset) {
            offset = (0, _parse_1.parse)(offset);
          }
          let length = input?.length;
          if (length) {
            length = (0, _parse_1.parse)(length);
          }
          if (offset && offset >= this.length || offset && offset < 0 || length && length < 0) {
            (0, throw_error_1.throwError)("CX_SY_RANGE_OUT_OF_BOUNDS");
          }
          let ret = this.value;
          if (offset) {
            ret = ret.substr(offset);
          }
          if (length !== void 0) {
            ret = ret.substr(0, length);
          }
          const r = new _Numc({ length: ret.length });
          r.set(ret);
          return r;
        }
      };
      exports2.Numc = Numc;
    }
  });

  // node_modules/@abaplint/runtime/build/src/types/time.js
  var require_time = __commonJS({
    "node_modules/@abaplint/runtime/build/src/types/time.js"(exports2) {
      "use strict";
      Object.defineProperty(exports2, "__esModule", { value: true });
      exports2.Time = void 0;
      var string_1 = require_string();
      var _1 = require_types();
      var _parse_1 = require_parse();
      var Time = class _Time {
        value;
        qualifiedName;
        constructor(input) {
          this.clear();
          this.qualifiedName = input?.qualifiedName;
        }
        clone() {
          const n = new _Time({ qualifiedName: this.qualifiedName });
          n.value = this.value;
          return n;
        }
        getQualifiedName() {
          return this.qualifiedName;
        }
        set(value) {
          if (typeof value === "number") {
            const date = /* @__PURE__ */ new Date();
            date.setTime(value * 1e3);
            this.value = date.getUTCHours().toString().padStart(2, "0") + date.getUTCMinutes().toString().padStart(2, "0") + date.getUTCSeconds().toString().padStart(2, "0");
          } else if (typeof value === "string") {
            this.value = value;
            if (this.value.length > 6) {
              this.value = this.value.substring(0, 6);
            }
          } else if (value instanceof string_1.String) {
            this.set(value.get().padEnd(6, "0"));
          } else if (value instanceof _1.Float) {
            this.set(Math.round(value.getRaw()));
          } else {
            this.set(value.get());
          }
          return this;
        }
        clear() {
          this.value = "000000";
        }
        get() {
          return this.value;
        }
        getNumeric() {
          const hours = parseInt(this.value.substr(0, 2), 10);
          const minutes = parseInt(this.value.substr(2, 2), 10);
          const seconds = parseInt(this.value.substr(4, 2), 10);
          return hours * 3600 + minutes * 60 + seconds;
        }
        getOffset(input) {
          if (input?.offset) {
            input.offset = (0, _parse_1.parse)(input.offset);
          }
          if (input?.length) {
            input.length = (0, _parse_1.parse)(input.length);
          }
          let ret = this.value;
          if (input?.offset) {
            ret = ret.substr(input.offset);
          }
          if (input?.length !== void 0) {
            ret = ret.substr(0, input.length);
          }
          const r = new string_1.String();
          r.set(ret);
          return r;
        }
      };
      exports2.Time = Time;
    }
  });

  // node_modules/@abaplint/runtime/build/src/types/utc_long.js
  var require_utc_long = __commonJS({
    "node_modules/@abaplint/runtime/build/src/types/utc_long.js"(exports2) {
      "use strict";
      Object.defineProperty(exports2, "__esModule", { value: true });
      exports2.UTCLong = void 0;
      var UTCLong = class _UTCLong {
        value;
        qualifiedName;
        constructor(input) {
          this.clear();
          this.qualifiedName = input?.qualifiedName;
        }
        clone() {
          const n = new _UTCLong({ qualifiedName: this.qualifiedName });
          n.value = this.value;
          return n;
        }
        getQualifiedName() {
          return this.qualifiedName;
        }
        getOffset(_input) {
          throw new Error("Method not implemented, getOffset(), utcLong");
        }
        set(_value) {
          return this;
        }
        clear() {
          this.value = "";
        }
        get() {
          return this.value;
        }
      };
      exports2.UTCLong = UTCLong;
    }
  });

  // node_modules/@abaplint/runtime/build/src/types/index.js
  var require_types = __commonJS({
    "node_modules/@abaplint/runtime/build/src/types/index.js"(exports2) {
      "use strict";
      var __createBinding = exports2 && exports2.__createBinding || (Object.create ? (function(o, m, k, k2) {
        if (k2 === void 0) k2 = k;
        var desc = Object.getOwnPropertyDescriptor(m, k);
        if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
          desc = { enumerable: true, get: function() {
            return m[k];
          } };
        }
        Object.defineProperty(o, k2, desc);
      }) : (function(o, m, k, k2) {
        if (k2 === void 0) k2 = k;
        o[k2] = m[k];
      }));
      var __exportStar = exports2 && exports2.__exportStar || function(m, exports3) {
        for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports3, p)) __createBinding(exports3, m, p);
      };
      Object.defineProperty(exports2, "__esModule", { value: true });
      __exportStar(require_abap_object(), exports2);
      __exportStar(require_character(), exports2);
      __exportStar(require_data_reference(), exports2);
      __exportStar(require_date(), exports2);
      __exportStar(require_decfloat34(), exports2);
      __exportStar(require_field_symbol(), exports2);
      __exportStar(require_float(), exports2);
      __exportStar(require_hex(), exports2);
      __exportStar(require_hex_uint8(), exports2);
      __exportStar(require_integer(), exports2);
      __exportStar(require_integer8(), exports2);
      __exportStar(require_numc(), exports2);
      __exportStar(require_packed(), exports2);
      __exportStar(require_string(), exports2);
      __exportStar(require_structure(), exports2);
      __exportStar(require_table(), exports2);
      __exportStar(require_time(), exports2);
      __exportStar(require_utc_long(), exports2);
      __exportStar(require_xstring(), exports2);
    }
  });

  // node_modules/@abaplint/runtime/build/src/offset_length.js
  var require_offset_length = __commonJS({
    "node_modules/@abaplint/runtime/build/src/offset_length.js"(exports2) {
      "use strict";
      Object.defineProperty(exports2, "__esModule", { value: true });
      exports2.OffsetLength = void 0;
      var types_12 = require_types();
      var OffsetLength = class {
        obj;
        offset;
        length;
        isHex;
        constructor(obj, options) {
          this.obj = obj;
          if (this.obj instanceof types_12.FieldSymbol) {
            this.obj = this.obj.getPointer();
            if (this.obj === void 0) {
              throw new Error("GETWA_NOT_ASSIGNED");
            }
          }
          this.isHex = this.obj instanceof types_12.Hex || this.obj instanceof types_12.XString || this.obj instanceof types_12.HexUInt8;
          if (options.offset) {
            if (typeof options.offset === "number") {
              this.offset = options.offset;
            } else {
              this.offset = options.offset.get();
            }
            if (this.isHex) {
              this.offset *= 2;
            }
          }
          if (options.length) {
            if (typeof options.length === "number") {
              this.length = options.length;
            } else {
              this.length = options.length.get();
            }
            if (this.isHex) {
              this.length *= 2;
            }
          }
        }
        get() {
          if (this.isHex) {
            let offset = this.offset;
            if (offset) {
              offset = offset / 2;
            }
            let length = this.length;
            if (length) {
              length = length / 2;
            }
            return this.obj.getOffset({ offset, length }).get();
          } else {
            return this.obj.getOffset({ offset: this.offset, length: this.length }).get();
          }
        }
        set(value) {
          let val = "";
          if (typeof value === "string") {
            val = value;
          } else if (typeof value === "number") {
            val = value + "";
          } else if (value instanceof types_12.Integer) {
            val = value.get() + "";
            if (this.isHex) {
              val = Number(val).toString(16).toUpperCase();
            }
          } else {
            val = value.get() + "";
          }
          if (this.length) {
            val = val.substr(0, this.length);
            if (this.isHex || this.obj instanceof types_12.Time) {
              val = val.padStart(this.length, "0");
            } else if (val.length < this.length) {
              val = val.padEnd(this.length, " ");
            }
          }
          if (this.isHex === true && this.obj instanceof types_12.HexUInt8) {
            let base = this.offset ? this.offset / 2 : 0;
            for (let current = 0; current < val.length; current += 2) {
              const v = Number.parseInt(val.substr(current, 2), 16);
              this.obj.setOffset(base, v);
              base++;
            }
          } else {
            let old = this.obj instanceof types_12.Structure ? this.obj.getCharacter() : this.obj.get();
            if (this.length && this.offset) {
              old = old.substr(0, this.offset) + val + old.substr(this.offset + this.length);
            } else if (this.length) {
              old = val + old.substr(this.length);
            } else if (this.offset) {
              old = old.substr(0, this.offset) + val;
            }
            this.obj.set(old);
          }
        }
      };
      exports2.OffsetLength = OffsetLength;
    }
  });

  // node_modules/@abaplint/runtime/build/src/statements/append.js
  var require_append = __commonJS({
    "node_modules/@abaplint/runtime/build/src/statements/append.js"(exports2) {
      "use strict";
      Object.defineProperty(exports2, "__esModule", { value: true });
      exports2.append = append;
      var types_12 = require_types();
      function append(input) {
        if (input.target instanceof types_12.FieldSymbol) {
          input.target = input.target.getPointer();
          if (input.target === void 0) {
            throw "Field symbol not assigned";
          }
        }
        if (input.source instanceof types_12.FieldSymbol) {
          input.source = input.source.getPointer();
        }
        if (input.target === void 0) {
          if (!(input.source instanceof types_12.Table)) {
            throw "APPEND, header, table";
          }
          input.source.append(input.source.getHeader());
          abap.builtin.sy.get().tabix.set(input.source.array().length);
          return;
        } else if (input.lines === true && input.source instanceof types_12.Table) {
          let from = 1;
          if (input.from) {
            from = parseInt(input.from.get() + "", 10);
          }
          let to = input.source.array().length;
          if (input.to) {
            to = parseInt(input.to.get() + "", 10);
          }
          let index = 1;
          for (const a of input.source.array()) {
            if (index < from || index > to) {
              index++;
              continue;
            }
            input.target.append(a);
            index++;
          }
        } else {
          const val = input.target.append(input.source);
          if (input.assigning) {
            if (val instanceof types_12.FieldSymbol) {
              input.assigning.assign(val.getPointer());
            } else {
              input.assigning.assign(val);
            }
          } else if (input.referenceInto) {
            if (val instanceof types_12.FieldSymbol) {
              input.referenceInto.assign(val.getPointer());
            } else {
              input.referenceInto.assign(val);
            }
          }
        }
        abap.builtin.sy.get().tabix.set(input.target.array().length);
      }
    }
  });

  // node_modules/@abaplint/runtime/build/src/statements/assert.js
  var require_assert = __commonJS({
    "node_modules/@abaplint/runtime/build/src/statements/assert.js"(exports2) {
      "use strict";
      Object.defineProperty(exports2, "__esModule", { value: true });
      exports2.assert = assert;
      function assert(input) {
        if (input === false) {
          throw new Error("ASSERTION_FAILED");
        }
      }
    }
  });

  // node_modules/@abaplint/runtime/build/src/statements/assign.js
  var require_assign = __commonJS({
    "node_modules/@abaplint/runtime/build/src/statements/assign.js"(exports2) {
      "use strict";
      Object.defineProperty(exports2, "__esModule", { value: true });
      exports2.assign = assign;
      var types_12 = require_types();
      function assign(input) {
        if (input.dynamicName) {
          if (input.dynamicSource instanceof types_12.FieldSymbol) {
            input.dynamicSource = input.dynamicSource.getPointer();
          }
          input.dynamicName = input.dynamicName.trimEnd();
          if (input.dynamicName.includes("->")) {
            if (input.dynamicSource instanceof types_12.ABAPObject || input.dynamicSource instanceof types_12.DataReference) {
              const split = input.dynamicName.split(/->|-/);
              split.shift();
              for (const s of split) {
                if (s === "*") {
                  input.dynamicSource = input.dynamicSource.dereference();
                } else {
                  const source = input.dynamicSource.get();
                  if (source === void 0) {
                    abap.builtin.sy.get().subrc.set(4);
                    return;
                  }
                  input.dynamicSource = source[s.toLowerCase().replace(/[~\\/]/g, "$")];
                }
              }
            } else {
              abap.builtin.sy.get().subrc.set(4);
              return;
            }
          } else if (input.dynamicName.includes("=>")) {
            const split = input.dynamicName.split("=>");
            const clas = abap.Classes[split[0].toUpperCase()];
            if (clas === void 0) {
              abap.builtin.sy.get().subrc.set(4);
              return;
            }
            if (clas[split[1].toLowerCase()] !== void 0) {
              input.target.assign(clas[split[1].toLowerCase()]);
              abap.builtin.sy.get().subrc.set(0);
              return;
            } else if (clas[split[0].toLowerCase() + "$" + split[1].toLowerCase()] !== void 0) {
              input.target.assign(clas[split[0].toLowerCase() + "$" + split[1].toLowerCase()]);
              abap.builtin.sy.get().subrc.set(0);
              return;
            }
          }
          if (input.dynamicSource) {
            input.target.assign(input.dynamicSource);
            abap.builtin.sy.get().subrc.set(0);
          } else {
            abap.builtin.sy.get().subrc.set(4);
          }
        } else if (input.component) {
          if (input.source instanceof types_12.FieldSymbol || input.source instanceof types_12.DataReference) {
            input.source = input.source.getPointer();
            assign(input);
            return;
          } else if (!(input.source instanceof types_12.Structure) && !(input.source instanceof types_12.Table)) {
            abap.builtin.sy.get().subrc.set(4);
            return;
          }
          let component = input.component;
          if (typeof component !== "string") {
            component = component.get();
          }
          if (input.source instanceof types_12.Table) {
            if (input.source.getOptions()?.withHeader === true) {
              input.source = input.source.getHeader();
            } else {
            }
          }
          let result = void 0;
          if (typeof component === "number") {
            if (component === 0) {
              result = input.source;
            } else if (input.source instanceof types_12.Structure) {
              const structure_as_object = input.source.get();
              const keys = Object.keys(structure_as_object);
              const component_name = keys[component - 1];
              result = structure_as_object[component_name];
            }
          } else if (!(input.source instanceof types_12.Table)) {
            const split = component.toLowerCase().trimEnd().split("-");
            result = input.source;
            for (const s of split) {
              result = result.get()[s];
            }
          }
          if (result === void 0) {
            abap.builtin.sy.get().subrc.set(4);
          } else {
            input.target.assign(result);
            abap.builtin.sy.get().subrc.set(0);
          }
        } else {
          if (input.source instanceof types_12.FieldSymbol) {
            const pnt = input.source.getPointer();
            if (pnt === void 0) {
              throw new Error("GETWA_NOT_ASSIGNED");
            }
            input.target.assign(pnt);
            abap.builtin.sy.get().subrc.set(0);
          } else if (input.source === void 0) {
            abap.builtin.sy.get().subrc.set(4);
          } else {
            if (input.source instanceof types_12.Table && input.source.getOptions()?.withHeader === true) {
              input.target.assign(input.source.getHeader());
            } else {
              if (input.casting) {
                input.target.setCasting();
              }
              input.target.assign(input.source);
            }
            abap.builtin.sy.get().subrc.set(0);
          }
        }
      }
    }
  });

  // node_modules/@abaplint/runtime/build/src/statements/commit.js
  var require_commit = __commonJS({
    "node_modules/@abaplint/runtime/build/src/statements/commit.js"(exports2) {
      "use strict";
      Object.defineProperty(exports2, "__esModule", { value: true });
      exports2.commit = commit;
      function commit() {
      }
    }
  });

  // node_modules/@abaplint/runtime/build/src/statements/concatenate.js
  var require_concatenate = __commonJS({
    "node_modules/@abaplint/runtime/build/src/statements/concatenate.js"(exports2) {
      "use strict";
      Object.defineProperty(exports2, "__esModule", { value: true });
      exports2.concatenate = concatenate;
      var types_12 = require_types();
      function concatenate(input) {
        let sep = "";
        if (input.separatedBy) {
          if (typeof input.separatedBy === "string" || typeof input.separatedBy === "number") {
            sep = input.separatedBy.toString();
          } else {
            sep = input.separatedBy.get().toString();
          }
        }
        if (input.lines === true) {
          const list = [];
          const tab = input.source[0];
          if (tab instanceof types_12.Table) {
            for (const l of tab.array()) {
              if (input.respectingBlanks !== true) {
                list.push(l.get().trimEnd());
              } else {
                list.push(l.get());
              }
            }
          }
          input.target.set(list.join(sep));
        } else {
          let result = "";
          for (const source of input.source) {
            let val = "";
            if (source instanceof types_12.Table) {
              throw new Error("concatenate, error: input is table");
            } else if (typeof source === "string" || typeof source === "number") {
              val = source.toString();
            } else if (source instanceof types_12.Character) {
              if (input.respectingBlanks !== true) {
                val = source.getTrimEnd();
              } else {
                val = source.get();
              }
            } else {
              val = source.get().toString();
            }
            result += val + sep;
          }
          if (sep.length > 0 && result.length > 0) {
            result = result.slice(0, result.length - sep.length);
          }
          input.target.set(result);
        }
      }
    }
  });

  // node_modules/@abaplint/runtime/build/src/statements/condense.js
  var require_condense = __commonJS({
    "node_modules/@abaplint/runtime/build/src/statements/condense.js"(exports2) {
      "use strict";
      Object.defineProperty(exports2, "__esModule", { value: true });
      exports2.condense = condense;
      var ENDS_WITH_SPACE = / +$/;
      var BEGINS_WITH_SPACE = /^ +/;
      var ANY_SPACES = / */g;
      var MULTIPLE_SPACES_REGEX = / {2,}/g;
      function condense(input, options) {
        let trimmed = input.get().replace(ENDS_WITH_SPACE, "");
        trimmed = trimmed.replace(BEGINS_WITH_SPACE, "");
        if (options.nogaps) {
          trimmed = trimmed.replace(ANY_SPACES, "");
        } else {
          trimmed = trimmed.replace(MULTIPLE_SPACES_REGEX, " ");
        }
        input.set(trimmed);
      }
    }
  });

  // node_modules/temporal-polyfill/chunks/internal.cjs
  var require_internal = __commonJS({
    "node_modules/temporal-polyfill/chunks/internal.cjs"(exports2) {
      "use strict";
      function clampProp(props, propName, min, max, overflow) {
        return clampEntity(propName, ((props2, propName2) => {
          const propVal = props2[propName2];
          if (void 0 === propVal) {
            throw new TypeError(missingField(propName2));
          }
          return propVal;
        })(props, propName), min, max, overflow);
      }
      function clampEntity(entityName, num, min, max, overflow, choices) {
        const clamped = clampNumber(num, min, max);
        if (overflow && num !== clamped) {
          throw new RangeError(numberOutOfRange(entityName, num, min, max, choices));
        }
        return clamped;
      }
      function isObjectLike(arg) {
        return null !== arg && /object|function/.test(typeof arg);
      }
      function memoize(generator, MapClass = Map) {
        const map = new MapClass();
        return (key, ...otherArgs) => {
          if (map.has(key)) {
            return map.get(key);
          }
          const val = generator(key, ...otherArgs);
          return map.set(key, val), val;
        };
      }
      function createPropDescriptors(propVals, readonly) {
        return mapProps(((value) => ({
          value,
          configurable: 1,
          writable: !readonly
        })), propVals);
      }
      function zipProps(propNamesRev, args) {
        const res = {};
        let i2 = propNamesRev.length;
        for (const arg of args) {
          res[propNamesRev[--i2]] = arg;
        }
        return res;
      }
      function mapProps(transformer, props, extraArg) {
        const res = {};
        for (const propName in props) {
          res[propName] = transformer(props[propName], propName, extraArg);
        }
        return res;
      }
      function mapPropNames(generator, propNames, extraArg) {
        const props = {};
        for (let i2 = 0; i2 < propNames.length; i2++) {
          const propName = propNames[i2];
          props[propName] = generator(propName, i2, extraArg);
        }
        return props;
      }
      function remapProps(oldNames, newNames, oldProps) {
        const newProps = {};
        for (let i2 = 0; i2 < oldNames.length; i2++) {
          newProps[newNames[i2]] = oldProps[oldNames[i2]];
        }
        return newProps;
      }
      function pluckProps(propNames, props) {
        const res = /* @__PURE__ */ Object.create(null);
        for (const propName of propNames) {
          res[propName] = props[propName];
        }
        return res;
      }
      function hasAnyPropsByName(props, names) {
        for (const name of names) {
          if (name in props) {
            return 1;
          }
        }
        return 0;
      }
      function allPropsEqual(propNames, props0, props1) {
        for (const propName of propNames) {
          if (props0[propName] !== props1[propName]) {
            return 0;
          }
        }
        return 1;
      }
      function zeroOutProps(propNames, clearUntilI, props) {
        const copy = {
          ...props
        };
        for (let i2 = 0; i2 < clearUntilI; i2++) {
          copy[propNames[i2]] = 0;
        }
        return copy;
      }
      function bindArgs(f, ...boundArgs) {
        return (...dynamicArgs) => f(...boundArgs, ...dynamicArgs);
      }
      function noop() {
      }
      function capitalize(s) {
        return s[0].toUpperCase() + s.substring(1);
      }
      function sortStrings(strs) {
        return strs.slice().sort();
      }
      function padNumber(digits, num) {
        return String(num).padStart(digits, "0");
      }
      function compareNumbers(a, b) {
        return Math.sign(a - b);
      }
      function clampNumber(num, min, max) {
        return Math.min(Math.max(num, min), max);
      }
      function divModFloor(num, divisor) {
        return [Math.floor(num / divisor), modFloor(num, divisor)];
      }
      function modFloor(num, divisor) {
        return (num % divisor + divisor) % divisor;
      }
      function divModTrunc(num, divisor) {
        return [divTrunc(num, divisor), modTrunc(num, divisor)];
      }
      function divTrunc(num, divisor) {
        return Math.trunc(num / divisor) || 0;
      }
      function modTrunc(num, divisor) {
        return num % divisor || 0;
      }
      function hasHalf(num) {
        return 0.5 === Math.abs(num % 1);
      }
      function givenFieldsToBigNano(fields, largestUnit, fieldNames) {
        let timeNano = 0, days = 0;
        for (let unit = 0; unit <= largestUnit; unit++) {
          const fieldVal = fields[fieldNames[unit]], unitNano = unitNanoMap[unit], unitInDay = nanoInUtcDay / unitNano, [unitDays, leftoverUnits] = divModTrunc(fieldVal, unitInDay);
          timeNano += leftoverUnits * unitNano, days += unitDays;
        }
        const [timeDays, leftoverNano] = divModTrunc(timeNano, nanoInUtcDay);
        return [days + timeDays, leftoverNano];
      }
      function nanoToGivenFields(nano, largestUnit, fieldNames) {
        const fields = {};
        for (let unit = largestUnit; unit >= 0; unit--) {
          const divisor = unitNanoMap[unit];
          fields[fieldNames[unit]] = divTrunc(nano, divisor), nano = modTrunc(nano, divisor);
        }
        return fields;
      }
      function requirePositiveInteger(arg) {
        return requireNumberIsPositive(requireInteger(arg));
      }
      function requireInteger(arg) {
        return requireNumberIsInteger(requireNumber(arg));
      }
      function requirePropDefined(optionName, optionVal) {
        if (null == optionVal) {
          throw new RangeError(missingField(optionName));
        }
        return optionVal;
      }
      function requireObjectLike(arg) {
        if (!isObjectLike(arg)) {
          throw new TypeError(invalidObject);
        }
        return arg;
      }
      function requireType(typeName, arg, entityName = typeName) {
        if (typeof arg !== typeName) {
          throw new TypeError(invalidEntity(entityName, arg));
        }
        return arg;
      }
      function requireNumberIsInteger(num, entityName = "number") {
        if (!Number.isInteger(num)) {
          throw new RangeError(expectedInteger(entityName, num));
        }
        return num || 0;
      }
      function requireNumberIsPositive(num, entityName = "number") {
        if (num <= 0) {
          throw new RangeError(expectedPositive(entityName, num));
        }
        return num;
      }
      function toString(arg) {
        if ("symbol" == typeof arg) {
          throw new TypeError(forbiddenSymbolToString);
        }
        return String(arg);
      }
      function toStringViaPrimitive(arg, entityName) {
        return isObjectLike(arg) ? String(arg) : requireString(arg, entityName);
      }
      function toBigInt(bi) {
        if ("string" == typeof bi) {
          return BigInt(bi);
        }
        if ("bigint" != typeof bi) {
          throw new TypeError(invalidBigInt(bi));
        }
        return bi;
      }
      function toNumber(arg, entityName = "number") {
        if ("bigint" == typeof arg) {
          throw new TypeError(forbiddenBigIntToNumber(entityName));
        }
        if (arg = Number(arg), !Number.isFinite(arg)) {
          throw new RangeError(expectedFinite(entityName, arg));
        }
        return arg;
      }
      function toInteger(arg, entityName) {
        return Math.trunc(toNumber(arg, entityName)) || 0;
      }
      function toStrictInteger(arg, entityName) {
        return requireNumberIsInteger(toNumber(arg, entityName), entityName);
      }
      function toPositiveInteger(arg, entityName) {
        return requireNumberIsPositive(toInteger(arg, entityName), entityName);
      }
      function createBigNano(days, timeNano) {
        let [extraDays, newTimeNano] = divModTrunc(timeNano, nanoInUtcDay), newDays = days + extraDays;
        const newDaysSign = Math.sign(newDays);
        return newDaysSign && newDaysSign === -Math.sign(newTimeNano) && (newDays -= newDaysSign, newTimeNano += newDaysSign * nanoInUtcDay), [newDays, newTimeNano];
      }
      function addBigNanos(a, b, sign = 1) {
        return createBigNano(a[0] + b[0] * sign, a[1] + b[1] * sign);
      }
      function moveBigNano(a, b) {
        return createBigNano(a[0], a[1] + b);
      }
      function diffBigNanos(a, b) {
        return addBigNanos(b, a, -1);
      }
      function compareBigNanos(a, b) {
        return compareNumbers(a[0], b[0]) || compareNumbers(a[1], b[1]);
      }
      function bigNanoOutside(subject, rangeStart, rangeEndExcl) {
        return -1 === compareBigNanos(subject, rangeStart) || 1 === compareBigNanos(subject, rangeEndExcl);
      }
      function bigIntToBigNano(num, multiplierNano = 1) {
        const wholeInDay = BigInt(nanoInUtcDay / multiplierNano);
        return [Number(num / wholeInDay), Number(num % wholeInDay) * multiplierNano];
      }
      function numberToBigNano(num, multiplierNano = 1) {
        const wholeInDay = nanoInUtcDay / multiplierNano, [days, remainder] = divModTrunc(num, wholeInDay);
        return [days, remainder * multiplierNano];
      }
      function bigNanoToBigInt(bigNano, divisorNano = 1) {
        const [days, timeNano] = bigNano, whole = Math.floor(timeNano / divisorNano), wholeInDay = nanoInUtcDay / divisorNano;
        return BigInt(days) * BigInt(wholeInDay) + BigInt(whole);
      }
      function bigNanoToNumber(bigNano, divisorNano = 1, exact) {
        const [days, timeNano] = bigNano, [whole, remainderNano] = divModTrunc(timeNano, divisorNano);
        return days * (nanoInUtcDay / divisorNano) + (whole + (exact ? remainderNano / divisorNano : 0));
      }
      function bigNanoToExactDays(bigNano) {
        return bigNano[0] + bigNano[1] / nanoInUtcDay;
      }
      function divModBigNano(bigNano, divisorNano, divModFunc = divModFloor) {
        const [days, timeNano] = bigNano, [whole, remainderNano] = divModFunc(timeNano, divisorNano);
        return [days * (nanoInUtcDay / divisorNano) + whole, remainderNano];
      }
      function checkIsoYearMonthInBounds(isoFields) {
        return clampProp(isoFields, "isoYear", isoYearMin, isoYearMax, 1), isoFields.isoYear === isoYearMin ? clampProp(isoFields, "isoMonth", 4, 12, 1) : isoFields.isoYear === isoYearMax && clampProp(isoFields, "isoMonth", 1, 9, 1), isoFields;
      }
      function checkIsoDateInBounds(isoFields) {
        return checkIsoDateTimeInBounds({
          ...isoFields,
          ...isoTimeFieldDefaults,
          isoHour: 12
        }), isoFields;
      }
      function checkIsoDateTimeInBounds(isoFields) {
        const isoYear = clampProp(isoFields, "isoYear", isoYearMin, isoYearMax, 1), nudge = isoYear === isoYearMin ? 1 : isoYear === isoYearMax ? -1 : 0;
        return nudge && checkEpochNanoInBounds(isoToEpochNano({
          ...isoFields,
          isoDay: isoFields.isoDay + nudge,
          isoNanosecond: isoFields.isoNanosecond - nudge
        })), isoFields;
      }
      function checkEpochNanoInBounds(epochNano) {
        if (!epochNano || bigNanoOutside(epochNano, epochNanoMin, epochNanoMax)) {
          throw new RangeError(outOfBoundsDate);
        }
        return epochNano;
      }
      function isoTimeFieldsToNano(isoTimeFields) {
        return givenFieldsToBigNano(isoTimeFields, 5, isoTimeFieldNamesAsc)[1];
      }
      function nanoToIsoTimeAndDay(nano) {
        const [dayDelta, timeNano] = divModFloor(nano, nanoInUtcDay);
        return [nanoToGivenFields(timeNano, 5, isoTimeFieldNamesAsc), dayDelta];
      }
      function epochNanoToSec(epochNano) {
        return epochNanoToSecMod(epochNano)[0];
      }
      function epochNanoToSecMod(epochNano) {
        return divModBigNano(epochNano, nanoInSec);
      }
      function isoToEpochMilli(isoDateTimeFields) {
        return isoArgsToEpochMilli(isoDateTimeFields.isoYear, isoDateTimeFields.isoMonth, isoDateTimeFields.isoDay, isoDateTimeFields.isoHour, isoDateTimeFields.isoMinute, isoDateTimeFields.isoSecond, isoDateTimeFields.isoMillisecond);
      }
      function isoToEpochNano(isoFields) {
        const epochMilli = isoToEpochMilli(isoFields);
        if (void 0 !== epochMilli) {
          const [days, milliRemainder] = divModTrunc(epochMilli, milliInDay);
          return [days, milliRemainder * nanoInMilli + (isoFields.isoMicrosecond || 0) * nanoInMicro + (isoFields.isoNanosecond || 0)];
        }
      }
      function isoToEpochNanoWithOffset(isoFields, offsetNano) {
        const [newIsoTimeFields, dayDelta] = nanoToIsoTimeAndDay(isoTimeFieldsToNano(isoFields) - offsetNano);
        return checkEpochNanoInBounds(isoToEpochNano({
          ...isoFields,
          isoDay: isoFields.isoDay + dayDelta,
          ...newIsoTimeFields
        }));
      }
      function isoArgsToEpochSec(...args) {
        return isoArgsToEpochMilli(...args) / milliInSec;
      }
      function isoArgsToEpochMilli(...args) {
        const [legacyDate, daysNudged] = isoToLegacyDate(...args), epochMilli = legacyDate.valueOf();
        if (!isNaN(epochMilli)) {
          return epochMilli - daysNudged * milliInDay;
        }
      }
      function isoToLegacyDate(isoYear, isoMonth = 1, isoDay = 1, isoHour = 0, isoMinute = 0, isoSec = 0, isoMilli = 0) {
        const daysNudged = isoYear === isoYearMin ? 1 : isoYear === isoYearMax ? -1 : 0, legacyDate = /* @__PURE__ */ new Date();
        return legacyDate.setUTCHours(isoHour, isoMinute, isoSec, isoMilli), legacyDate.setUTCFullYear(isoYear, isoMonth - 1, isoDay + daysNudged), [legacyDate, daysNudged];
      }
      function epochNanoToIso(epochNano, offsetNano) {
        let [days, timeNano] = moveBigNano(epochNano, offsetNano);
        timeNano < 0 && (timeNano += nanoInUtcDay, days -= 1);
        const [timeMilli, nanoRemainder] = divModFloor(timeNano, nanoInMilli), [isoMicrosecond, isoNanosecond] = divModFloor(nanoRemainder, nanoInMicro);
        return epochMilliToIso(days * milliInDay + timeMilli, isoMicrosecond, isoNanosecond);
      }
      function epochMilliToIso(epochMilli, isoMicrosecond = 0, isoNanosecond = 0) {
        const daysOver = Math.ceil(Math.max(0, Math.abs(epochMilli) - maxMilli) / milliInDay) * Math.sign(epochMilli), legacyDate = new Date(epochMilli - daysOver * milliInDay);
        return zipProps(isoDateTimeFieldNamesAsc, [legacyDate.getUTCFullYear(), legacyDate.getUTCMonth() + 1, legacyDate.getUTCDate() + daysOver, legacyDate.getUTCHours(), legacyDate.getUTCMinutes(), legacyDate.getUTCSeconds(), legacyDate.getUTCMilliseconds(), isoMicrosecond, isoNanosecond]);
      }
      function hashIntlFormatParts(intlFormat, epochMilli) {
        if (epochMilli < -maxMilli) {
          throw new RangeError(outOfBoundsDate);
        }
        const parts = intlFormat.formatToParts(epochMilli), hash = {};
        for (const part of parts) {
          hash[part.type] = part.value;
        }
        return hash;
      }
      function computeIsoDay(isoFields) {
        return isoFields.isoDay;
      }
      function computeIsoDateParts(isoFields) {
        return [isoFields.isoYear, isoFields.isoMonth, isoFields.isoDay];
      }
      function computeIsoMonthCodeParts(_isoYear, isoMonth) {
        return [isoMonth, 0];
      }
      function computeIsoYearMonthForMonthDay(monthCodeNumber, isLeapMonth) {
        if (!isLeapMonth) {
          return [isoEpochFirstLeapYear, monthCodeNumber];
        }
      }
      function computeIsoFieldsFromParts(year, month, day) {
        return {
          isoYear: year,
          isoMonth: month,
          isoDay: day
        };
      }
      function computeIsoDaysInWeek() {
        return 7;
      }
      function computeIsoMonthsInYear() {
        return isoMonthsInYear;
      }
      function computeIsoDaysInMonth(isoYear, isoMonth) {
        switch (isoMonth) {
          case 2:
            return computeIsoInLeapYear(isoYear) ? 29 : 28;
          case 4:
          case 6:
          case 9:
          case 11:
            return 30;
        }
        return 31;
      }
      function computeIsoDaysInYear(isoYear) {
        return computeIsoInLeapYear(isoYear) ? 366 : 365;
      }
      function computeIsoInLeapYear(isoYear) {
        return isoYear % 4 == 0 && (isoYear % 100 != 0 || isoYear % 400 == 0);
      }
      function computeIsoDayOfWeek(isoDateFields) {
        const [legacyDate, daysNudged] = isoToLegacyDate(isoDateFields.isoYear, isoDateFields.isoMonth, isoDateFields.isoDay);
        return modFloor(legacyDate.getUTCDay() - daysNudged, 7) || 7;
      }
      function computeIsoEraParts(isoFields) {
        return this.id === gregoryCalendarId ? (({ isoYear }) => isoYear < 1 ? ["gregory-inverse", 1 - isoYear] : ["gregory", isoYear])(isoFields) : "japanese" === this.id ? queryJapaneseEraParts(isoFields) : [];
      }
      function checkIsoDateTimeFields(isoDateTimeFields) {
        return checkIsoDateFields(isoDateTimeFields), constrainIsoTimeFields(isoDateTimeFields, 1), isoDateTimeFields;
      }
      function checkIsoDateFields(isoInternals) {
        return constrainIsoDateFields(isoInternals, 1), isoInternals;
      }
      function isIsoDateFieldsValid(isoFields) {
        return allPropsEqual(isoDateFieldNamesAsc, isoFields, constrainIsoDateFields(isoFields));
      }
      function constrainIsoDateFields(isoFields, overflow) {
        const { isoYear } = isoFields, isoMonth = clampProp(isoFields, "isoMonth", 1, computeIsoMonthsInYear(), overflow);
        return {
          isoYear,
          isoMonth,
          isoDay: clampProp(isoFields, "isoDay", 1, computeIsoDaysInMonth(isoYear, isoMonth), overflow)
        };
      }
      function constrainIsoTimeFields(isoTimeFields, overflow) {
        return zipProps(isoTimeFieldNamesAsc, [clampProp(isoTimeFields, "isoHour", 0, 23, overflow), clampProp(isoTimeFields, "isoMinute", 0, 59, overflow), clampProp(isoTimeFields, "isoSecond", 0, 59, overflow), clampProp(isoTimeFields, "isoMillisecond", 0, 999, overflow), clampProp(isoTimeFields, "isoMicrosecond", 0, 999, overflow), clampProp(isoTimeFields, "isoNanosecond", 0, 999, overflow)]);
      }
      function refineOverflowOptions(options) {
        return void 0 === options ? 0 : refineOverflow(requireObjectLike(options));
      }
      function refineZonedFieldOptions(options, defaultOffsetDisambig = 0) {
        options = normalizeOptions(options);
        const epochDisambig = refineEpochDisambig(options), offsetDisambig = refineOffsetDisambig(options, defaultOffsetDisambig);
        return [refineOverflow(options), offsetDisambig, epochDisambig];
      }
      function refineDiffOptions(roundingModeInvert, options, defaultLargestUnit, maxUnit = 9, minUnit = 0, defaultRoundingMode = 4) {
        options = normalizeOptions(options);
        let largestUnit = refineLargestUnit(options, maxUnit, minUnit), roundingInc = parseRoundingIncInteger(options), roundingMode = refineRoundingMode(options, defaultRoundingMode);
        const smallestUnit = refineSmallestUnit(options, maxUnit, minUnit, 1);
        return null == largestUnit ? largestUnit = Math.max(defaultLargestUnit, smallestUnit) : checkLargestSmallestUnit(largestUnit, smallestUnit), roundingInc = refineRoundingInc(roundingInc, smallestUnit, 1), roundingModeInvert && (roundingMode = ((roundingMode2) => roundingMode2 < 4 ? (roundingMode2 + 2) % 4 : roundingMode2)(roundingMode)), [largestUnit, smallestUnit, roundingInc, roundingMode];
      }
      function refineRoundingOptions(options, maxUnit = 6, solarMode) {
        let roundingInc = parseRoundingIncInteger(options = normalizeOptionsOrString(options, smallestUnitStr));
        const roundingMode = refineRoundingMode(options, 7);
        let smallestUnit = refineSmallestUnit(options, maxUnit);
        return smallestUnit = requirePropDefined(smallestUnitStr, smallestUnit), roundingInc = refineRoundingInc(roundingInc, smallestUnit, void 0, solarMode), [smallestUnit, roundingInc, roundingMode];
      }
      function refineRoundingMathOptions(smallestUnit, options, allowManyLargeUnits) {
        let roundingInc = parseRoundingIncInteger(options = normalizeOptionsOrString(options, roundingModeName));
        const roundingMode = refineRoundingMode(options, 7);
        return roundingInc = refineRoundingInc(roundingInc, smallestUnit, allowManyLargeUnits), [roundingInc, roundingMode];
      }
      function refineDateDisplayOptions(options) {
        return refineCalendarDisplay(normalizeOptions(options));
      }
      function refineTimeDisplayOptions(options, maxSmallestUnit) {
        return refineTimeDisplayTuple(normalizeOptions(options), maxSmallestUnit);
      }
      function refineTimeDisplayTuple(options, maxSmallestUnit = 4) {
        const subsecDigits = refineSubsecDigits(options);
        return [refineRoundingMode(options, 4), ...refineSmallestUnitAndSubsecDigits(refineSmallestUnit(options, maxSmallestUnit), subsecDigits)];
      }
      function refineSmallestUnitAndSubsecDigits(smallestUnit, subsecDigits) {
        return null != smallestUnit ? [unitNanoMap[smallestUnit], smallestUnit < 4 ? 9 - 3 * smallestUnit : -1] : [void 0 === subsecDigits ? 1 : 10 ** (9 - subsecDigits), subsecDigits];
      }
      function parseRoundingIncInteger(options) {
        const roundingInc = options[roundingIncName];
        return void 0 === roundingInc ? 1 : toInteger(roundingInc, roundingIncName);
      }
      function refineRoundingInc(roundingInc, smallestUnit, allowManyLargeUnits, solarMode) {
        const upUnitNano = solarMode ? nanoInUtcDay : unitNanoMap[smallestUnit + 1];
        if (upUnitNano) {
          const unitNano = unitNanoMap[smallestUnit];
          if (upUnitNano % ((roundingInc = clampEntity(roundingIncName, roundingInc, 1, upUnitNano / unitNano - (solarMode ? 0 : 1), 1)) * unitNano)) {
            throw new RangeError(invalidEntity(roundingIncName, roundingInc));
          }
        } else {
          roundingInc = clampEntity(roundingIncName, roundingInc, 1, allowManyLargeUnits ? 10 ** 9 : 1, 1);
        }
        return roundingInc;
      }
      function refineSubsecDigits(options) {
        let subsecDigits = options[subsecDigitsName];
        if (void 0 !== subsecDigits) {
          if ("number" != typeof subsecDigits) {
            if ("auto" === toString(subsecDigits)) {
              return;
            }
            throw new RangeError(invalidEntity(subsecDigitsName, subsecDigits));
          }
          subsecDigits = clampEntity(subsecDigitsName, Math.floor(subsecDigits), 0, 9, 1);
        }
        return subsecDigits;
      }
      function normalizeOptions(options) {
        return void 0 === options ? {} : requireObjectLike(options);
      }
      function normalizeOptionsOrString(options, optionName) {
        return "string" == typeof options ? {
          [optionName]: options
        } : requireObjectLike(options);
      }
      function fabricateOverflowOptions(overflow) {
        return {
          overflow: overflowMapNames[overflow]
        };
      }
      function refineUnitOption(optionName, options, maxUnit = 9, minUnit = 0, ensureDefined) {
        let unitStr = options[optionName];
        if (void 0 === unitStr) {
          return ensureDefined ? minUnit : void 0;
        }
        if (unitStr = toString(unitStr), "auto" === unitStr) {
          return ensureDefined ? minUnit : null;
        }
        let unit = unitNameMap[unitStr];
        if (void 0 === unit && (unit = durationFieldIndexes[unitStr]), void 0 === unit) {
          throw new RangeError(invalidChoice(optionName, unitStr, unitNameMap));
        }
        return clampEntity(optionName, unit, minUnit, maxUnit, 1, unitNamesAsc), unit;
      }
      function refineChoiceOption(optionName, enumNameMap, options, defaultChoice = 0) {
        const enumArg = options[optionName];
        if (void 0 === enumArg) {
          return defaultChoice;
        }
        const enumStr = toString(enumArg), enumNum = enumNameMap[enumStr];
        if (void 0 === enumNum) {
          throw new RangeError(invalidChoice(optionName, enumStr, enumNameMap));
        }
        return enumNum;
      }
      function checkLargestSmallestUnit(largestUnit, smallestUnit) {
        if (smallestUnit > largestUnit) {
          throw new RangeError(flippedSmallestLargestUnit);
        }
      }
      function createInstantSlots(epochNano) {
        return {
          branding: InstantBranding,
          epochNanoseconds: epochNano
        };
      }
      function createZonedDateTimeSlots(epochNano, timeZoneId, calendarId) {
        return {
          branding: ZonedDateTimeBranding,
          calendar: calendarId,
          timeZone: timeZoneId,
          epochNanoseconds: epochNano
        };
      }
      function createPlainDateTimeSlots(isoFields, calendar = isoFields.calendar) {
        return {
          branding: PlainDateTimeBranding,
          calendar,
          ...pluckProps(isoDateTimeFieldNamesAlpha, isoFields)
        };
      }
      function createPlainDateSlots(isoFields, calendar = isoFields.calendar) {
        return {
          branding: PlainDateBranding,
          calendar,
          ...pluckProps(isoDateFieldNamesAlpha, isoFields)
        };
      }
      function createPlainYearMonthSlots(isoFields, calendar = isoFields.calendar) {
        return {
          branding: PlainYearMonthBranding,
          calendar,
          ...pluckProps(isoDateFieldNamesAlpha, isoFields)
        };
      }
      function createPlainMonthDaySlots(isoFields, calendar = isoFields.calendar) {
        return {
          branding: PlainMonthDayBranding,
          calendar,
          ...pluckProps(isoDateFieldNamesAlpha, isoFields)
        };
      }
      function createPlainTimeSlots(isoFields) {
        return {
          branding: PlainTimeBranding,
          ...pluckProps(isoTimeFieldNamesAlpha, isoFields)
        };
      }
      function createDurationSlots(durationFields) {
        return {
          branding: DurationBranding,
          sign: computeDurationSign(durationFields),
          ...pluckProps(durationFieldNamesAlpha, durationFields)
        };
      }
      function getEpochMilli(slots) {
        return divModBigNano(slots.epochNanoseconds, nanoInMilli)[0];
      }
      function extractEpochNano(slots) {
        return slots.epochNanoseconds;
      }
      function totalRelativeDuration(durationFields, endEpochNano, totalUnit, calendarOps, marker, markerToEpochNano, moveMarker) {
        const sign = computeDurationSign(durationFields), [epochNano0, epochNano1] = clampRelativeDuration(calendarOps, clearDurationFields(totalUnit, durationFields), totalUnit, sign, marker, markerToEpochNano, moveMarker), frac = computeEpochNanoFrac(endEpochNano, epochNano0, epochNano1);
        return durationFields[durationFieldNamesAsc[totalUnit]] + frac * sign;
      }
      function totalDayTimeDuration(durationFields, totalUnit) {
        return bigNanoToNumber(durationFieldsToBigNano(durationFields), unitNanoMap[totalUnit], 1);
      }
      function clampRelativeDuration(calendarOps, durationFields, clampUnit, clampDistance, marker, markerToEpochNano, moveMarker) {
        const unitName = durationFieldNamesAsc[clampUnit], durationPlusDistance = {
          ...durationFields,
          [unitName]: durationFields[unitName] + clampDistance
        }, marker0 = moveMarker(calendarOps, marker, durationFields), marker1 = moveMarker(calendarOps, marker, durationPlusDistance);
        return [markerToEpochNano(marker0), markerToEpochNano(marker1)];
      }
      function computeEpochNanoFrac(epochNanoProgress, epochNano0, epochNano1) {
        const denom = bigNanoToNumber(diffBigNanos(epochNano0, epochNano1));
        if (!denom) {
          throw new RangeError(invalidProtocolResults);
        }
        return bigNanoToNumber(diffBigNanos(epochNano0, epochNanoProgress)) / denom;
      }
      function alignZonedEpoch(computeAlignment, timeZoneOps, slots) {
        return getStartOfDayInstantFor(timeZoneOps, computeAlignment(zonedEpochSlotsToIso(slots, timeZoneOps)));
      }
      function roundZonedEpochToInterval(computeInterval, timeZoneOps, slots, roundingMode) {
        const isoSlots = zonedEpochSlotsToIso(slots, timeZoneOps), [isoFields0, isoFields1] = computeInterval(isoSlots), epochNano = slots.epochNanoseconds, epochNano0 = getStartOfDayInstantFor(timeZoneOps, isoFields0), epochNano1 = getStartOfDayInstantFor(timeZoneOps, isoFields1);
        if (bigNanoOutside(epochNano, epochNano0, epochNano1)) {
          throw new RangeError(invalidProtocolResults);
        }
        return roundWithMode(computeEpochNanoFrac(epochNano, epochNano0, epochNano1), roundingMode) ? epochNano1 : epochNano0;
      }
      function roundDateTime(isoFields, smallestUnit, roundingInc, roundingMode) {
        return roundDateTimeToNano(isoFields, computeNanoInc(smallestUnit, roundingInc), roundingMode);
      }
      function roundDateTimeToNano(isoFields, nanoInc, roundingMode) {
        const [roundedIsoFields, dayDelta] = roundTimeToNano(isoFields, nanoInc, roundingMode);
        return checkIsoDateTimeInBounds({
          ...moveByDays(isoFields, dayDelta),
          ...roundedIsoFields
        });
      }
      function roundTimeToNano(isoFields, nanoInc, roundingMode) {
        return nanoToIsoTimeAndDay(roundByInc(isoTimeFieldsToNano(isoFields), nanoInc, roundingMode));
      }
      function roundToMinute(offsetNano) {
        return roundByInc(offsetNano, nanoInMinute, 7);
      }
      function computeNanoInc(smallestUnit, roundingInc) {
        return unitNanoMap[smallestUnit] * roundingInc;
      }
      function computeDayInterval(isoFields) {
        const isoFields0 = computeDayFloor(isoFields);
        return [isoFields0, moveByDays(isoFields0, 1)];
      }
      function computeDayFloor(isoFields) {
        return clearIsoFields(6, isoFields);
      }
      function roundDayTimeDurationByInc(durationFields, nanoInc, roundingMode) {
        const maxUnit = Math.min(getMaxDurationUnit(durationFields), 6);
        return nanoToDurationDayTimeFields(roundBigNanoByInc(durationFieldsToBigNano(durationFields, maxUnit), nanoInc, roundingMode), maxUnit);
      }
      function roundRelativeDuration(durationFields, endEpochNano, largestUnit, smallestUnit, roundingInc, roundingMode, calendarOps, marker, markerToEpochNano, moveMarker) {
        if (0 === smallestUnit && 1 === roundingInc) {
          return durationFields;
        }
        const nudgeFunc = isUniformUnit(smallestUnit, marker) ? isZonedEpochSlots(marker) && smallestUnit < 6 && largestUnit >= 6 ? nudgeZonedTimeDuration : nudgeDayTimeDuration : nudgeRelativeDuration;
        let [roundedDurationFields, roundedEpochNano, grewBigUnit] = nudgeFunc(durationFields, endEpochNano, largestUnit, smallestUnit, roundingInc, roundingMode, calendarOps, marker, markerToEpochNano, moveMarker);
        return grewBigUnit && 7 !== smallestUnit && (roundedDurationFields = ((durationFields2, endEpochNano2, largestUnit2, smallestUnit2, calendarOps2, marker2, markerToEpochNano2, moveMarker2) => {
          const sign = computeDurationSign(durationFields2);
          for (let currentUnit = smallestUnit2 + 1; currentUnit <= largestUnit2; currentUnit++) {
            if (7 === currentUnit && 7 !== largestUnit2) {
              continue;
            }
            const baseDurationFields = clearDurationFields(currentUnit, durationFields2);
            baseDurationFields[durationFieldNamesAsc[currentUnit]] += sign;
            const beyondThresholdNano = bigNanoToNumber(diffBigNanos(markerToEpochNano2(moveMarker2(calendarOps2, marker2, baseDurationFields)), endEpochNano2));
            if (beyondThresholdNano && Math.sign(beyondThresholdNano) !== sign) {
              break;
            }
            durationFields2 = baseDurationFields;
          }
          return durationFields2;
        })(roundedDurationFields, roundedEpochNano, largestUnit, Math.max(6, smallestUnit), calendarOps, marker, markerToEpochNano, moveMarker)), roundedDurationFields;
      }
      function roundBigNano(bigNano, smallestUnit, roundingInc, roundingMode, useDayOrigin) {
        return 6 === smallestUnit ? [roundByInc(bigNanoToExactDays(bigNano), roundingInc, roundingMode), 0] : roundBigNanoByInc(bigNano, computeNanoInc(smallestUnit, roundingInc), roundingMode, useDayOrigin);
      }
      function roundBigNanoByInc(bigNano, nanoInc, roundingMode, useDayOrigin) {
        let [days, timeNano] = bigNano;
        useDayOrigin && timeNano < 0 && (timeNano += nanoInUtcDay, days -= 1);
        const [dayDelta, roundedTimeNano] = divModFloor(roundByInc(timeNano, nanoInc, roundingMode), nanoInUtcDay);
        return createBigNano(days + dayDelta, roundedTimeNano);
      }
      function roundByInc(num, inc, roundingMode) {
        return roundWithMode(num / inc, roundingMode) * inc;
      }
      function roundWithMode(num, roundingMode) {
        return roundingModeFuncs[roundingMode](num);
      }
      function nudgeDayTimeDuration(durationFields, endEpochNano, largestUnit, smallestUnit, roundingInc, roundingMode) {
        const sign = computeDurationSign(durationFields), bigNano = durationFieldsToBigNano(durationFields), roundedBigNano = roundBigNano(bigNano, smallestUnit, roundingInc, roundingMode), nanoDiff = diffBigNanos(bigNano, roundedBigNano), expandedBigUnit = Math.sign(roundedBigNano[0] - bigNano[0]) === sign, roundedDayTimeFields = nanoToDurationDayTimeFields(roundedBigNano, Math.min(largestUnit, 6));
        return [{
          ...durationFields,
          ...roundedDayTimeFields
        }, addBigNanos(endEpochNano, nanoDiff), expandedBigUnit];
      }
      function nudgeZonedTimeDuration(durationFields, endEpochNano, _largestUnit, smallestUnit, roundingInc, roundingMode, calendarOps, marker, markerToEpochNano, moveMarker) {
        const sign = computeDurationSign(durationFields) || 1, timeNano = bigNanoToNumber(durationFieldsToBigNano(durationFields, 5)), nanoInc = computeNanoInc(smallestUnit, roundingInc);
        let roundedTimeNano = roundByInc(timeNano, nanoInc, roundingMode);
        const [dayEpochNano0, dayEpochNano1] = clampRelativeDuration(calendarOps, {
          ...durationFields,
          ...durationTimeFieldDefaults
        }, 6, sign, marker, markerToEpochNano, moveMarker), beyondDayNano = roundedTimeNano - bigNanoToNumber(diffBigNanos(dayEpochNano0, dayEpochNano1));
        let dayDelta = 0;
        beyondDayNano && Math.sign(beyondDayNano) !== sign ? endEpochNano = moveBigNano(dayEpochNano0, roundedTimeNano) : (dayDelta += sign, roundedTimeNano = roundByInc(beyondDayNano, nanoInc, roundingMode), endEpochNano = moveBigNano(dayEpochNano1, roundedTimeNano));
        const durationTimeFields = nanoToDurationTimeFields(roundedTimeNano);
        return [{
          ...durationFields,
          ...durationTimeFields,
          days: durationFields.days + dayDelta
        }, endEpochNano, Boolean(dayDelta)];
      }
      function nudgeRelativeDuration(durationFields, endEpochNano, _largestUnit, smallestUnit, roundingInc, roundingMode, calendarOps, marker, markerToEpochNano, moveMarker) {
        const sign = computeDurationSign(durationFields), smallestUnitFieldName = durationFieldNamesAsc[smallestUnit], baseDurationFields = clearDurationFields(smallestUnit, durationFields);
        7 === smallestUnit && (durationFields = {
          ...durationFields,
          weeks: durationFields.weeks + Math.trunc(durationFields.days / 7)
        });
        const truncedVal = divTrunc(durationFields[smallestUnitFieldName], roundingInc) * roundingInc;
        baseDurationFields[smallestUnitFieldName] = truncedVal;
        const [epochNano0, epochNano1] = clampRelativeDuration(calendarOps, baseDurationFields, smallestUnit, roundingInc * sign, marker, markerToEpochNano, moveMarker), exactVal = truncedVal + computeEpochNanoFrac(endEpochNano, epochNano0, epochNano1) * sign * roundingInc, roundedVal = roundByInc(exactVal, roundingInc, roundingMode), expanded = Math.sign(roundedVal - exactVal) === sign;
        return baseDurationFields[smallestUnitFieldName] = roundedVal, [baseDurationFields, expanded ? epochNano1 : epochNano0, expanded];
      }
      function formatDateLikeIso(calendarId, formatSimple, isoFields, calendarDisplay) {
        const showCalendar = calendarDisplay > 1 || 0 === calendarDisplay && calendarId !== isoCalendarId;
        return 1 === calendarDisplay ? calendarId === isoCalendarId ? formatSimple(isoFields) : formatIsoDateFields(isoFields) : showCalendar ? formatIsoDateFields(isoFields) + formatCalendarId(calendarId, 2 === calendarDisplay) : formatSimple(isoFields);
      }
      function formatDurationFragments(fragObj) {
        const parts = [];
        for (const fragName in fragObj) {
          const fragVal = fragObj[fragName];
          fragVal && parts.push(fragVal, fragName);
        }
        return parts.join("");
      }
      function formatIsoDateTimeFields(isoDateTimeFields, subsecDigits) {
        return formatIsoDateFields(isoDateTimeFields) + "T" + formatIsoTimeFields(isoDateTimeFields, subsecDigits);
      }
      function formatIsoDateFields(isoDateFields) {
        return formatIsoYearMonthFields(isoDateFields) + "-" + padNumber2(isoDateFields.isoDay);
      }
      function formatIsoYearMonthFields(isoDateFields) {
        const { isoYear } = isoDateFields;
        return (isoYear < 0 || isoYear > 9999 ? getSignStr(isoYear) + padNumber(6, Math.abs(isoYear)) : padNumber(4, isoYear)) + "-" + padNumber2(isoDateFields.isoMonth);
      }
      function formatIsoMonthDayFields(isoDateFields) {
        return padNumber2(isoDateFields.isoMonth) + "-" + padNumber2(isoDateFields.isoDay);
      }
      function formatIsoTimeFields(isoTimeFields, subsecDigits) {
        const parts = [padNumber2(isoTimeFields.isoHour), padNumber2(isoTimeFields.isoMinute)];
        return -1 !== subsecDigits && parts.push(padNumber2(isoTimeFields.isoSecond) + ((isoMillisecond, isoMicrosecond, isoNanosecond, subsecDigits2) => formatSubsecNano(isoMillisecond * nanoInMilli + isoMicrosecond * nanoInMicro + isoNanosecond, subsecDigits2))(isoTimeFields.isoMillisecond, isoTimeFields.isoMicrosecond, isoTimeFields.isoNanosecond, subsecDigits)), parts.join(":");
      }
      function formatOffsetNano(offsetNano, offsetDisplay = 0) {
        if (1 === offsetDisplay) {
          return "";
        }
        const [hour, nanoRemainder0] = divModFloor(Math.abs(offsetNano), nanoInHour), [minute, nanoRemainder1] = divModFloor(nanoRemainder0, nanoInMinute), [second, nanoRemainder2] = divModFloor(nanoRemainder1, nanoInSec);
        return getSignStr(offsetNano) + padNumber2(hour) + ":" + padNumber2(minute) + (second || nanoRemainder2 ? ":" + padNumber2(second) + formatSubsecNano(nanoRemainder2) : "");
      }
      function formatCalendar(calendarId, calendarDisplay) {
        return 1 !== calendarDisplay && (calendarDisplay > 1 || 0 === calendarDisplay && calendarId !== isoCalendarId) ? formatCalendarId(calendarId, 2 === calendarDisplay) : "";
      }
      function formatCalendarId(calendarId, isCritical) {
        return "[" + (isCritical ? "!" : "") + "u-ca=" + calendarId + "]";
      }
      function formatSubsecNano(totalNano, subsecDigits) {
        let s = padNumber(9, totalNano);
        return s = void 0 === subsecDigits ? s.replace(trailingZerosRE, "") : s.slice(0, subsecDigits), s ? "." + s : "";
      }
      function getSignStr(num) {
        return num < 0 ? "-" : "+";
      }
      function formatDurationNumber(n, force) {
        return n || force ? n.toLocaleString("fullwide", {
          useGrouping: 0
        }) : "";
      }
      function getMatchingInstantFor(timeZoneOps, isoFields, offsetNano, offsetDisambig = 0, epochDisambig = 0, epochFuzzy, hasZ) {
        if (void 0 !== offsetNano && 1 === offsetDisambig && (1 === offsetDisambig || hasZ)) {
          return isoToEpochNanoWithOffset(isoFields, offsetNano);
        }
        const possibleEpochNanos = timeZoneOps.getPossibleInstantsFor(isoFields);
        if (void 0 !== offsetNano && 3 !== offsetDisambig) {
          const matchingEpochNano = ((possibleEpochNanos2, isoDateTimeFields, offsetNano2, fuzzy) => {
            const zonedEpochNano = isoToEpochNano(isoDateTimeFields);
            fuzzy && (offsetNano2 = roundToMinute(offsetNano2));
            for (const possibleEpochNano of possibleEpochNanos2) {
              let possibleOffsetNano = bigNanoToNumber(diffBigNanos(possibleEpochNano, zonedEpochNano));
              if (fuzzy && (possibleOffsetNano = roundToMinute(possibleOffsetNano)), possibleOffsetNano === offsetNano2) {
                return possibleEpochNano;
              }
            }
          })(possibleEpochNanos, isoFields, offsetNano, epochFuzzy);
          if (void 0 !== matchingEpochNano) {
            return matchingEpochNano;
          }
          if (0 === offsetDisambig) {
            throw new RangeError(invalidOffsetForTimeZone);
          }
        }
        return hasZ ? isoToEpochNano(isoFields) : getSingleInstantFor(timeZoneOps, isoFields, epochDisambig, possibleEpochNanos);
      }
      function getSingleInstantFor(timeZoneOps, isoFields, disambig = 0, possibleEpochNanos = timeZoneOps.getPossibleInstantsFor(isoFields)) {
        if (1 === possibleEpochNanos.length) {
          return possibleEpochNanos[0];
        }
        if (1 === disambig) {
          throw new RangeError(ambigOffset);
        }
        if (possibleEpochNanos.length) {
          return possibleEpochNanos[3 === disambig ? 1 : 0];
        }
        const zonedEpochNano = isoToEpochNano(isoFields), gapNano = ((timeZoneOps2, zonedEpochNano2) => {
          const startOffsetNano = timeZoneOps2.getOffsetNanosecondsFor(moveBigNano(zonedEpochNano2, -nanoInUtcDay));
          return ((gapNano2) => {
            if (gapNano2 > nanoInUtcDay) {
              throw new RangeError(outOfBoundsDstGap);
            }
            return gapNano2;
          })(timeZoneOps2.getOffsetNanosecondsFor(moveBigNano(zonedEpochNano2, nanoInUtcDay)) - startOffsetNano);
        })(timeZoneOps, zonedEpochNano), shiftNano = gapNano * (2 === disambig ? -1 : 1);
        return (possibleEpochNanos = timeZoneOps.getPossibleInstantsFor(epochNanoToIso(zonedEpochNano, shiftNano)))[2 === disambig ? 0 : possibleEpochNanos.length - 1];
      }
      function getStartOfDayInstantFor(timeZoneOps, isoFields) {
        const possibleEpochNanos = timeZoneOps.getPossibleInstantsFor(isoFields);
        if (possibleEpochNanos.length) {
          return possibleEpochNanos[0];
        }
        const zonedEpochNanoDayBefore = moveBigNano(isoToEpochNano(isoFields), -nanoInUtcDay);
        return timeZoneOps.getTransition(zonedEpochNanoDayBefore, 1);
      }
      function moveZonedEpochs(timeZoneOps, calendarOps, slots, durationFields, options) {
        const timeOnlyNano = durationFieldsToBigNano(durationFields, 5);
        let epochNano = slots.epochNanoseconds;
        if (durationHasDateParts(durationFields)) {
          const isoDateTimeFields = zonedEpochSlotsToIso(slots, timeZoneOps);
          epochNano = addBigNanos(getSingleInstantFor(timeZoneOps, {
            ...moveDate(calendarOps, isoDateTimeFields, {
              ...durationFields,
              ...durationTimeFieldDefaults
            }, options),
            ...pluckProps(isoTimeFieldNamesAsc, isoDateTimeFields)
          }), timeOnlyNano);
        } else {
          epochNano = addBigNanos(epochNano, timeOnlyNano), refineOverflowOptions(options);
        }
        return {
          epochNanoseconds: checkEpochNanoInBounds(epochNano)
        };
      }
      function moveDateTime(calendarOps, isoDateTimeFields, durationFields, options) {
        const [movedIsoTimeFields, dayDelta] = moveTime(isoDateTimeFields, durationFields);
        return checkIsoDateTimeInBounds({
          ...moveDate(calendarOps, isoDateTimeFields, {
            ...durationFields,
            ...durationTimeFieldDefaults,
            days: durationFields.days + dayDelta
          }, options),
          ...movedIsoTimeFields
        });
      }
      function moveDate(calendarOps, isoDateFields, durationFields, options) {
        if (durationFields.years || durationFields.months || durationFields.weeks) {
          return calendarOps.dateAdd(isoDateFields, durationFields, options);
        }
        refineOverflowOptions(options);
        const days = durationFields.days + durationFieldsToBigNano(durationFields, 5)[0];
        return days ? checkIsoDateInBounds(moveByDays(isoDateFields, days)) : isoDateFields;
      }
      function moveToDayOfMonthUnsafe(calendarOps, isoFields, dayOfMonth = 1) {
        return moveByDays(isoFields, dayOfMonth - calendarOps.day(isoFields));
      }
      function moveTime(isoFields, durationFields) {
        const [durDays, durTimeNano] = durationFieldsToBigNano(durationFields, 5), [newIsoFields, overflowDays] = nanoToIsoTimeAndDay(isoTimeFieldsToNano(isoFields) + durTimeNano);
        return [newIsoFields, durDays + overflowDays];
      }
      function nativeDateAdd(isoDateFields, durationFields, options) {
        const overflow = refineOverflowOptions(options);
        let epochMilli, { years, months, weeks, days } = durationFields;
        if (days += durationFieldsToBigNano(durationFields, 5)[0], years || months) {
          epochMilli = nativeYearMonthAdd(this, isoDateFields, years, months, overflow);
        } else {
          if (!weeks && !days) {
            return isoDateFields;
          }
          epochMilli = isoToEpochMilli(isoDateFields);
        }
        if (void 0 === epochMilli) {
          throw new RangeError(outOfBoundsDate);
        }
        return epochMilli += (7 * weeks + days) * milliInDay, checkIsoDateInBounds(epochMilliToIso(epochMilli));
      }
      function nativeYearMonthAdd(moveOps, isoDateFields, years, months, overflow) {
        let [year, month, day] = moveOps.dateParts(isoDateFields);
        if (years) {
          const [monthCodeNumber, isLeapMonth] = moveOps.monthCodeParts(year, month);
          year += years, month = monthCodeNumberToMonth(monthCodeNumber, isLeapMonth, moveOps.leapMonth(year)), month = clampEntity("month", month, 1, moveOps.monthsInYearPart(year), overflow);
        }
        return months && ([year, month] = moveOps.monthAdd(year, month, months)), day = clampEntity("day", day, 1, moveOps.daysInMonthParts(year, month), overflow), moveOps.epochMilli(year, month, day);
      }
      function isoMonthAdd(year, month, monthDelta) {
        return year += divTrunc(monthDelta, isoMonthsInYear), (month += modTrunc(monthDelta, isoMonthsInYear)) < 1 ? (year--, month += isoMonthsInYear) : month > isoMonthsInYear && (year++, month -= isoMonthsInYear), [year, month];
      }
      function intlMonthAdd(year, month, monthDelta) {
        if (monthDelta) {
          if (month += monthDelta, !Number.isSafeInteger(month)) {
            throw new RangeError(outOfBoundsDate);
          }
          if (monthDelta < 0) {
            for (; month < 1; ) {
              month += computeIntlMonthsInYear.call(this, --year);
            }
          } else {
            let monthsInYear;
            for (; month > (monthsInYear = computeIntlMonthsInYear.call(this, year)); ) {
              month -= monthsInYear, year++;
            }
          }
        }
        return [year, month];
      }
      function moveByDays(isoFields, days) {
        return days ? {
          ...isoFields,
          ...epochMilliToIso(isoToEpochMilli(isoFields) + days * milliInDay)
        } : isoFields;
      }
      function createMarkerSystem(getCalendarOps, getTimeZoneOps, relativeToSlots) {
        const calendarOps = getCalendarOps(relativeToSlots.calendar);
        return isZonedEpochSlots(relativeToSlots) ? [relativeToSlots, calendarOps, getTimeZoneOps(relativeToSlots.timeZone)] : [{
          ...relativeToSlots,
          ...isoTimeFieldDefaults
        }, calendarOps];
      }
      function createMarkerToEpochNano(timeZoneOps) {
        return timeZoneOps ? extractEpochNano : isoToEpochNano;
      }
      function createMoveMarker(timeZoneOps) {
        return timeZoneOps ? bindArgs(moveZonedEpochs, timeZoneOps) : moveDateTime;
      }
      function createDiffMarkers(timeZoneOps) {
        return timeZoneOps ? bindArgs(diffZonedEpochsExact, timeZoneOps) : diffDateTimesExact;
      }
      function isZonedEpochSlots(marker) {
        return marker && marker.epochNanoseconds;
      }
      function isUniformUnit(unit, marker) {
        return unit <= 6 - (isZonedEpochSlots(marker) ? 1 : 0);
      }
      function negateDuration(slots) {
        return createDurationSlots(negateDurationFields(slots));
      }
      function negateDurationFields(fields) {
        const res = {};
        for (const fieldName of durationFieldNamesAsc) {
          res[fieldName] = -1 * fields[fieldName] || 0;
        }
        return res;
      }
      function computeDurationSign(fields, fieldNames = durationFieldNamesAsc) {
        let sign = 0;
        for (const fieldName of fieldNames) {
          const fieldSign = Math.sign(fields[fieldName]);
          if (fieldSign) {
            if (sign && sign !== fieldSign) {
              throw new RangeError(forbiddenDurationSigns);
            }
            sign = fieldSign;
          }
        }
        return sign;
      }
      function checkDurationUnits(fields) {
        for (const calendarUnit of durationCalendarFieldNamesAsc) {
          clampEntity(calendarUnit, fields[calendarUnit], -maxCalendarUnit, maxCalendarUnit, 1);
        }
        return checkDurationTimeUnit(bigNanoToNumber(durationFieldsToBigNano(fields), nanoInSec)), fields;
      }
      function checkDurationTimeUnit(n) {
        if (!Number.isSafeInteger(n)) {
          throw new RangeError(outOfBoundsDuration);
        }
      }
      function durationFieldsToBigNano(fields, largestUnit = 6) {
        return givenFieldsToBigNano(fields, largestUnit, durationFieldNamesAsc);
      }
      function nanoToDurationDayTimeFields(bigNano, largestUnit = 6) {
        const [days, timeNano] = bigNano, dayTimeFields = nanoToGivenFields(timeNano, largestUnit, durationFieldNamesAsc);
        if (dayTimeFields[durationFieldNamesAsc[largestUnit]] += days * (nanoInUtcDay / unitNanoMap[largestUnit]), !Number.isFinite(dayTimeFields[durationFieldNamesAsc[largestUnit]])) {
          throw new RangeError(outOfBoundsDate);
        }
        return dayTimeFields;
      }
      function nanoToDurationTimeFields(nano, largestUnit = 5) {
        return nanoToGivenFields(nano, largestUnit, durationFieldNamesAsc);
      }
      function durationHasDateParts(fields) {
        return Boolean(computeDurationSign(fields, durationDateFieldNamesAsc));
      }
      function getMaxDurationUnit(fields) {
        let unit = 9;
        for (; unit > 0 && !fields[durationFieldNamesAsc[unit]]; unit--) {
        }
        return unit;
      }
      function createSplitTuple(startEpochSec, endEpochSec) {
        return [startEpochSec, endEpochSec];
      }
      function computePeriod(epochSec) {
        const startEpochSec = Math.floor(epochSec / periodDur) * periodDur;
        return [startEpochSec, startEpochSec + periodDur];
      }
      function parseOffsetNano(s) {
        const offsetNano = parseOffsetNanoMaybe(s);
        if (void 0 === offsetNano) {
          throw new RangeError(failedParse(s));
        }
        return offsetNano;
      }
      function parsePlainDate(s, isPlainYearMonth, isPlainMonthDay) {
        let organized = parseDateTimeLike(requireString(s));
        if (!organized || organized.hasZ) {
          throw new RangeError(failedParse(s));
        }
        return isPlainYearMonth ? organized.calendar === isoCalendarId && (organized = -271821 === organized.isoYear && 4 === organized.isoMonth ? {
          ...organized,
          isoDay: 20,
          ...isoTimeFieldDefaults
        } : {
          ...organized,
          isoDay: 1,
          ...isoTimeFieldDefaults
        }) : isPlainMonthDay && organized.calendar === isoCalendarId && (organized = {
          ...organized,
          isoYear: isoEpochFirstLeapYear
        }), createPlainDateSlots(organized.hasTime ? finalizeDateTime(organized) : finalizeDate(organized));
      }
      function requireIsoCalendar(organized) {
        if (organized.calendar !== isoCalendarId) {
          throw new RangeError(invalidSubstring(organized.calendar));
        }
      }
      function finalizeZonedDateTime(organized, offsetNano, offsetDisambig = 0, epochDisambig = 0) {
        const timeZoneId = resolveTimeZoneId(organized.timeZone), timeZoneImpl = queryNativeTimeZone(timeZoneId);
        let epochNano;
        return checkIsoDateTimeFields(organized), epochNano = organized.hasTime ? getMatchingInstantFor(timeZoneImpl, organized, offsetNano, offsetDisambig, epochDisambig, !timeZoneImpl.offsetNano, organized.hasZ) : getStartOfDayInstantFor(timeZoneImpl, organized), createZonedDateTimeSlots(epochNano, timeZoneId, resolveCalendarId(organized.calendar));
      }
      function finalizeDateTime(organized) {
        return resolveSlotsCalendar(checkIsoDateTimeInBounds(checkIsoDateTimeFields(organized)));
      }
      function finalizeDate(organized) {
        return resolveSlotsCalendar(checkIsoDateInBounds(checkIsoDateFields(organized)));
      }
      function resolveSlotsCalendar(organized) {
        return {
          ...organized,
          calendar: resolveCalendarId(organized.calendar)
        };
      }
      function parseDateTimeLike(s) {
        const parts = dateTimeRegExp.exec(s);
        return parts ? ((parts2) => {
          const zOrOffset = parts2[10], hasZ = "Z" === (zOrOffset || "").toUpperCase();
          return {
            isoYear: organizeIsoYearParts(parts2),
            isoMonth: parseInt(parts2[4]),
            isoDay: parseInt(parts2[5]),
            ...organizeTimeParts(parts2.slice(5)),
            ...organizeAnnotationParts(parts2[16]),
            hasTime: Boolean(parts2[6]),
            hasZ,
            offset: hasZ ? void 0 : zOrOffset
          };
        })(parts) : void 0;
      }
      function parseYearMonthOnly(s) {
        const parts = yearMonthRegExp.exec(s);
        return parts ? ((parts2) => ({
          isoYear: organizeIsoYearParts(parts2),
          isoMonth: parseInt(parts2[4]),
          isoDay: 1,
          ...organizeAnnotationParts(parts2[5])
        }))(parts) : void 0;
      }
      function parseMonthDayOnly(s) {
        const parts = monthDayRegExp.exec(s);
        return parts ? ((parts2) => ({
          isoYear: isoEpochFirstLeapYear,
          isoMonth: parseInt(parts2[1]),
          isoDay: parseInt(parts2[2]),
          ...organizeAnnotationParts(parts2[3])
        }))(parts) : void 0;
      }
      function parseOffsetNanoMaybe(s, onlyHourMinute) {
        const parts = offsetRegExp.exec(s);
        return parts ? ((parts2, onlyHourMinute2) => {
          const firstSubMinutePart = parts2[4] || parts2[5];
          if (onlyHourMinute2 && firstSubMinutePart) {
            throw new RangeError(invalidSubstring(firstSubMinutePart));
          }
          return ((offsetNano) => {
            if (Math.abs(offsetNano) >= nanoInUtcDay) {
              throw new RangeError(outOfBoundsOffset);
            }
            return offsetNano;
          })((parseInt0(parts2[2]) * nanoInHour + parseInt0(parts2[3]) * nanoInMinute + parseInt0(parts2[4]) * nanoInSec + parseSubsecNano(parts2[5] || "")) * parseSign(parts2[1]));
        })(parts, onlyHourMinute) : void 0;
      }
      function organizeIsoYearParts(parts) {
        const yearSign = parseSign(parts[1]), year = parseInt(parts[2] || parts[3]);
        if (yearSign < 0 && !year) {
          throw new RangeError(invalidSubstring(-0));
        }
        return yearSign * year;
      }
      function organizeTimeParts(parts) {
        const isoSecond = parseInt0(parts[3]);
        return {
          ...nanoToIsoTimeAndDay(parseSubsecNano(parts[4] || ""))[0],
          isoHour: parseInt0(parts[1]),
          isoMinute: parseInt0(parts[2]),
          isoSecond: 60 === isoSecond ? 59 : isoSecond
        };
      }
      function organizeAnnotationParts(s) {
        let calendarIsCritical, timeZoneId;
        const calendarIds = [];
        if (s.replace(annotationRegExp, ((whole, criticalStr, mainStr) => {
          const isCritical = Boolean(criticalStr), [val, name] = mainStr.split("=").reverse();
          if (name) {
            if ("u-ca" === name) {
              calendarIds.push(val), calendarIsCritical || (calendarIsCritical = isCritical);
            } else if (isCritical || /[A-Z]/.test(name)) {
              throw new RangeError(invalidSubstring(whole));
            }
          } else {
            if (timeZoneId) {
              throw new RangeError(invalidSubstring(whole));
            }
            timeZoneId = val;
          }
          return "";
        })), calendarIds.length > 1 && calendarIsCritical) {
          throw new RangeError(invalidSubstring(s));
        }
        return {
          timeZone: timeZoneId,
          calendar: calendarIds[0] || isoCalendarId
        };
      }
      function parseSubsecNano(fracStr) {
        return parseInt(fracStr.padEnd(9, "0"));
      }
      function createRegExp(meat) {
        return new RegExp(`^${meat}$`, "i");
      }
      function parseSign(s) {
        return s && "+" !== s ? -1 : 1;
      }
      function parseInt0(s) {
        return void 0 === s ? 0 : parseInt(s);
      }
      function resolveTimeZoneId(id) {
        const essence = getTimeZoneEssence(id);
        return "number" == typeof essence ? formatOffsetNano(essence) : essence ? ((id2) => {
          if (badCharactersRegExp.test(id2)) {
            throw new RangeError(invalidTimeZone(id2));
          }
          if (icuRegExp.test(id2)) {
            throw new RangeError(forbiddenIcuTimeZone);
          }
          return id2.toLowerCase().split("/").map(((part, partI) => (part.length <= 3 || /\d/.test(part)) && !/etc|yap/.test(part) ? part.toUpperCase() : part.replace(/baja|dumont|[a-z]+/g, ((a, i2) => a.length <= 2 && !partI || "in" === a || "chat" === a ? a.toUpperCase() : a.length > 2 || !i2 ? capitalize(a).replace(/island|noronha|murdo|rivadavia|urville/, capitalize) : a)))).join("/");
        })(id) : utcTimeZoneId;
      }
      function getTimeZoneAtomic(id) {
        const essence = getTimeZoneEssence(id);
        return "number" == typeof essence ? essence : essence ? essence.resolvedOptions().timeZone : utcTimeZoneId;
      }
      function getTimeZoneEssence(id) {
        const offsetNano = parseOffsetNanoMaybe(id = id.toUpperCase(), 1);
        return void 0 !== offsetNano ? offsetNano : id !== utcTimeZoneId ? queryTimeZoneIntlFormat(id) : void 0;
      }
      function compareInstants(instantSlots0, instantSlots1) {
        return compareBigNanos(instantSlots0.epochNanoseconds, instantSlots1.epochNanoseconds);
      }
      function compareZonedDateTimes(zonedDateTimeSlots0, zonedDateTimeSlots1) {
        return compareBigNanos(zonedDateTimeSlots0.epochNanoseconds, zonedDateTimeSlots1.epochNanoseconds);
      }
      function compareIsoDateTimeFields(isoFields0, isoFields1) {
        return compareIsoDateFields(isoFields0, isoFields1) || compareIsoTimeFields(isoFields0, isoFields1);
      }
      function compareIsoDateFields(isoFields0, isoFields1) {
        return compareNumbers(isoToEpochMilli(isoFields0), isoToEpochMilli(isoFields1));
      }
      function compareIsoTimeFields(isoFields0, isoFields1) {
        return compareNumbers(isoTimeFieldsToNano(isoFields0), isoTimeFieldsToNano(isoFields1));
      }
      function isTimeZoneIdsEqual(a, b) {
        if (a === b) {
          return 1;
        }
        try {
          return getTimeZoneAtomic(a) === getTimeZoneAtomic(b);
        } catch (_a) {
        }
      }
      function diffDateLike(invert, getCalendarOps, startIsoFields, endIsoFields, largestUnit, smallestUnit, roundingInc, roundingMode, smallestPrecision = 6) {
        const startEpochNano = isoToEpochNano(startIsoFields), endEpochNano = isoToEpochNano(endIsoFields);
        if (void 0 === startEpochNano || void 0 === endEpochNano) {
          throw new RangeError(outOfBoundsDate);
        }
        let durationFields;
        if (compareBigNanos(endEpochNano, startEpochNano)) {
          if (6 === largestUnit) {
            durationFields = diffEpochNanos(startEpochNano, endEpochNano, largestUnit, smallestUnit, roundingInc, roundingMode);
          } else {
            const calendarOps = getCalendarOps();
            durationFields = calendarOps.dateUntil(startIsoFields, endIsoFields, largestUnit), smallestUnit === smallestPrecision && 1 === roundingInc || (durationFields = roundRelativeDuration(durationFields, endEpochNano, largestUnit, smallestUnit, roundingInc, roundingMode, calendarOps, startIsoFields, isoToEpochNano, moveDate));
          }
        } else {
          durationFields = durationFieldDefaults;
        }
        return createDurationSlots(invert ? negateDurationFields(durationFields) : durationFields);
      }
      function diffZonedEpochsExact(timeZoneOps, calendarOps, slots0, slots1, largestUnit, origOptions) {
        const sign = compareBigNanos(slots1.epochNanoseconds, slots0.epochNanoseconds);
        return sign ? largestUnit < 6 ? diffEpochNanosExact(slots0.epochNanoseconds, slots1.epochNanoseconds, largestUnit) : diffZonedEpochsBig(calendarOps, timeZoneOps, slots0, slots1, sign, largestUnit, origOptions) : durationFieldDefaults;
      }
      function diffDateTimesExact(calendarOps, startIsoFields, endIsoFields, largestUnit, origOptions) {
        const startEpochNano = isoToEpochNano(startIsoFields), endEpochNano = isoToEpochNano(endIsoFields), sign = compareBigNanos(endEpochNano, startEpochNano);
        return sign ? largestUnit <= 6 ? diffEpochNanosExact(startEpochNano, endEpochNano, largestUnit) : diffDateTimesBig(calendarOps, startIsoFields, endIsoFields, sign, largestUnit, origOptions) : durationFieldDefaults;
      }
      function diffZonedEpochsBig(calendarOps, timeZoneOps, slots0, slots1, sign, largestUnit, origOptions) {
        const [isoFields0, isoFields1, remainderNano] = prepareZonedEpochDiff(timeZoneOps, slots0, slots1, sign);
        var startIsoFields, endIsoFields;
        return {
          ...6 === largestUnit ? (startIsoFields = isoFields0, endIsoFields = isoFields1, {
            ...durationFieldDefaults,
            days: diffDays(startIsoFields, endIsoFields)
          }) : calendarOps.dateUntil(isoFields0, isoFields1, largestUnit, origOptions),
          ...nanoToDurationTimeFields(remainderNano)
        };
      }
      function diffDateTimesBig(calendarOps, startIsoFields, endIsoFields, sign, largestUnit, origOptions) {
        const [startIsoDate, endIsoDate, timeNano] = ((startIsoDateTime, endIsoDateTime, sign2) => {
          let endIsoDate2 = endIsoDateTime, timeDiffNano = diffTimes(startIsoDateTime, endIsoDateTime);
          return Math.sign(timeDiffNano) === -sign2 && (endIsoDate2 = moveByDays(endIsoDateTime, -sign2), timeDiffNano += nanoInUtcDay * sign2), [startIsoDateTime, endIsoDate2, timeDiffNano];
        })(startIsoFields, endIsoFields, sign);
        return {
          ...calendarOps.dateUntil(startIsoDate, endIsoDate, largestUnit, origOptions),
          ...nanoToDurationTimeFields(timeNano)
        };
      }
      function prepareZonedEpochDiff(timeZoneOps, slots0, slots1, sign) {
        function updateMid() {
          return midIsoFields = {
            ...moveByDays(endIsoFields, dayCorrection++ * -sign),
            ...startIsoTimeFields
          }, midEpochNano = getSingleInstantFor(timeZoneOps, midIsoFields), compareBigNanos(endEpochNano, midEpochNano) === -sign;
        }
        const startIsoFields = zonedEpochSlotsToIso(slots0, timeZoneOps), startIsoTimeFields = pluckProps(isoTimeFieldNamesAsc, startIsoFields), endIsoFields = zonedEpochSlotsToIso(slots1, timeZoneOps), endEpochNano = slots1.epochNanoseconds;
        let dayCorrection = 0;
        const timeDiffNano = diffTimes(startIsoFields, endIsoFields);
        let midIsoFields, midEpochNano;
        if (Math.sign(timeDiffNano) === -sign && dayCorrection++, updateMid() && (-1 === sign || updateMid())) {
          throw new RangeError(invalidProtocolResults);
        }
        const remainderNano = bigNanoToNumber(diffBigNanos(midEpochNano, endEpochNano));
        return [startIsoFields, midIsoFields, remainderNano];
      }
      function diffEpochNanos(startEpochNano, endEpochNano, largestUnit, smallestUnit, roundingInc, roundingMode) {
        return {
          ...durationFieldDefaults,
          ...nanoToDurationDayTimeFields(roundBigNano(diffBigNanos(startEpochNano, endEpochNano), smallestUnit, roundingInc, roundingMode), largestUnit)
        };
      }
      function diffEpochNanosExact(startEpochNano, endEpochNano, largestUnit) {
        return {
          ...durationFieldDefaults,
          ...nanoToDurationDayTimeFields(diffBigNanos(startEpochNano, endEpochNano), largestUnit)
        };
      }
      function diffDays(startIsoFields, endIsoFields) {
        return diffEpochMilliByDay(isoToEpochMilli(startIsoFields), isoToEpochMilli(endIsoFields));
      }
      function diffEpochMilliByDay(epochMilli0, epochMilli1) {
        return Math.trunc((epochMilli1 - epochMilli0) / milliInDay);
      }
      function diffTimes(isoTime0, isoTime1) {
        return isoTimeFieldsToNano(isoTime1) - isoTimeFieldsToNano(isoTime0);
      }
      function nativeDateUntil(startIsoFields, endIsoFields, largestUnit) {
        if (largestUnit <= 7) {
          let weeks = 0, days2 = diffDays({
            ...startIsoFields,
            ...isoTimeFieldDefaults
          }, {
            ...endIsoFields,
            ...isoTimeFieldDefaults
          });
          return 7 === largestUnit && ([weeks, days2] = divModTrunc(days2, 7)), {
            ...durationFieldDefaults,
            weeks,
            days: days2
          };
        }
        const yearMonthDayStart = this.dateParts(startIsoFields), yearMonthDayEnd = this.dateParts(endIsoFields);
        let [years, months, days] = ((calendarNative, year0, month0, day0, year1, month1, day1) => {
          let yearDiff = year1 - year0, monthDiff = month1 - month0, dayDiff = day1 - day0;
          if (yearDiff || monthDiff) {
            const sign = Math.sign(yearDiff || monthDiff);
            let daysInMonth1 = calendarNative.daysInMonthParts(year1, month1), dayCorrect = 0;
            if (Math.sign(dayDiff) === -sign) {
              const origDaysInMonth1 = daysInMonth1;
              [year1, month1] = calendarNative.monthAdd(year1, month1, -sign), yearDiff = year1 - year0, monthDiff = month1 - month0, daysInMonth1 = calendarNative.daysInMonthParts(year1, month1), dayCorrect = sign < 0 ? -origDaysInMonth1 : daysInMonth1;
            }
            if (dayDiff = day1 - Math.min(day0, daysInMonth1) + dayCorrect, yearDiff) {
              const [monthCodeNumber0, isLeapYear0] = calendarNative.monthCodeParts(year0, month0), [monthCodeNumber1, isLeapYear1] = calendarNative.monthCodeParts(year1, month1);
              if (monthDiff = monthCodeNumber1 - monthCodeNumber0 || Number(isLeapYear1) - Number(isLeapYear0), Math.sign(monthDiff) === -sign) {
                const monthCorrect = sign < 0 && -calendarNative.monthsInYearPart(year1);
                yearDiff = (year1 -= sign) - year0, monthDiff = month1 - monthCodeNumberToMonth(monthCodeNumber0, isLeapYear0, calendarNative.leapMonth(year1)) + (monthCorrect || calendarNative.monthsInYearPart(year1));
              }
            }
          }
          return [yearDiff, monthDiff, dayDiff];
        })(this, ...yearMonthDayStart, ...yearMonthDayEnd);
        return 8 === largestUnit && (months += this.monthsInYearSpan(years, yearMonthDayStart[0]), years = 0), {
          ...durationFieldDefaults,
          years,
          months,
          days
        };
      }
      function computeIsoMonthsInYearSpan(yearDelta) {
        return yearDelta * isoMonthsInYear;
      }
      function computeIntlMonthsInYearSpan(yearDelta, yearStart) {
        const yearEnd = yearStart + yearDelta, yearSign = Math.sign(yearDelta), yearCorrection = yearSign < 0 ? -1 : 0;
        let months = 0;
        for (let year = yearStart; year !== yearEnd; year += yearSign) {
          months += computeIntlMonthsInYear.call(this, year + yearCorrection);
        }
        return months;
      }
      function getCommonCalendarId(a, b) {
        if (a !== b) {
          throw new RangeError(mismatchingCalendars);
        }
        return a;
      }
      function getCommonTimeZoneId(a, b) {
        if (!isTimeZoneIdsEqual(a, b)) {
          throw new RangeError(mismatchingTimeZones);
        }
        return a;
      }
      function computeNativeWeekOfYear(isoFields) {
        return this.weekParts(isoFields)[0];
      }
      function computeNativeYearOfWeek(isoFields) {
        return this.weekParts(isoFields)[1];
      }
      function computeNativeInLeapYear(isoFields) {
        const [year] = this.dateParts(isoFields);
        return this.inLeapYearPart(year);
      }
      function computeNativeMonthsInYear(isoFields) {
        const [year] = this.dateParts(isoFields);
        return this.monthsInYearPart(year);
      }
      function computeNativeDaysInMonth(isoFields) {
        const [year, month] = this.dateParts(isoFields);
        return this.daysInMonthParts(year, month);
      }
      function computeNativeDaysInYear(isoFields) {
        const [year] = this.dateParts(isoFields);
        return this.daysInYearPart(year);
      }
      function computeNativeDayOfYear(isoFields) {
        const [year] = this.dateParts(isoFields);
        return diffEpochMilliByDay(this.epochMilli(year), isoToEpochMilli(isoFields)) + 1;
      }
      function parseMonthCode(monthCode) {
        const m = monthCodeRegExp.exec(monthCode);
        if (!m) {
          throw new RangeError(invalidMonthCode(monthCode));
        }
        return [parseInt(m[1]), Boolean(m[2])];
      }
      function formatMonthCode(monthCodeNumber, isLeapMonth) {
        return "M" + padNumber2(monthCodeNumber) + (isLeapMonth ? "L" : "");
      }
      function monthCodeNumberToMonth(monthCodeNumber, isLeapMonth, leapMonth) {
        return monthCodeNumber + (isLeapMonth || leapMonth && monthCodeNumber >= leapMonth ? 1 : 0);
      }
      function monthToMonthCodeNumber(month, leapMonth) {
        return month - (leapMonth && month >= leapMonth ? 1 : 0);
      }
      function eraYearToYear(eraYear, eraOrigin) {
        return (eraOrigin + eraYear) * (Math.sign(eraOrigin) || 1) || 0;
      }
      function getCalendarEraOrigins(native) {
        return eraOriginsByCalendarId[getCalendarIdBase(native)];
      }
      function getCalendarLeapMonthMeta(native) {
        return leapMonthMetas[getCalendarIdBase(native)];
      }
      function getCalendarIdBase(native) {
        return computeCalendarIdBase(native.id || isoCalendarId);
      }
      function createIntlFieldCache(epochMilliToIntlFields) {
        return memoize(((isoDateFields) => {
          const epochMilli = isoToEpochMilli(isoDateFields);
          return epochMilliToIntlFields(epochMilli);
        }), WeakMap);
      }
      function createIntlYearDataCache(epochMilliToIntlFields) {
        const yearCorrection = epochMilliToIntlFields(0).year - isoEpochOriginYear;
        return memoize(((year) => {
          let intlFields, epochMilli = isoArgsToEpochMilli(year - yearCorrection), iterations = 0;
          const millisReversed = [], monthStringsReversed = [];
          do {
            epochMilli += 400 * milliInDay;
          } while ((intlFields = epochMilliToIntlFields(epochMilli)).year <= year);
          do {
            if (epochMilli += (1 - intlFields.day) * milliInDay, intlFields.year === year && (millisReversed.push(epochMilli), monthStringsReversed.push(intlFields.monthString)), epochMilli -= milliInDay, ++iterations > 100 || epochMilli < -maxMilli) {
              throw new RangeError(invalidProtocolResults);
            }
          } while ((intlFields = epochMilliToIntlFields(epochMilli)).year >= year);
          return {
            monthEpochMillis: millisReversed.reverse(),
            monthStringToIndex: mapPropNamesToIndex(monthStringsReversed.reverse())
          };
        }));
      }
      function parseIntlYear(intlParts, calendarIdBase) {
        let era, eraYear, year = parseIntlPartsYear(intlParts);
        if (intlParts.era) {
          const eraOrigins = eraOriginsByCalendarId[calendarIdBase], eraRemaps = eraRemapsByCalendarId[calendarIdBase] || {};
          void 0 !== eraOrigins && (era = "islamic" === calendarIdBase ? "ah" : intlParts.era.normalize("NFD").toLowerCase().replace(/[^a-z0-9]/g, ""), "bc" === era || "b" === era ? era = "bce" : "ad" === era || "a" === era ? era = "ce" : "beforeroc" === era && (era = "broc"), era = eraRemaps[era] || era, eraYear = year, year = eraYearToYear(eraYear, eraOrigins[era] || 0));
        }
        return {
          era,
          eraYear,
          year
        };
      }
      function parseIntlPartsYear(intlParts) {
        return parseInt(intlParts.relatedYear || intlParts.year);
      }
      function computeIntlDay(isoFields) {
        return this.queryFields(isoFields).day;
      }
      function computeIntlDateParts(isoFields) {
        const { year, monthString, day } = this.queryFields(isoFields), { monthStringToIndex } = this.queryYearData(year);
        return [year, monthStringToIndex[monthString] + 1, day];
      }
      function computeIsoFieldsFromIntlParts(year, month, day) {
        return epochMilliToIso(computeIntlEpochMilli.call(this, year, month, day));
      }
      function computeIntlEpochMilli(year, month = 1, day = 1) {
        return this.queryYearData(year).monthEpochMillis[month - 1] + (day - 1) * milliInDay;
      }
      function computeIntlMonthCodeParts(year, month) {
        const leapMonth = computeIntlLeapMonth.call(this, year);
        return [monthToMonthCodeNumber(month, leapMonth), leapMonth === month];
      }
      function computeIntlLeapMonth(year) {
        const currentMonthStrings = queryMonthStrings(this, year), prevMonthStrings = queryMonthStrings(this, year - 1), currentLength = currentMonthStrings.length;
        if (currentLength > prevMonthStrings.length) {
          const leapMonthMeta = getCalendarLeapMonthMeta(this);
          if (leapMonthMeta < 0) {
            return -leapMonthMeta;
          }
          for (let i2 = 0; i2 < currentLength; i2++) {
            if (currentMonthStrings[i2] !== prevMonthStrings[i2]) {
              return i2 + 1;
            }
          }
        }
      }
      function computeIntlInLeapYear(year) {
        const days = computeIntlDaysInYear.call(this, year);
        return days > computeIntlDaysInYear.call(this, year - 1) && days > computeIntlDaysInYear.call(this, year + 1);
      }
      function computeIntlDaysInYear(year) {
        return diffEpochMilliByDay(computeIntlEpochMilli.call(this, year), computeIntlEpochMilli.call(this, year + 1));
      }
      function computeIntlDaysInMonth(year, month) {
        const { monthEpochMillis } = this.queryYearData(year);
        let nextMonth = month + 1, nextMonthEpochMilli = monthEpochMillis;
        return nextMonth > monthEpochMillis.length && (nextMonth = 1, nextMonthEpochMilli = this.queryYearData(year + 1).monthEpochMillis), diffEpochMilliByDay(monthEpochMillis[month - 1], nextMonthEpochMilli[nextMonth - 1]);
      }
      function computeIntlMonthsInYear(year) {
        return this.queryYearData(year).monthEpochMillis.length;
      }
      function computeIntlEraParts(isoFields) {
        const intlFields = this.queryFields(isoFields);
        return [intlFields.era, intlFields.eraYear];
      }
      function computeIntlYearMonthForMonthDay(monthCodeNumber, isLeapMonth, day) {
        const startIsoYear = this.id && "chinese" === computeCalendarIdBase(this.id) ? ((monthCodeNumber2, isLeapMonth2, day2) => {
          if (isLeapMonth2) {
            switch (monthCodeNumber2) {
              case 1:
                return 1651;
              case 2:
                return day2 < 30 ? 1947 : 1765;
              case 3:
                return day2 < 30 ? 1966 : 1955;
              case 4:
                return day2 < 30 ? 1963 : 1944;
              case 5:
                return day2 < 30 ? 1971 : 1952;
              case 6:
                return day2 < 30 ? 1960 : 1941;
              case 7:
                return day2 < 30 ? 1968 : 1938;
              case 8:
                return day2 < 30 ? 1957 : 1718;
              case 9:
                return 1832;
              case 10:
                return 1870;
              case 11:
                return 1814;
              case 12:
                return 1890;
            }
          }
          return 1972;
        })(monthCodeNumber, isLeapMonth, day) : isoEpochFirstLeapYear;
        let [startYear, startMonth, startDay] = computeIntlDateParts.call(this, {
          isoYear: startIsoYear,
          isoMonth: isoMonthsInYear,
          isoDay: 31
        });
        const startYearLeapMonth = computeIntlLeapMonth.call(this, startYear), startMonthIsLeap = startMonth === startYearLeapMonth;
        1 === (compareNumbers(monthCodeNumber, monthToMonthCodeNumber(startMonth, startYearLeapMonth)) || compareNumbers(Number(isLeapMonth), Number(startMonthIsLeap)) || compareNumbers(day, startDay)) && startYear--;
        for (let yearMove = 0; yearMove < 100; yearMove++) {
          const tryYear = startYear - yearMove, tryLeapMonth = computeIntlLeapMonth.call(this, tryYear), tryMonth = monthCodeNumberToMonth(monthCodeNumber, isLeapMonth, tryLeapMonth);
          if (isLeapMonth === (tryMonth === tryLeapMonth) && day <= computeIntlDaysInMonth.call(this, tryYear, tryMonth)) {
            return [tryYear, tryMonth];
          }
        }
      }
      function queryMonthStrings(intlCalendar, year) {
        return Object.keys(intlCalendar.queryYearData(year).monthStringToIndex);
      }
      function resolveCalendarId(id) {
        if ((id = id.toLowerCase()) !== isoCalendarId && id !== gregoryCalendarId) {
          const canonId = queryCalendarIntlFormat(id).resolvedOptions().calendar;
          if (computeCalendarIdBase(id) !== computeCalendarIdBase(canonId)) {
            throw new RangeError(invalidCalendar(id));
          }
          return canonId;
        }
        return id;
      }
      function computeCalendarIdBase(id) {
        return "islamicc" === id && (id = "islamic"), id.split("-")[0];
      }
      function createNativeOpsCreator(isoOps, intlOps) {
        return (calendarId) => calendarId === isoCalendarId ? isoOps : calendarId === gregoryCalendarId || "japanese" === calendarId ? Object.assign(Object.create(isoOps), {
          id: calendarId
        }) : Object.assign(Object.create(intlOps), queryIntlCalendar(calendarId));
      }
      function refineCalendarFields(calendarOps, bag, validFieldNames, requiredFieldNames = [], forcedValidFieldNames = []) {
        return refineFields(bag, [...calendarOps.fields(validFieldNames), ...forcedValidFieldNames].sort(), requiredFieldNames);
      }
      function refineFields(bag, validFieldNames, requiredFieldNames, disallowEmpty = !requiredFieldNames) {
        const res = {};
        let prevFieldName, anyMatching = 0;
        for (const fieldName of validFieldNames) {
          if (fieldName === prevFieldName) {
            throw new RangeError(duplicateFields(fieldName));
          }
          if ("constructor" === fieldName || "__proto__" === fieldName) {
            throw new RangeError(forbiddenField(fieldName));
          }
          let fieldVal = bag[fieldName];
          if (void 0 !== fieldVal) {
            anyMatching = 1, builtinRefiners[fieldName] && (fieldVal = builtinRefiners[fieldName](fieldVal, fieldName)), res[fieldName] = fieldVal;
          } else if (requiredFieldNames) {
            if (requiredFieldNames.includes(fieldName)) {
              throw new TypeError(missingField(fieldName));
            }
            res[fieldName] = timeFieldDefaults[fieldName];
          }
          prevFieldName = fieldName;
        }
        if (disallowEmpty && !anyMatching) {
          throw new TypeError(noValidFields(validFieldNames));
        }
        return res;
      }
      function refineTimeBag(fields, overflow) {
        return constrainIsoTimeFields(timeFieldsToIso({
          ...timeFieldDefaults,
          ...fields
        }), overflow);
      }
      function convertToPlainMonthDay(calendarOps, input) {
        const fields = refineCalendarFields(calendarOps, input, monthCodeDayFieldNames);
        return calendarOps.monthDayFromFields(fields);
      }
      function convertToPlainYearMonth(calendarOps, input, options) {
        const fields = refineCalendarFields(calendarOps, input, yearMonthCodeFieldNames);
        return calendarOps.yearMonthFromFields(fields, options);
      }
      function convertToIso(calendarOps, input, inputFieldNames, extra, extraFieldNames) {
        input = pluckProps(inputFieldNames = calendarOps.fields(inputFieldNames), input), extra = refineFields(extra, extraFieldNames = calendarOps.fields(extraFieldNames), []);
        let mergedFields = calendarOps.mergeFields(input, extra);
        return mergedFields = refineFields(mergedFields, [...inputFieldNames, ...extraFieldNames].sort(), []), calendarOps.dateFromFields(mergedFields);
      }
      function nativeDateFromFields(fields, options) {
        const overflow = refineOverflowOptions(options), year = refineYear(this, fields), month = refineMonth(this, fields, year, overflow), day = refineDay(this, fields, month, year, overflow);
        return createPlainDateSlots(checkIsoDateInBounds(this.isoFields(year, month, day)), this.id || isoCalendarId);
      }
      function nativeYearMonthFromFields(fields, options) {
        const overflow = refineOverflowOptions(options), year = refineYear(this, fields), month = refineMonth(this, fields, year, overflow);
        return createPlainYearMonthSlots(checkIsoYearMonthInBounds(this.isoFields(year, month, 1)), this.id || isoCalendarId);
      }
      function nativeMonthDayFromFields(fields, options) {
        const overflow = refineOverflowOptions(options);
        let day, monthCodeNumber, isLeapMonth, yearMaybe = void 0 !== fields.eraYear || void 0 !== fields.year ? refineYear(this, fields) : void 0;
        const isIso = !this.id;
        if (void 0 === yearMaybe && isIso && (yearMaybe = isoEpochFirstLeapYear), void 0 !== yearMaybe) {
          const month = refineMonth(this, fields, yearMaybe, overflow);
          day = refineDay(this, fields, month, yearMaybe, overflow);
          const leapMonth = this.leapMonth(yearMaybe);
          monthCodeNumber = monthToMonthCodeNumber(month, leapMonth), isLeapMonth = month === leapMonth;
        } else {
          if (void 0 === fields.monthCode) {
            throw new TypeError(missingMonth);
          }
          if ([monthCodeNumber, isLeapMonth] = parseMonthCode(fields.monthCode), this.id && this.id !== gregoryCalendarId && "japanese" !== this.id) {
            if (this.id && "coptic" === computeCalendarIdBase(this.id) && 0 === overflow) {
              const maxLengthOfMonthCodeInAnyYear = isLeapMonth || 13 !== monthCodeNumber ? 30 : 6;
              day = fields.day, day = clampNumber(day, 1, maxLengthOfMonthCodeInAnyYear);
            } else if (this.id && "chinese" === computeCalendarIdBase(this.id) && 0 === overflow) {
              const maxLengthOfMonthCodeInAnyYear = !isLeapMonth || 1 !== monthCodeNumber && 9 !== monthCodeNumber && 10 !== monthCodeNumber && 11 !== monthCodeNumber && 12 !== monthCodeNumber ? 30 : 29;
              day = fields.day, day = clampNumber(day, 1, maxLengthOfMonthCodeInAnyYear);
            } else {
              day = fields.day;
            }
          } else {
            day = refineDay(this, fields, refineMonth(this, fields, isoEpochFirstLeapYear, overflow), isoEpochFirstLeapYear, overflow);
          }
        }
        const res = this.yearMonthForMonthDay(monthCodeNumber, isLeapMonth, day);
        if (!res) {
          throw new RangeError("Cannot guess year");
        }
        const [finalYear, finalMonth] = res;
        return createPlainMonthDaySlots(checkIsoDateInBounds(this.isoFields(finalYear, finalMonth, day)), this.id || isoCalendarId);
      }
      function nativeFieldsMethod(fieldNames) {
        return getCalendarEraOrigins(this) && fieldNames.includes("year") ? [...fieldNames, ...eraYearFieldNames] : fieldNames;
      }
      function nativeMergeFields(baseFields, additionalFields) {
        const merged = Object.assign(/* @__PURE__ */ Object.create(null), baseFields);
        return spliceFields(merged, additionalFields, monthFieldNames), getCalendarEraOrigins(this) && (spliceFields(merged, additionalFields, allYearFieldNames), "japanese" === this.id && spliceFields(merged, additionalFields, monthDayFieldNames, eraYearFieldNames)), merged;
      }
      function refineYear(calendarNative, fields) {
        const eraOrigins = getCalendarEraOrigins(calendarNative), eraRemaps = eraRemapsByCalendarId[calendarNative.id || ""] || {};
        let { era, eraYear, year } = fields;
        if (void 0 !== era || void 0 !== eraYear) {
          if (void 0 === era || void 0 === eraYear) {
            throw new TypeError(mismatchingEraParts);
          }
          if (!eraOrigins) {
            throw new RangeError(forbiddenEraParts);
          }
          const eraOrigin = eraOrigins[eraRemaps[era] || era];
          if (void 0 === eraOrigin) {
            throw new RangeError(invalidEra(era));
          }
          const yearByEra = eraYearToYear(eraYear, eraOrigin);
          if (void 0 !== year && year !== yearByEra) {
            throw new RangeError(mismatchingYearAndEra);
          }
          year = yearByEra;
        } else if (void 0 === year) {
          throw new TypeError(missingYear(eraOrigins));
        }
        return year;
      }
      function refineMonth(calendarNative, fields, year, overflow) {
        let { month, monthCode } = fields;
        if (void 0 !== monthCode) {
          const monthByCode = ((calendarNative2, monthCode2, year2, overflow2) => {
            const leapMonth = calendarNative2.leapMonth(year2), [monthCodeNumber, wantsLeapMonth] = parseMonthCode(monthCode2);
            let month2 = monthCodeNumberToMonth(monthCodeNumber, wantsLeapMonth, leapMonth);
            if (wantsLeapMonth) {
              const leapMonthMeta = getCalendarLeapMonthMeta(calendarNative2);
              if (void 0 === leapMonthMeta) {
                throw new RangeError(invalidLeapMonth);
              }
              if (leapMonthMeta > 0) {
                if (month2 > leapMonthMeta) {
                  throw new RangeError(invalidLeapMonth);
                }
                if (void 0 === leapMonth) {
                  if (1 === overflow2) {
                    throw new RangeError(invalidLeapMonth);
                  }
                  month2--;
                }
              } else {
                if (month2 !== -leapMonthMeta) {
                  throw new RangeError(invalidLeapMonth);
                }
                if (void 0 === leapMonth && 1 === overflow2) {
                  throw new RangeError(invalidLeapMonth);
                }
              }
            }
            return month2;
          })(calendarNative, monthCode, year, overflow);
          if (void 0 !== month && month !== monthByCode) {
            throw new RangeError(mismatchingMonthAndCode);
          }
          month = monthByCode, overflow = 1;
        } else if (void 0 === month) {
          throw new TypeError(missingMonth);
        }
        return clampEntity("month", month, 1, calendarNative.monthsInYearPart(year), overflow);
      }
      function refineDay(calendarNative, fields, month, year, overflow) {
        return clampProp(fields, "day", 1, calendarNative.daysInMonthParts(year, month), overflow);
      }
      function spliceFields(dest, additional, allPropNames, deletablePropNames) {
        let anyMatching = 0;
        const nonMatchingPropNames = [];
        for (const propName of allPropNames) {
          void 0 !== additional[propName] ? anyMatching = 1 : nonMatchingPropNames.push(propName);
        }
        if (Object.assign(dest, additional), anyMatching) {
          for (const deletablePropName of deletablePropNames || nonMatchingPropNames) {
            delete dest[deletablePropName];
          }
        }
      }
      function computeDateEssentials(slots) {
        const calendarOps = createNativePartOps(slots.calendar), [year, month, day] = calendarOps.dateParts(slots), [monthCodeNumber, isLeapMonth] = calendarOps.monthCodeParts(year, month);
        return {
          year,
          monthCode: formatMonthCode(monthCodeNumber, isLeapMonth),
          day
        };
      }
      function createOptionsTransformer(standardNames, fallbacks, exclusions) {
        const excludedNameSet = new Set(exclusions);
        return (options, strictOptions) => {
          const hasAnyExclusions = exclusions && hasAnyPropsByName(options, exclusions);
          if (!hasAnyPropsByName(options = ((propNames, props) => {
            const filteredProps = {};
            for (const propName in props) {
              propNames.has(propName) || (filteredProps[propName] = props[propName]);
            }
            return filteredProps;
          })(excludedNameSet, options), standardNames)) {
            if (strictOptions && hasAnyExclusions) {
              throw new TypeError("Invalid formatting options");
            }
            options = {
              ...fallbacks,
              ...options
            };
          }
          return exclusions && (options.timeZone = utcTimeZoneId, ["full", "long"].includes(options.timeStyle) && (options.timeStyle = "medium")), options;
        };
      }
      function createFormatForPrep(forcedTimeZoneId, locales, options, transformOptions, strictOptions) {
        if (options = transformOptions(options, strictOptions), forcedTimeZoneId) {
          if (void 0 !== options.timeZone) {
            throw new TypeError(forbiddenFormatTimeZone);
          }
          options.timeZone = forcedTimeZoneId;
        }
        return new RawDateTimeFormat(locales, options);
      }
      function toEpochMillis(config, resolvedOptions, slotsList) {
        const [, slotsToEpochMilli, strictCalendarCheck] = config;
        return slotsList.map(((slots) => (slots.calendar && ((internalCalendarId, resolvedCalendarId, strictCalendarCheck2) => {
          if ((strictCalendarCheck2 || internalCalendarId !== isoCalendarId) && internalCalendarId !== resolvedCalendarId) {
            throw new RangeError(mismatchingCalendars);
          }
        })(slots.calendar, resolvedOptions.calendar, strictCalendarCheck), slotsToEpochMilli(slots, resolvedOptions))));
      }
      function getPreferredCalendarId(a, b) {
        if (a === b) {
          return a;
        }
        if (a === b || a === isoCalendarId) {
          return b;
        }
        if (b === isoCalendarId) {
          return a;
        }
        throw new RangeError(mismatchingCalendars);
      }
      function getCurrentEpochNano() {
        return numberToBigNano(Date.now(), nanoInMilli);
      }
      var expectedInteger = (entityName, num) => `Non-integer ${entityName}: ${num}`;
      var expectedPositive = (entityName, num) => `Non-positive ${entityName}: ${num}`;
      var expectedFinite = (entityName, num) => `Non-finite ${entityName}: ${num}`;
      var forbiddenBigIntToNumber = (entityName) => `Cannot convert bigint to ${entityName}`;
      var invalidBigInt = (arg) => `Invalid bigint: ${arg}`;
      var forbiddenSymbolToString = "Cannot convert Symbol to string";
      var invalidObject = "Invalid object";
      var numberOutOfRange = (entityName, val, min, max, choices) => choices ? numberOutOfRange(entityName, choices[val], choices[min], choices[max]) : invalidEntity(entityName, val) + `; must be between ${min}-${max}`;
      var invalidEntity = (fieldName, val) => `Invalid ${fieldName}: ${val}`;
      var missingField = (fieldName) => `Missing ${fieldName}`;
      var forbiddenField = (fieldName) => `Invalid field ${fieldName}`;
      var duplicateFields = (fieldName) => `Duplicate field ${fieldName}`;
      var noValidFields = (validFields) => "No valid fields: " + validFields.join();
      var invalidChoice = (fieldName, val, choiceMap) => invalidEntity(fieldName, val) + "; must be " + Object.keys(choiceMap).join();
      var forbiddenEraParts = "Forbidden era/eraYear";
      var mismatchingEraParts = "Mismatching era/eraYear";
      var mismatchingYearAndEra = "Mismatching year/eraYear";
      var invalidEra = (era) => `Invalid era: ${era}`;
      var missingYear = (allowEra) => "Missing year" + (allowEra ? "/era/eraYear" : "");
      var invalidMonthCode = (monthCode) => `Invalid monthCode: ${monthCode}`;
      var mismatchingMonthAndCode = "Mismatching month/monthCode";
      var missingMonth = "Missing month/monthCode";
      var invalidLeapMonth = "Invalid leap month";
      var invalidProtocolResults = "Invalid protocol results";
      var invalidCalendar = (calendarId) => invalidEntity("Calendar", calendarId);
      var mismatchingCalendars = "Mismatching Calendars";
      var invalidTimeZone = (calendarId) => invalidEntity("TimeZone", calendarId);
      var mismatchingTimeZones = "Mismatching TimeZones";
      var forbiddenIcuTimeZone = "Forbidden ICU TimeZone";
      var outOfBoundsOffset = "Out-of-bounds offset";
      var outOfBoundsDstGap = "Out-of-bounds TimeZone gap";
      var invalidOffsetForTimeZone = "Invalid TimeZone offset";
      var ambigOffset = "Ambiguous offset";
      var outOfBoundsDate = "Out-of-bounds date";
      var outOfBoundsDuration = "Out-of-bounds duration";
      var forbiddenDurationSigns = "Cannot mix duration signs";
      var flippedSmallestLargestUnit = "smallestUnit > largestUnit";
      var failedParse = (s) => `Cannot parse: ${s}`;
      var invalidSubstring = (substring) => `Invalid substring: ${substring}`;
      var forbiddenFormatTimeZone = "Cannot specify TimeZone";
      var mapPropNamesToIndex = bindArgs(mapPropNames, ((_propVal, i2) => i2));
      var mapPropNamesToConstant = bindArgs(mapPropNames, ((_propVal, _i, constant) => constant));
      var padNumber2 = bindArgs(padNumber, 2);
      var unitNameMap = {
        nanosecond: 0,
        microsecond: 1,
        millisecond: 2,
        second: 3,
        minute: 4,
        hour: 5,
        day: 6,
        week: 7,
        month: 8,
        year: 9
      };
      var unitNamesAsc = Object.keys(unitNameMap);
      var milliInDay = 864e5;
      var milliInSec = 1e3;
      var nanoInMicro = 1e3;
      var nanoInMilli = 1e6;
      var nanoInSec = 1e9;
      var nanoInMinute = 6e10;
      var nanoInHour = 36e11;
      var nanoInUtcDay = 864e11;
      var unitNanoMap = [1, nanoInMicro, nanoInMilli, nanoInSec, nanoInMinute, nanoInHour, nanoInUtcDay];
      var timeFieldNamesAsc = unitNamesAsc.slice(0, 6);
      var timeFieldNamesAlpha = sortStrings(timeFieldNamesAsc);
      var timeZoneFieldNames = ["timeZone"];
      var timeAndOffsetFieldNames = [...timeFieldNamesAsc, "offset"];
      var timeAndZoneFieldNames = [...timeAndOffsetFieldNames, ...timeZoneFieldNames];
      var eraYearFieldNames = ["era", "eraYear"];
      var allYearFieldNames = [...eraYearFieldNames, "year"];
      var yearFieldNames = ["year"];
      var monthCodeFieldNames = ["monthCode"];
      var monthFieldNames = ["month", ...monthCodeFieldNames];
      var dayFieldNames = ["day"];
      var yearMonthFieldNames = [...monthFieldNames, ...yearFieldNames];
      var yearMonthCodeFieldNames = [...monthCodeFieldNames, ...yearFieldNames];
      var dateFieldNamesAlpha = [...dayFieldNames, ...yearMonthFieldNames];
      var monthDayFieldNames = [...dayFieldNames, ...monthFieldNames];
      var monthCodeDayFieldNames = [...dayFieldNames, ...monthCodeFieldNames];
      var timeFieldDefaults = mapPropNamesToConstant(timeFieldNamesAsc, 0);
      var isoCalendarId = "iso8601";
      var gregoryCalendarId = "gregory";
      var eraOriginsByCalendarId = {
        [gregoryCalendarId]: {
          "gregory-inverse": -1,
          gregory: 0
        },
        japanese: {
          "japanese-inverse": -1,
          japanese: 0,
          meiji: 1867,
          taisho: 1911,
          showa: 1925,
          heisei: 1988,
          reiwa: 2018
        },
        ethiopic: {
          ethioaa: 0,
          ethiopic: 5500
        },
        coptic: {
          "coptic-inverse": -1,
          coptic: 0
        },
        roc: {
          "roc-inverse": -1,
          roc: 0
        },
        buddhist: {
          be: 0
        },
        islamic: {
          ah: 0
        },
        indian: {
          saka: 0
        },
        persian: {
          ap: 0
        }
      };
      var eraRemapsByCalendarId = {
        [gregoryCalendarId]: {
          bce: "gregory-inverse",
          ce: "gregory"
        },
        japanese: {
          bce: "japanese-inverse",
          ce: "japanese"
        },
        ethiopic: {
          era0: "ethioaa",
          era1: "ethiopic"
        },
        coptic: {
          era0: "coptic-inverse",
          era1: "coptic"
        },
        roc: {
          broc: "roc-inverse",
          minguo: "roc"
        }
      };
      var leapMonthMetas = {
        chinese: 13,
        dangi: 13,
        hebrew: -6
      };
      var requireString = bindArgs(requireType, "string");
      var requireBoolean = bindArgs(requireType, "boolean");
      var requireNumber = bindArgs(requireType, "number");
      var durationFieldNamesAsc = unitNamesAsc.map(((unitName) => unitName + "s"));
      var durationFieldNamesAlpha = sortStrings(durationFieldNamesAsc);
      var durationTimeFieldNamesAsc = durationFieldNamesAsc.slice(0, 6);
      var durationDateFieldNamesAsc = durationFieldNamesAsc.slice(6);
      var durationCalendarFieldNamesAsc = durationDateFieldNamesAsc.slice(1);
      var durationFieldIndexes = mapPropNamesToIndex(durationFieldNamesAsc);
      var durationFieldDefaults = mapPropNamesToConstant(durationFieldNamesAsc, 0);
      var durationTimeFieldDefaults = mapPropNamesToConstant(durationTimeFieldNamesAsc, 0);
      var clearDurationFields = bindArgs(zeroOutProps, durationFieldNamesAsc);
      var isoTimeFieldNamesAsc = ["isoNanosecond", "isoMicrosecond", "isoMillisecond", "isoSecond", "isoMinute", "isoHour"];
      var isoDateFieldNamesAsc = ["isoDay", "isoMonth", "isoYear"];
      var isoDateTimeFieldNamesAsc = [...isoTimeFieldNamesAsc, ...isoDateFieldNamesAsc];
      var isoDateFieldNamesAlpha = sortStrings(isoDateFieldNamesAsc);
      var isoTimeFieldNamesAlpha = sortStrings(isoTimeFieldNamesAsc);
      var isoDateTimeFieldNamesAlpha = sortStrings(isoDateTimeFieldNamesAsc);
      var isoTimeFieldDefaults = mapPropNamesToConstant(isoTimeFieldNamesAlpha, 0);
      var clearIsoFields = bindArgs(zeroOutProps, isoDateTimeFieldNamesAsc);
      var maxMilli = 1e8 * milliInDay;
      var epochNanoMax = [1e8, 0];
      var epochNanoMin = [-1e8, 0];
      var isoYearMax = 275760;
      var isoYearMin = -271821;
      var RawDateTimeFormat = Intl.DateTimeFormat;
      var isoEpochOriginYear = 1970;
      var isoEpochFirstLeapYear = 1972;
      var isoMonthsInYear = 12;
      var primaryJapaneseEraMilli = isoArgsToEpochMilli(1868, 9, 8);
      var queryJapaneseEraParts = memoize(((isoFields) => {
        const epochMilli = isoToEpochMilli(isoFields);
        if (epochMilli < primaryJapaneseEraMilli) {
          const { isoYear } = isoFields;
          return isoYear < 1 ? ["japanese-inverse", 1 - isoYear] : ["japanese", isoYear];
        }
        const intlParts = hashIntlFormatParts(queryCalendarIntlFormat("japanese"), epochMilli), { era, eraYear } = parseIntlYear(intlParts, "japanese");
        return [era, eraYear];
      }), WeakMap);
      var smallestUnitStr = "smallestUnit";
      var roundingModeName = "roundingMode";
      var roundingIncName = "roundingIncrement";
      var subsecDigitsName = "fractionalSecondDigits";
      var overflowMap = {
        constrain: 0,
        reject: 1
      };
      var overflowMapNames = Object.keys(overflowMap);
      var directionMap = {
        previous: -1,
        next: 1
      };
      var refineSmallestUnit = bindArgs(refineUnitOption, smallestUnitStr);
      var refineLargestUnit = bindArgs(refineUnitOption, "largestUnit");
      var refineTotalUnit = bindArgs(refineUnitOption, "unit");
      var refineOverflow = bindArgs(refineChoiceOption, "overflow", overflowMap);
      var refineEpochDisambig = bindArgs(refineChoiceOption, "disambiguation", {
        compatible: 0,
        reject: 1,
        earlier: 2,
        later: 3
      });
      var refineOffsetDisambig = bindArgs(refineChoiceOption, "offset", {
        reject: 0,
        use: 1,
        prefer: 2,
        ignore: 3
      });
      var refineCalendarDisplay = bindArgs(refineChoiceOption, "calendarName", {
        auto: 0,
        never: 1,
        critical: 2,
        always: 3
      });
      var refineTimeZoneDisplay = bindArgs(refineChoiceOption, "timeZoneName", {
        auto: 0,
        never: 1,
        critical: 2
      });
      var refineOffsetDisplay = bindArgs(refineChoiceOption, "offset", {
        auto: 0,
        never: 1
      });
      var refineRoundingMode = bindArgs(refineChoiceOption, roundingModeName, {
        floor: 0,
        halfFloor: 1,
        ceil: 2,
        halfCeil: 3,
        trunc: 4,
        halfTrunc: 5,
        expand: 6,
        halfExpand: 7,
        halfEven: 8
      });
      var PlainYearMonthBranding = "PlainYearMonth";
      var PlainMonthDayBranding = "PlainMonthDay";
      var PlainDateBranding = "PlainDate";
      var PlainDateTimeBranding = "PlainDateTime";
      var PlainTimeBranding = "PlainTime";
      var ZonedDateTimeBranding = "ZonedDateTime";
      var InstantBranding = "Instant";
      var DurationBranding = "Duration";
      var roundingModeFuncs = [Math.floor, (num) => hasHalf(num) ? Math.floor(num) : Math.round(num), Math.ceil, (num) => hasHalf(num) ? Math.ceil(num) : Math.round(num), Math.trunc, (num) => hasHalf(num) ? Math.trunc(num) || 0 : Math.round(num), (num) => num < 0 ? Math.floor(num) : Math.ceil(num), (num) => Math.sign(num) * Math.round(Math.abs(num)) || 0, (num) => hasHalf(num) ? (num = Math.trunc(num) || 0) + num % 2 : Math.round(num)];
      var utcTimeZoneId = "UTC";
      var periodDur = 5184e3;
      var minPossibleTransition = isoArgsToEpochSec(1847);
      var maxPossibleTransition = isoArgsToEpochSec((() => {
        const currentDate = /* @__PURE__ */ new Date();
        return (0 === currentDate.getTime() ? 2040 : currentDate.getUTCFullYear()) + 10;
      })());
      var trailingZerosRE = /0+$/;
      var zonedEpochSlotsToIso = memoize(((slots, getTimeZoneOps) => {
        const { epochNanoseconds } = slots, offsetNanoseconds = (getTimeZoneOps.getOffsetNanosecondsFor ? getTimeZoneOps : getTimeZoneOps(slots.timeZone)).getOffsetNanosecondsFor(epochNanoseconds), isoDateTimeFields = epochNanoToIso(epochNanoseconds, offsetNanoseconds);
        return {
          calendar: slots.calendar,
          ...isoDateTimeFields,
          offsetNanoseconds
        };
      }), WeakMap);
      var maxCalendarUnit = 2 ** 32 - 1;
      var queryNativeTimeZone = memoize(((timeZoneId) => {
        const essence = getTimeZoneEssence(timeZoneId);
        return "object" == typeof essence ? new IntlTimeZone(essence) : new FixedTimeZone(essence || 0);
      }));
      var FixedTimeZone = class {
        constructor(offsetNano) {
          this.offsetNano = offsetNano;
        }
        getOffsetNanosecondsFor() {
          return this.offsetNano;
        }
        getPossibleInstantsFor(isoDateTimeFields) {
          return ((isoFields) => {
            const bigNano = isoToEpochNano({
              ...isoFields,
              ...isoTimeFieldDefaults
            });
            if (!bigNano || Math.abs(bigNano[0]) > 1e8) {
              throw new RangeError(outOfBoundsDate);
            }
          })(isoDateTimeFields), [isoToEpochNanoWithOffset(isoDateTimeFields, this.offsetNano)];
        }
        getTransition() {
        }
      };
      var IntlTimeZone = class {
        constructor(format) {
          this.tzStore = ((computeOffsetSec) => {
            function getOffsetSec(epochSec) {
              const clampedEpochSec = clampNumber(epochSec, minTransition, maxTransition), [startEpochSec, endEpochSec] = computePeriod(clampedEpochSec), startOffsetSec = getSample(startEpochSec), endOffsetSec = getSample(endEpochSec);
              return startOffsetSec === endOffsetSec ? startOffsetSec : pinch(getSplit(startEpochSec, endEpochSec), startOffsetSec, endOffsetSec, epochSec);
            }
            function pinch(split, startOffsetSec, endOffsetSec, forEpochSec) {
              let offsetSec, splitDurSec;
              for (; (void 0 === forEpochSec || void 0 === (offsetSec = forEpochSec < split[0] ? startOffsetSec : forEpochSec >= split[1] ? endOffsetSec : void 0)) && (splitDurSec = split[1] - split[0]); ) {
                const middleEpochSec = split[0] + Math.floor(splitDurSec / 2);
                computeOffsetSec(middleEpochSec) === endOffsetSec ? split[1] = middleEpochSec : split[0] = middleEpochSec + 1;
              }
              return offsetSec;
            }
            const getSample = memoize(computeOffsetSec), getSplit = memoize(createSplitTuple);
            let minTransition = minPossibleTransition, maxTransition = maxPossibleTransition;
            return {
              getPossibleEpochSec(zonedEpochSec) {
                const wideOffsetSec0 = getOffsetSec(zonedEpochSec - 86400), wideOffsetSec1 = getOffsetSec(zonedEpochSec + 86400), wideUtcEpochSec0 = zonedEpochSec - wideOffsetSec0, wideUtcEpochSec1 = zonedEpochSec - wideOffsetSec1;
                if (wideOffsetSec0 === wideOffsetSec1) {
                  return [wideUtcEpochSec0];
                }
                const narrowOffsetSec0 = getOffsetSec(wideUtcEpochSec0);
                return narrowOffsetSec0 === getOffsetSec(wideUtcEpochSec1) ? [zonedEpochSec - narrowOffsetSec0] : wideOffsetSec0 > wideOffsetSec1 ? [wideUtcEpochSec0, wideUtcEpochSec1] : [];
              },
              getOffsetSec,
              getTransition(epochSec, direction) {
                const clampedEpochSec = clampNumber(epochSec, minTransition, maxTransition);
                let [startEpochSec, endEpochSec] = computePeriod(clampedEpochSec);
                const inc = periodDur * direction, inBounds = direction < 0 ? () => endEpochSec > minTransition || (minTransition = clampedEpochSec, 0) : () => startEpochSec < maxTransition || (maxTransition = clampedEpochSec, 0);
                for (; inBounds(); ) {
                  const startOffsetSec = getSample(startEpochSec), endOffsetSec = getSample(endEpochSec);
                  if (startOffsetSec !== endOffsetSec) {
                    const split = getSplit(startEpochSec, endEpochSec);
                    pinch(split, startOffsetSec, endOffsetSec);
                    const transitionEpochSec = split[0];
                    if ((compareNumbers(transitionEpochSec, epochSec) || 1) === direction) {
                      return transitionEpochSec;
                    }
                  }
                  startEpochSec += inc, endEpochSec += inc;
                }
              }
            };
          })(/* @__PURE__ */ ((format2) => (epochSec) => {
            const intlParts = hashIntlFormatParts(format2, epochSec * milliInSec);
            return isoArgsToEpochSec(parseIntlPartsYear(intlParts), parseInt(intlParts.month), parseInt(intlParts.day), parseInt(intlParts.hour), parseInt(intlParts.minute), parseInt(intlParts.second)) - epochSec;
          })(format));
        }
        getOffsetNanosecondsFor(epochNano) {
          return this.tzStore.getOffsetSec(epochNanoToSec(epochNano)) * nanoInSec;
        }
        getPossibleInstantsFor(isoFields) {
          const [zonedEpochSec, subsecNano] = [isoArgsToEpochSec((isoDateTimeFields = isoFields).isoYear, isoDateTimeFields.isoMonth, isoDateTimeFields.isoDay, isoDateTimeFields.isoHour, isoDateTimeFields.isoMinute, isoDateTimeFields.isoSecond), isoDateTimeFields.isoMillisecond * nanoInMilli + isoDateTimeFields.isoMicrosecond * nanoInMicro + isoDateTimeFields.isoNanosecond];
          var isoDateTimeFields;
          return this.tzStore.getPossibleEpochSec(zonedEpochSec).map(((epochSec) => checkEpochNanoInBounds(moveBigNano(numberToBigNano(epochSec, nanoInSec), subsecNano))));
        }
        getTransition(epochNano, direction) {
          const [epochSec, subsecNano] = epochNanoToSecMod(epochNano), resEpochSec = this.tzStore.getTransition(epochSec + (direction > 0 || subsecNano ? 1 : 0), direction);
          if (void 0 !== resEpochSec) {
            return numberToBigNano(resEpochSec, nanoInSec);
          }
        }
      };
      var timeRegExpStr = "(\\d{2})(?::?(\\d{2})(?::?(\\d{2})(?:[.,](\\d{1,9}))?)?)?";
      var offsetRegExpStr = "([+-])" + timeRegExpStr;
      var dateTimeRegExpStr = "(?:(?:([+-])(\\d{6}))|(\\d{4}))-?(\\d{2})-?(\\d{2})(?:[T ]" + timeRegExpStr + "(Z|" + offsetRegExpStr + ")?)?";
      var yearMonthRegExp = createRegExp("(?:(?:([+-])(\\d{6}))|(\\d{4}))-?(\\d{2})((?:\\[(!?)([^\\]]*)\\]){0,9})");
      var monthDayRegExp = createRegExp("(?:--)?(\\d{2})-?(\\d{2})((?:\\[(!?)([^\\]]*)\\]){0,9})");
      var dateTimeRegExp = createRegExp(dateTimeRegExpStr + "((?:\\[(!?)([^\\]]*)\\]){0,9})");
      var timeRegExp = createRegExp("T?" + timeRegExpStr + "(?:" + offsetRegExpStr + ")?((?:\\[(!?)([^\\]]*)\\]){0,9})");
      var offsetRegExp = createRegExp(offsetRegExpStr);
      var annotationRegExp = new RegExp("\\[(!?)([^\\]]*)\\]", "g");
      var durationRegExp = createRegExp("([+-])?P(\\d+Y)?(\\d+M)?(\\d+W)?(\\d+D)?(?:T(?:(\\d+)(?:[.,](\\d{1,9}))?H)?(?:(\\d+)(?:[.,](\\d{1,9}))?M)?(?:(\\d+)(?:[.,](\\d{1,9}))?S)?)?");
      var queryTimeZoneIntlFormat = memoize(((id) => new RawDateTimeFormat("en", {
        calendar: isoCalendarId,
        timeZone: id,
        era: "short",
        year: "numeric",
        month: "numeric",
        day: "numeric",
        hour: "numeric",
        minute: "numeric",
        second: "numeric",
        hour12: 0
      })));
      var icuRegExp = /^(AC|AE|AG|AR|AS|BE|BS|CA|CN|CS|CT|EA|EC|IE|IS|JS|MI|NE|NS|PL|PN|PR|PS|SS|VS)T$/;
      var badCharactersRegExp = /[^\w\/:+-]+/;
      var monthCodeRegExp = /^M(\d{2})(L?)$/;
      var queryIntlCalendar = memoize(((calendarId) => {
        function epochMilliToIntlFields(epochMilli) {
          return ((intlParts, calendarIdBase2) => ({
            ...parseIntlYear(intlParts, calendarIdBase2),
            monthString: intlParts.month,
            day: parseInt(intlParts.day)
          }))(hashIntlFormatParts(intlFormat, epochMilli), calendarIdBase);
        }
        const intlFormat = queryCalendarIntlFormat(calendarId), calendarIdBase = computeCalendarIdBase(calendarId);
        return {
          id: calendarId,
          queryFields: createIntlFieldCache(epochMilliToIntlFields),
          queryYearData: createIntlYearDataCache(epochMilliToIntlFields)
        };
      }));
      var queryCalendarIntlFormat = memoize(((id) => new RawDateTimeFormat("en", {
        calendar: id,
        timeZone: utcTimeZoneId,
        era: "short",
        year: "numeric",
        month: "short",
        day: "numeric",
        hour12: 0
      })));
      var nativeYearMonthRefineBase = {
        yearMonthFromFields: nativeYearMonthFromFields,
        fields: nativeFieldsMethod
      };
      var nativeDateRefineBase = {
        dateFromFields: nativeDateFromFields,
        fields: nativeFieldsMethod
      };
      var nativeMonthDayRefineBase = {
        monthDayFromFields: nativeMonthDayFromFields,
        fields: nativeFieldsMethod
      };
      var nativeMoveBase = {
        dateAdd: nativeDateAdd
      };
      var nativeDiffBase = {
        dateAdd: nativeDateAdd,
        dateUntil: nativeDateUntil
      };
      var nativeStandardBase = {
        dateAdd: nativeDateAdd,
        dateUntil: nativeDateUntil,
        dateFromFields: nativeDateFromFields,
        yearMonthFromFields: nativeYearMonthFromFields,
        monthDayFromFields: nativeMonthDayFromFields,
        fields: nativeFieldsMethod,
        mergeFields: nativeMergeFields,
        inLeapYear: computeNativeInLeapYear,
        monthsInYear: computeNativeMonthsInYear,
        daysInMonth: computeNativeDaysInMonth,
        daysInYear: computeNativeDaysInYear,
        dayOfYear: computeNativeDayOfYear,
        era(isoFields) {
          return this.eraParts(isoFields)[0];
        },
        eraYear(isoFields) {
          return this.eraParts(isoFields)[1];
        },
        monthCode(isoFields) {
          const [year, month] = this.dateParts(isoFields), [monthCodeNumber, isLeapMonth] = this.monthCodeParts(year, month);
          return formatMonthCode(monthCodeNumber, isLeapMonth);
        },
        dayOfWeek: computeIsoDayOfWeek,
        daysInWeek: computeIsoDaysInWeek
      };
      var isoYearMonthRefineDeps = {
        leapMonth: noop,
        monthsInYearPart: computeIsoMonthsInYear,
        isoFields: computeIsoFieldsFromParts
      };
      var isoMonthDayRefineDeps = {
        ...{
          ...isoYearMonthRefineDeps,
          daysInMonthParts: computeIsoDaysInMonth
        },
        yearMonthForMonthDay: computeIsoYearMonthForMonthDay
      };
      var isoYearMonthRefineOps = {
        ...nativeYearMonthRefineBase,
        ...isoYearMonthRefineDeps
      };
      var isoDateRefineOps = {
        ...nativeDateRefineBase,
        ...isoMonthDayRefineDeps
      };
      var isoMonthDayRefineOps = {
        ...nativeMonthDayRefineBase,
        ...isoMonthDayRefineDeps
      };
      var isoYearMonthModOps = {
        ...isoYearMonthRefineOps,
        mergeFields: nativeMergeFields
      };
      var isoDateModOps = {
        ...isoDateRefineOps,
        mergeFields: nativeMergeFields
      };
      var isoMonthDayModOps = {
        ...isoMonthDayRefineOps,
        mergeFields: nativeMergeFields
      };
      var isoConvertOps = {
        dateParts: computeIsoDateParts,
        epochMilli: isoArgsToEpochMilli,
        monthAdd: isoMonthAdd
      };
      var isoMoveOpsOnly = {
        ...isoConvertOps,
        monthCodeParts: computeIsoMonthCodeParts,
        monthsInYearPart: computeIsoMonthsInYear,
        daysInMonthParts: computeIsoDaysInMonth,
        leapMonth: noop
      };
      var isoMoveOps = {
        ...nativeMoveBase,
        ...isoMoveOpsOnly
      };
      var isoDiffOps = {
        ...nativeDiffBase,
        ...isoMoveOpsOnly,
        monthsInYearSpan: computeIsoMonthsInYearSpan
      };
      var isoDayOps = {
        day: computeIsoDay
      };
      var isoYearMonthMoveOps = {
        ...isoMoveOps,
        ...isoDayOps
      };
      var isoYearMonthDiffOps = {
        ...isoDiffOps,
        ...isoDayOps
      };
      var isoPartOps = {
        dateParts: computeIsoDateParts,
        eraParts: computeIsoEraParts,
        monthCodeParts: computeIsoMonthCodeParts
      };
      var isoInLeapYearOps = {
        inLeapYear: computeNativeInLeapYear,
        dateParts: computeIsoDateParts,
        inLeapYearPart: computeIsoInLeapYear
      };
      var isoMonthsInYearOps = {
        monthsInYear: computeNativeMonthsInYear,
        dateParts: computeIsoDateParts,
        monthsInYearPart: computeIsoMonthsInYear
      };
      var isoDaysInMonthOps = {
        daysInMonth: computeNativeDaysInMonth,
        dateParts: computeIsoDateParts,
        daysInMonthParts: computeIsoDaysInMonth
      };
      var isoDaysInYearOps = {
        daysInYear: computeNativeDaysInYear,
        dateParts: computeIsoDateParts,
        daysInYearPart: computeIsoDaysInYear
      };
      var isoDayOfYearOps = {
        dayOfYear: computeNativeDayOfYear,
        dateParts: computeIsoDateParts,
        epochMilli: isoArgsToEpochMilli
      };
      var isoWeekOps = {
        ...isoDayOfYearOps,
        weekOfYear: computeNativeWeekOfYear,
        yearOfWeek: computeNativeYearOfWeek,
        weekParts(isoDateFields) {
          function computeWeekShift(yDayOfWeek) {
            return (7 - yDayOfWeek < minDaysInWeek ? 7 : 0) - yDayOfWeek;
          }
          function computeWeeksInYear(delta) {
            const daysInYear = computeIsoDaysInYear(yearOfWeek + delta), sign = delta || 1, y1WeekShift = computeWeekShift(modFloor(y0DayOfWeek + daysInYear * sign, 7));
            return weeksInYear = (daysInYear + (y1WeekShift - y0WeekShift) * sign) / 7;
          }
          const minDaysInWeek = this.id ? 1 : 4, isoDayOfWeek = computeIsoDayOfWeek(isoDateFields), isoDayOfYear = this.dayOfYear(isoDateFields), dayOfWeek = modFloor(isoDayOfWeek - 1, 7), dayOfYear = isoDayOfYear - 1, y0DayOfWeek = modFloor(dayOfWeek - dayOfYear, 7), y0WeekShift = computeWeekShift(y0DayOfWeek);
          let weeksInYear, weekOfYear = Math.floor((dayOfYear - y0WeekShift) / 7) + 1, yearOfWeek = isoDateFields.isoYear;
          return weekOfYear ? weekOfYear > computeWeeksInYear(0) && (weekOfYear = 1, yearOfWeek++) : (weekOfYear = computeWeeksInYear(-1), yearOfWeek--), [weekOfYear, yearOfWeek, weeksInYear];
        }
      };
      var isoMonthDayParseOps = {
        dateParts: computeIsoDateParts,
        monthCodeParts: computeIsoMonthCodeParts,
        yearMonthForMonthDay: computeIsoYearMonthForMonthDay,
        isoFields: computeIsoFieldsFromParts
      };
      var isoStandardOps = {
        ...nativeStandardBase,
        ...isoWeekOps,
        dateParts: computeIsoDateParts,
        eraParts: computeIsoEraParts,
        monthCodeParts: computeIsoMonthCodeParts,
        yearMonthForMonthDay: computeIsoYearMonthForMonthDay,
        inLeapYearPart: computeIsoInLeapYear,
        leapMonth: noop,
        monthsInYearPart: computeIsoMonthsInYear,
        monthsInYearSpan: computeIsoMonthsInYearSpan,
        daysInMonthParts: computeIsoDaysInMonth,
        daysInYearPart: computeIsoDaysInYear,
        isoFields: computeIsoFieldsFromParts,
        epochMilli: isoArgsToEpochMilli,
        monthAdd: isoMonthAdd,
        year(isoFields) {
          return isoFields.isoYear;
        },
        month(isoFields) {
          return isoFields.isoMonth;
        },
        day: computeIsoDay
      };
      var intlYearMonthRefineDeps = {
        leapMonth: computeIntlLeapMonth,
        monthsInYearPart: computeIntlMonthsInYear,
        isoFields: computeIsoFieldsFromIntlParts
      };
      var intlDateRefineDeps = {
        ...intlYearMonthRefineDeps,
        daysInMonthParts: computeIntlDaysInMonth
      };
      var intlMonthDayRefineDeps = {
        ...intlDateRefineDeps,
        yearMonthForMonthDay: computeIntlYearMonthForMonthDay
      };
      var intlYearMonthRefineOps = {
        ...nativeYearMonthRefineBase,
        ...intlYearMonthRefineDeps
      };
      var intlDateRefineOps = {
        ...nativeDateRefineBase,
        ...intlDateRefineDeps
      };
      var intlMonthDayRefineOps = {
        ...nativeMonthDayRefineBase,
        ...intlMonthDayRefineDeps
      };
      var intlYearMonthModOps = {
        ...intlYearMonthRefineOps,
        mergeFields: nativeMergeFields
      };
      var intlDateModOps = {
        ...intlDateRefineOps,
        mergeFields: nativeMergeFields
      };
      var intlMonthDayModOps = {
        ...intlMonthDayRefineOps,
        mergeFields: nativeMergeFields
      };
      var intlConvertOps = {
        dateParts: computeIntlDateParts,
        epochMilli: computeIntlEpochMilli,
        monthAdd: intlMonthAdd
      };
      var intlMoveOpsOnly = {
        ...intlConvertOps,
        monthCodeParts: computeIntlMonthCodeParts,
        monthsInYearPart: computeIntlMonthsInYear,
        daysInMonthParts: computeIntlDaysInMonth,
        leapMonth: computeIntlLeapMonth
      };
      var intlMoveOps = {
        ...nativeMoveBase,
        ...intlMoveOpsOnly
      };
      var intlDiffOps = {
        ...nativeDiffBase,
        ...intlMoveOpsOnly,
        monthsInYearSpan: computeIntlMonthsInYearSpan
      };
      var intlDayOps = {
        day: computeIntlDay
      };
      var intlYearMonthMoveOps = {
        ...intlMoveOps,
        ...intlDayOps
      };
      var intlYearMonthDiffOps = {
        ...intlDiffOps,
        ...intlDayOps
      };
      var intlPartOps = {
        dateParts: computeIntlDateParts,
        eraParts: computeIntlEraParts,
        monthCodeParts: computeIntlMonthCodeParts
      };
      var intlInLeapYearOps = {
        inLeapYear: computeNativeInLeapYear,
        dateParts: computeIntlDateParts,
        inLeapYearPart: computeIntlInLeapYear
      };
      var intlMonthsInYearOps = {
        monthsInYear: computeNativeMonthsInYear,
        dateParts: computeIntlDateParts,
        monthsInYearPart: computeIntlMonthsInYear
      };
      var intlDaysInMonthOps = {
        daysInMonth: computeNativeDaysInMonth,
        dateParts: computeIntlDateParts,
        daysInMonthParts: computeIntlDaysInMonth
      };
      var intlDaysInYearOps = {
        daysInYear: computeNativeDaysInYear,
        dateParts: computeIntlDateParts,
        daysInYearPart: computeIntlDaysInYear
      };
      var intlDayOfYearOps = {
        dayOfYear: computeNativeDayOfYear,
        dateParts: computeIntlDateParts,
        epochMilli: computeIntlEpochMilli
      };
      var intlWeekOps = {
        ...intlDayOfYearOps,
        weekParts() {
          return [];
        },
        weekOfYear: computeNativeWeekOfYear,
        yearOfWeek: computeNativeYearOfWeek
      };
      var intlMonthDayParseOps = {
        dateParts: computeIntlDateParts,
        monthCodeParts: computeIntlMonthCodeParts,
        yearMonthForMonthDay: computeIntlYearMonthForMonthDay,
        isoFields: computeIsoFieldsFromIntlParts
      };
      var intlStandardOps = {
        ...nativeStandardBase,
        ...intlWeekOps,
        dateParts: computeIntlDateParts,
        eraParts: computeIntlEraParts,
        monthCodeParts: computeIntlMonthCodeParts,
        yearMonthForMonthDay: computeIntlYearMonthForMonthDay,
        inLeapYearPart: computeIntlInLeapYear,
        leapMonth: computeIntlLeapMonth,
        monthsInYearPart: computeIntlMonthsInYear,
        monthsInYearSpan: computeIntlMonthsInYearSpan,
        daysInMonthParts: computeIntlDaysInMonth,
        daysInYearPart: computeIntlDaysInYear,
        isoFields: computeIsoFieldsFromIntlParts,
        epochMilli: computeIntlEpochMilli,
        monthAdd: intlMonthAdd,
        year(isoFields) {
          return this.queryFields(isoFields).year;
        },
        month(isoFields) {
          const { year, monthString } = this.queryFields(isoFields), { monthStringToIndex } = this.queryYearData(year);
          return monthStringToIndex[monthString] + 1;
        },
        day: computeIntlDay
      };
      var createNativeYearMonthRefineOps = createNativeOpsCreator(isoYearMonthRefineOps, intlYearMonthRefineOps);
      var createNativeDateRefineOps = createNativeOpsCreator(isoDateRefineOps, intlDateRefineOps);
      var createNativeMonthDayRefineOps = createNativeOpsCreator(isoMonthDayRefineOps, intlMonthDayRefineOps);
      var createNativeYearMonthModOps = createNativeOpsCreator(isoYearMonthModOps, intlYearMonthModOps);
      var createNativeDateModOps = createNativeOpsCreator(isoDateModOps, intlDateModOps);
      var createNativeMonthDayModOps = createNativeOpsCreator(isoMonthDayModOps, intlMonthDayModOps);
      var createNativeConvertOps = createNativeOpsCreator(isoConvertOps, intlConvertOps);
      var createNativeMoveOps = createNativeOpsCreator(isoMoveOps, intlMoveOps);
      var createNativeDiffOps = createNativeOpsCreator(isoDiffOps, intlDiffOps);
      var createNativeDayOps = createNativeOpsCreator(isoDayOps, intlDayOps);
      var createNativeYearMonthMoveOps = createNativeOpsCreator(isoYearMonthMoveOps, intlYearMonthMoveOps);
      var createNativeYearMonthDiffOps = createNativeOpsCreator(isoYearMonthDiffOps, intlYearMonthDiffOps);
      var createNativePartOps = createNativeOpsCreator(isoPartOps, intlPartOps);
      var createNativeInLeapYearOps = createNativeOpsCreator(isoInLeapYearOps, intlInLeapYearOps);
      var createNativeMonthsInYearOps = createNativeOpsCreator(isoMonthsInYearOps, intlMonthsInYearOps);
      var createNativeDaysInMonthOps = createNativeOpsCreator(isoDaysInMonthOps, intlDaysInMonthOps);
      var createNativeDaysInYearOps = createNativeOpsCreator(isoDaysInYearOps, intlDaysInYearOps);
      var createNativeDayOfYearOps = createNativeOpsCreator(isoDayOfYearOps, intlDayOfYearOps);
      var createNativeWeekOps = createNativeOpsCreator(isoWeekOps, intlWeekOps);
      var createNativeMonthDayParseOps = createNativeOpsCreator(isoMonthDayParseOps, intlMonthDayParseOps);
      var createNativeStandardOps = createNativeOpsCreator(isoStandardOps, intlStandardOps);
      var builtinRefiners = {
        ...{
          era: toStringViaPrimitive,
          eraYear: toInteger,
          year: toInteger,
          month: toPositiveInteger,
          monthCode(monthCode) {
            const s = toStringViaPrimitive(monthCode);
            return parseMonthCode(s), s;
          },
          day: toPositiveInteger
        },
        ...mapPropNamesToConstant(timeFieldNamesAsc, toInteger),
        ...mapPropNamesToConstant(durationFieldNamesAsc, toStrictInteger),
        ...{
          offset(offsetString) {
            const s = toStringViaPrimitive(offsetString);
            return parseOffsetNano(s), s;
          }
        }
      };
      var timeFieldsToIso = bindArgs(remapProps, timeFieldNamesAsc, isoTimeFieldNamesAsc);
      var isoTimeFieldsToCal = bindArgs(remapProps, isoTimeFieldNamesAsc, timeFieldNamesAsc);
      var timeZoneNameStrs = ["timeZoneName"];
      var monthDayFallbacks = {
        month: "numeric",
        day: "numeric"
      };
      var yearMonthFallbacks = {
        year: "numeric",
        month: "numeric"
      };
      var dateFallbacks = {
        ...yearMonthFallbacks,
        day: "numeric"
      };
      var timeFallbacks = {
        hour: "numeric",
        minute: "numeric",
        second: "numeric"
      };
      var dateTimeFallbacks = {
        ...dateFallbacks,
        ...timeFallbacks
      };
      var zonedFallbacks = {
        ...dateTimeFallbacks,
        timeZoneName: "short"
      };
      var yearMonthFallbackNames = Object.keys(yearMonthFallbacks);
      var monthDayFallbackNames = Object.keys(monthDayFallbacks);
      var dateFallbackNames = Object.keys(dateFallbacks);
      var timeFallbackNames = Object.keys(timeFallbacks);
      var dateStyleNames = ["dateStyle"];
      var yearMonthStandardNames = [...yearMonthFallbackNames, ...dateStyleNames];
      var monthDayStandardNames = [...monthDayFallbackNames, ...dateStyleNames];
      var dateStandardNames = [...dateFallbackNames, ...dateStyleNames, "weekday"];
      var timeStandardNames = [...timeFallbackNames, "dayPeriod", "timeStyle", "fractionalSecondDigits"];
      var dateTimeStandardNames = [...dateStandardNames, ...timeStandardNames];
      var dateExclusions = [...timeZoneNameStrs, ...timeStandardNames];
      var timeExclusions = [...timeZoneNameStrs, ...dateStandardNames];
      var yearMonthExclusions = [...timeZoneNameStrs, "day", "weekday", ...timeStandardNames];
      var monthDayExclusions = [...timeZoneNameStrs, "year", "weekday", ...timeStandardNames];
      var transformInstantOptions = createOptionsTransformer(dateTimeStandardNames, dateTimeFallbacks);
      var transformZonedOptions = createOptionsTransformer(dateTimeStandardNames, zonedFallbacks);
      var transformDateTimeOptions = createOptionsTransformer(dateTimeStandardNames, dateTimeFallbacks, timeZoneNameStrs);
      var transformDateOptions = createOptionsTransformer(dateStandardNames, dateFallbacks, dateExclusions);
      var transformTimeOptions = createOptionsTransformer(timeStandardNames, timeFallbacks, timeExclusions);
      var transformYearMonthOptions = createOptionsTransformer(yearMonthStandardNames, yearMonthFallbacks, yearMonthExclusions);
      var transformMonthDayOptions = createOptionsTransformer(monthDayStandardNames, monthDayFallbacks, monthDayExclusions);
      var emptyOptions = {};
      var nonBuggyIsoResolve = new RawDateTimeFormat(void 0, {
        calendar: isoCalendarId
      }).resolvedOptions().calendar === isoCalendarId;
      var instantConfig = [transformInstantOptions, getEpochMilli];
      var zonedConfig = [transformZonedOptions, getEpochMilli, 0, (slots0, slots1) => {
        const timeZoneId = slots0.timeZone;
        if (slots1 && slots1.timeZone !== timeZoneId) {
          throw new RangeError(mismatchingTimeZones);
        }
        return timeZoneId;
      }];
      var dateTimeConfig = [transformDateTimeOptions, isoToEpochMilli];
      var dateConfig = [transformDateOptions, isoToEpochMilli];
      var timeConfig = [transformTimeOptions, (isoFields) => isoTimeFieldsToNano(isoFields) / nanoInMilli];
      var yearMonthConfig = [transformYearMonthOptions, isoToEpochMilli, nonBuggyIsoResolve];
      var monthDayConfig = [transformMonthDayOptions, isoToEpochMilli, nonBuggyIsoResolve];
      exports2.DurationBranding = DurationBranding, exports2.InstantBranding = InstantBranding, exports2.PlainDateBranding = PlainDateBranding, exports2.PlainDateTimeBranding = PlainDateTimeBranding, exports2.PlainMonthDayBranding = PlainMonthDayBranding, exports2.PlainTimeBranding = PlainTimeBranding, exports2.PlainYearMonthBranding = PlainYearMonthBranding, exports2.RawDateTimeFormat = RawDateTimeFormat, exports2.ZonedDateTimeBranding = ZonedDateTimeBranding, exports2.absDuration = (slots) => -1 === slots.sign ? negateDuration(slots) : slots, exports2.addBigNanos = addBigNanos, exports2.addDurations = (refineRelativeTo, getCalendarOps, getTimeZoneOps, doSubtract, slots, otherSlots, options) => {
        const relativeToSlots = refineRelativeTo(normalizeOptions(options).relativeTo), maxUnit = Math.max(getMaxDurationUnit(slots), getMaxDurationUnit(otherSlots));
        if (isUniformUnit(maxUnit, relativeToSlots)) {
          return createDurationSlots(checkDurationUnits(((a, b, largestUnit, doSubtract2) => {
            const combined = addBigNanos(durationFieldsToBigNano(a), durationFieldsToBigNano(b), doSubtract2 ? -1 : 1);
            if (!Number.isFinite(combined[0])) {
              throw new RangeError(outOfBoundsDate);
            }
            return {
              ...durationFieldDefaults,
              ...nanoToDurationDayTimeFields(combined, largestUnit)
            };
          })(slots, otherSlots, maxUnit, doSubtract)));
        }
        if (!relativeToSlots) {
          throw new RangeError("Missing relativeTo");
        }
        doSubtract && (otherSlots = negateDurationFields(otherSlots));
        const [marker, calendarOps, timeZoneOps] = createMarkerSystem(getCalendarOps, getTimeZoneOps, relativeToSlots), moveMarker = createMoveMarker(timeZoneOps), diffMarkers = createDiffMarkers(timeZoneOps), midMarker = moveMarker(calendarOps, marker, slots);
        return createDurationSlots(diffMarkers(calendarOps, marker, moveMarker(calendarOps, midMarker, otherSlots), maxUnit));
      }, exports2.alignZonedEpoch = alignZonedEpoch, exports2.bigNanoToExactDays = bigNanoToExactDays, exports2.bigNanoToNumber = bigNanoToNumber, exports2.bindArgs = bindArgs, exports2.buildZonedIsoFields = (getTimeZoneOps, zonedDateTimeSlots) => {
        const isoFields = zonedEpochSlotsToIso(zonedDateTimeSlots, getTimeZoneOps);
        return {
          calendar: zonedDateTimeSlots.calendar,
          ...pluckProps(isoDateTimeFieldNamesAlpha, isoFields),
          offset: formatOffsetNano(isoFields.offsetNanoseconds),
          timeZone: zonedDateTimeSlots.timeZone
        };
      }, exports2.checkEpochNanoInBounds = checkEpochNanoInBounds, exports2.checkIsoDateInBounds = checkIsoDateInBounds, exports2.checkIsoDateTimeInBounds = checkIsoDateTimeInBounds, exports2.clampEntity = clampEntity, exports2.clearIsoFields = clearIsoFields, exports2.compareBigNanos = compareBigNanos, exports2.compareDurations = (refineRelativeTo, getCalendarOps, getTimeZoneOps, durationSlots0, durationSlots1, options) => {
        const relativeToSlots = refineRelativeTo(normalizeOptions(options).relativeTo), maxUnit = Math.max(getMaxDurationUnit(durationSlots0), getMaxDurationUnit(durationSlots1));
        if (allPropsEqual(durationFieldNamesAsc, durationSlots0, durationSlots1)) {
          return 0;
        }
        if (isUniformUnit(maxUnit, relativeToSlots)) {
          return compareBigNanos(durationFieldsToBigNano(durationSlots0), durationFieldsToBigNano(durationSlots1));
        }
        if (!relativeToSlots) {
          throw new RangeError("Missing relativeTo");
        }
        const [marker, calendarOps, timeZoneOps] = createMarkerSystem(getCalendarOps, getTimeZoneOps, relativeToSlots), markerToEpochNano = createMarkerToEpochNano(timeZoneOps), moveMarker = createMoveMarker(timeZoneOps);
        return compareBigNanos(markerToEpochNano(moveMarker(calendarOps, marker, durationSlots0)), markerToEpochNano(moveMarker(calendarOps, marker, durationSlots1)));
      }, exports2.compareInstants = compareInstants, exports2.compareIsoDateFields = compareIsoDateFields, exports2.compareIsoDateTimeFields = compareIsoDateTimeFields, exports2.compareIsoTimeFields = compareIsoTimeFields, exports2.compareZonedDateTimes = compareZonedDateTimes, exports2.computeDayFloor = computeDayFloor, exports2.computeEpochNanoFrac = computeEpochNanoFrac, exports2.computeIsoDayOfWeek = computeIsoDayOfWeek, exports2.computeIsoDaysInWeek = computeIsoDaysInWeek, exports2.computeZonedHoursInDay = (getTimeZoneOps, slots) => {
        const timeZoneOps = getTimeZoneOps(slots.timeZone), isoFields = zonedEpochSlotsToIso(slots, timeZoneOps), [isoFields0, isoFields1] = computeDayInterval(isoFields), hoursExact = bigNanoToNumber(diffBigNanos(getStartOfDayInstantFor(timeZoneOps, isoFields0), getStartOfDayInstantFor(timeZoneOps, isoFields1)), nanoInHour, 1);
        if (hoursExact <= 0) {
          throw new RangeError(invalidProtocolResults);
        }
        return hoursExact;
      }, exports2.computeZonedStartOfDay = (getTimeZoneOps, slots) => {
        const { timeZone, calendar } = slots;
        return createZonedDateTimeSlots(alignZonedEpoch(computeDayFloor, getTimeZoneOps(timeZone), slots), timeZone, calendar);
      }, exports2.constructDurationSlots = (years = 0, months = 0, weeks = 0, days = 0, hours = 0, minutes = 0, seconds = 0, milliseconds = 0, microseconds = 0, nanoseconds = 0) => createDurationSlots(checkDurationUnits(mapProps(toStrictInteger, zipProps(durationFieldNamesAsc, [years, months, weeks, days, hours, minutes, seconds, milliseconds, microseconds, nanoseconds])))), exports2.constructInstantSlots = (epochNano) => createInstantSlots(checkEpochNanoInBounds(bigIntToBigNano(toBigInt(epochNano)))), exports2.constructPlainDateSlots = (refineCalendarArg, isoYear, isoMonth, isoDay, calendarArg = isoCalendarId) => createPlainDateSlots(checkIsoDateInBounds(checkIsoDateFields(mapProps(toInteger, {
        isoYear,
        isoMonth,
        isoDay
      }))), refineCalendarArg(calendarArg)), exports2.constructPlainDateTimeSlots = (refineCalendarArg, isoYear, isoMonth, isoDay, isoHour = 0, isoMinute = 0, isoSecond = 0, isoMillisecond = 0, isoMicrosecond = 0, isoNanosecond = 0, calendarArg = isoCalendarId) => createPlainDateTimeSlots(checkIsoDateTimeInBounds(checkIsoDateTimeFields(mapProps(toInteger, zipProps(isoDateTimeFieldNamesAsc, [isoYear, isoMonth, isoDay, isoHour, isoMinute, isoSecond, isoMillisecond, isoMicrosecond, isoNanosecond])))), refineCalendarArg(calendarArg)), exports2.constructPlainMonthDaySlots = (refineCalendarArg, isoMonth, isoDay, calendarArg = isoCalendarId, referenceIsoYear = isoEpochFirstLeapYear) => {
        const isoMonthInt = toInteger(isoMonth), isoDayInt = toInteger(isoDay), calendarId = refineCalendarArg(calendarArg);
        return createPlainMonthDaySlots(checkIsoDateInBounds(checkIsoDateFields({
          isoYear: toInteger(referenceIsoYear),
          isoMonth: isoMonthInt,
          isoDay: isoDayInt
        })), calendarId);
      }, exports2.constructPlainTimeSlots = (isoHour = 0, isoMinute = 0, isoSecond = 0, isoMillisecond = 0, isoMicrosecond = 0, isoNanosecond = 0) => createPlainTimeSlots(constrainIsoTimeFields(mapProps(toInteger, zipProps(isoTimeFieldNamesAsc, [isoHour, isoMinute, isoSecond, isoMillisecond, isoMicrosecond, isoNanosecond])), 1)), exports2.constructPlainYearMonthSlots = (refineCalendarArg, isoYear, isoMonth, calendarArg = isoCalendarId, referenceIsoDay = 1) => {
        const isoYearInt = toInteger(isoYear), isoMonthInt = toInteger(isoMonth), calendarId = refineCalendarArg(calendarArg);
        return createPlainYearMonthSlots(checkIsoYearMonthInBounds(checkIsoDateFields({
          isoYear: isoYearInt,
          isoMonth: isoMonthInt,
          isoDay: toInteger(referenceIsoDay)
        })), calendarId);
      }, exports2.constructZonedDateTimeSlots = (refineCalendarArg, refineTimeZoneArg, epochNano, timeZoneArg, calendarArg = isoCalendarId) => createZonedDateTimeSlots(checkEpochNanoInBounds(bigIntToBigNano(toBigInt(epochNano))), refineTimeZoneArg(timeZoneArg), refineCalendarArg(calendarArg)), exports2.createDurationSlots = createDurationSlots, exports2.createFormatForPrep = createFormatForPrep, exports2.createFormatPrepper = (config, queryFormat = createFormatForPrep, strictOptions = 0) => {
        const [transformOptions, , , getForcedTimeZoneId] = config;
        return (locales, options = emptyOptions, ...slotsList) => {
          const subformat = queryFormat(getForcedTimeZoneId && getForcedTimeZoneId(...slotsList), locales, options, transformOptions, strictOptions), resolvedOptions = subformat.resolvedOptions();
          return [subformat, ...toEpochMillis(config, resolvedOptions, slotsList)];
        };
      }, exports2.createGetterDescriptors = (getters) => mapProps(((getter) => ({
        get: getter,
        configurable: 1
      })), getters), exports2.createInstantSlots = createInstantSlots, exports2.createNameDescriptors = (name) => createPropDescriptors({
        name
      }, 1), exports2.createNativeConvertOps = createNativeConvertOps, exports2.createNativeDateModOps = createNativeDateModOps, exports2.createNativeDateRefineOps = createNativeDateRefineOps, exports2.createNativeDayOfYearOps = createNativeDayOfYearOps, exports2.createNativeDayOps = createNativeDayOps, exports2.createNativeDaysInMonthOps = createNativeDaysInMonthOps, exports2.createNativeDaysInYearOps = createNativeDaysInYearOps, exports2.createNativeDiffOps = createNativeDiffOps, exports2.createNativeInLeapYearOps = createNativeInLeapYearOps, exports2.createNativeMonthDayModOps = createNativeMonthDayModOps, exports2.createNativeMonthDayParseOps = createNativeMonthDayParseOps, exports2.createNativeMonthDayRefineOps = createNativeMonthDayRefineOps, exports2.createNativeMonthsInYearOps = createNativeMonthsInYearOps, exports2.createNativeMoveOps = createNativeMoveOps, exports2.createNativePartOps = createNativePartOps, exports2.createNativeStandardOps = createNativeStandardOps, exports2.createNativeWeekOps = createNativeWeekOps, exports2.createNativeYearMonthDiffOps = createNativeYearMonthDiffOps, exports2.createNativeYearMonthModOps = createNativeYearMonthModOps, exports2.createNativeYearMonthMoveOps = createNativeYearMonthMoveOps, exports2.createNativeYearMonthRefineOps = createNativeYearMonthRefineOps, exports2.createPlainDateSlots = createPlainDateSlots, exports2.createPlainDateTimeSlots = createPlainDateTimeSlots, exports2.createPlainTimeSlots = createPlainTimeSlots, exports2.createPropDescriptors = createPropDescriptors, exports2.createStringTagDescriptors = (value) => ({
        [Symbol.toStringTag]: {
          value,
          configurable: 1
        }
      }), exports2.createZonedDateTimeSlots = createZonedDateTimeSlots, exports2.dateConfig = dateConfig, exports2.dateTimeConfig = dateTimeConfig, exports2.diffBigNanos = diffBigNanos, exports2.diffInstants = (invert, instantSlots0, instantSlots1, options) => {
        const optionsTuple = refineDiffOptions(invert, options, 3, 5), durationFields = diffEpochNanos(instantSlots0.epochNanoseconds, instantSlots1.epochNanoseconds, ...optionsTuple);
        return createDurationSlots(invert ? negateDurationFields(durationFields) : durationFields);
      }, exports2.diffPlainDateTimes = (getCalendarOps, invert, plainDateTimeSlots0, plainDateTimeSlots1, options) => {
        const calendarId = getCommonCalendarId(plainDateTimeSlots0.calendar, plainDateTimeSlots1.calendar), [largestUnit, smallestUnit, roundingInc, roundingMode] = refineDiffOptions(invert, options, 6), startEpochNano = isoToEpochNano(plainDateTimeSlots0), endEpochNano = isoToEpochNano(plainDateTimeSlots1), sign = compareBigNanos(endEpochNano, startEpochNano);
        let durationFields;
        if (sign) {
          if (largestUnit <= 6) {
            durationFields = diffEpochNanos(startEpochNano, endEpochNano, largestUnit, smallestUnit, roundingInc, roundingMode);
          } else {
            const calendarOps = getCalendarOps(calendarId);
            durationFields = diffDateTimesBig(calendarOps, plainDateTimeSlots0, plainDateTimeSlots1, sign, largestUnit, options), durationFields = roundRelativeDuration(durationFields, endEpochNano, largestUnit, smallestUnit, roundingInc, roundingMode, calendarOps, plainDateTimeSlots0, isoToEpochNano, moveDateTime);
          }
        } else {
          durationFields = durationFieldDefaults;
        }
        return createDurationSlots(invert ? negateDurationFields(durationFields) : durationFields);
      }, exports2.diffPlainDates = (getCalendarOps, invert, plainDateSlots0, plainDateSlots1, options) => {
        const calendarId = getCommonCalendarId(plainDateSlots0.calendar, plainDateSlots1.calendar);
        return diffDateLike(invert, (() => getCalendarOps(calendarId)), plainDateSlots0, plainDateSlots1, ...refineDiffOptions(invert, options, 6, 9, 6));
      }, exports2.diffPlainTimes = (invert, plainTimeSlots0, plainTimeSlots1, options) => {
        const [largestUnit, smallestUnit, roundingInc, roundingMode] = refineDiffOptions(invert, options, 5, 5), timeDiffNano = roundByInc(diffTimes(plainTimeSlots0, plainTimeSlots1), computeNanoInc(smallestUnit, roundingInc), roundingMode), durationFields = {
          ...durationFieldDefaults,
          ...nanoToDurationTimeFields(timeDiffNano, largestUnit)
        };
        return createDurationSlots(invert ? negateDurationFields(durationFields) : durationFields);
      }, exports2.diffPlainYearMonth = (getCalendarOps, invert, plainYearMonthSlots0, plainYearMonthSlots1, options) => {
        const calendarId = getCommonCalendarId(plainYearMonthSlots0.calendar, plainYearMonthSlots1.calendar), optionsTuple = refineDiffOptions(invert, options, 9, 9, 8), calendarOps = getCalendarOps(calendarId), firstOfMonth0 = moveToDayOfMonthUnsafe(calendarOps, plainYearMonthSlots0), firstOfMonth1 = moveToDayOfMonthUnsafe(calendarOps, plainYearMonthSlots1);
        return firstOfMonth0.isoYear === firstOfMonth1.isoYear && firstOfMonth0.isoMonth === firstOfMonth1.isoMonth && firstOfMonth0.isoDay === firstOfMonth1.isoDay ? createDurationSlots(durationFieldDefaults) : diffDateLike(invert, (() => calendarOps), checkIsoDateInBounds(firstOfMonth0), checkIsoDateInBounds(firstOfMonth1), ...optionsTuple, 8);
      }, exports2.diffZonedDateTimes = (getCalendarOps, getTimeZoneOps, invert, slots0, slots1, options) => {
        const calendarId = getCommonCalendarId(slots0.calendar, slots1.calendar), [largestUnit, smallestUnit, roundingInc, roundingMode] = refineDiffOptions(invert, options, 5), epochNano0 = slots0.epochNanoseconds, epochNano1 = slots1.epochNanoseconds, sign = compareBigNanos(epochNano1, epochNano0);
        let durationFields;
        if (sign) {
          if (largestUnit < 6) {
            durationFields = diffEpochNanos(epochNano0, epochNano1, largestUnit, smallestUnit, roundingInc, roundingMode);
          } else {
            const timeZoneOps = getTimeZoneOps(getCommonTimeZoneId(slots0.timeZone, slots1.timeZone)), calendarOps = getCalendarOps(calendarId);
            durationFields = diffZonedEpochsBig(calendarOps, timeZoneOps, slots0, slots1, sign, largestUnit, options), durationFields = roundRelativeDuration(durationFields, epochNano1, largestUnit, smallestUnit, roundingInc, roundingMode, calendarOps, slots0, extractEpochNano, bindArgs(moveZonedEpochs, timeZoneOps));
          }
        } else {
          durationFields = durationFieldDefaults;
        }
        return createDurationSlots(invert ? negateDurationFields(durationFields) : durationFields);
      }, exports2.durationFieldNamesAsc = durationFieldNamesAsc, exports2.durationWithFields = (slots, fields) => {
        return createDurationSlots((initialFields = slots, modFields = fields, checkDurationUnits({
          ...initialFields,
          ...refineFields(modFields, durationFieldNamesAlpha)
        })));
        var initialFields, modFields;
      }, exports2.epochMicroToInstant = (epochMicro) => createInstantSlots(checkEpochNanoInBounds(bigIntToBigNano(toBigInt(epochMicro), nanoInMicro))), exports2.epochMilliToInstant = (epochMilli) => createInstantSlots(checkEpochNanoInBounds(numberToBigNano(toStrictInteger(epochMilli), nanoInMilli))), exports2.epochMilliToIso = epochMilliToIso, exports2.epochNanoToInstant = (epochNano) => createInstantSlots(checkEpochNanoInBounds(bigIntToBigNano(toBigInt(epochNano)))), exports2.epochNanoToIso = epochNanoToIso, exports2.epochSecToInstant = (epochSec) => createInstantSlots(checkEpochNanoInBounds(numberToBigNano(toStrictInteger(epochSec), nanoInSec))), exports2.extractEpochNano = extractEpochNano, exports2.forbiddenValueOf = "Cannot use valueOf", exports2.formatDurationIso = (slots, options) => {
        const [roundingMode, nanoInc, subsecDigits] = refineTimeDisplayOptions(options, 3);
        return nanoInc > 1 && checkDurationUnits(slots = {
          ...slots,
          ...roundDayTimeDurationByInc(slots, nanoInc, roundingMode)
        }), ((durationSlots, subsecDigits2) => {
          const { sign } = durationSlots, abs = -1 === sign ? negateDurationFields(durationSlots) : durationSlots, { hours, minutes } = abs, [wholeSec, subsecNano] = divModBigNano(durationFieldsToBigNano(abs, 3), nanoInSec, divModTrunc);
          checkDurationTimeUnit(wholeSec);
          const subsecNanoString = formatSubsecNano(subsecNano, subsecDigits2), forceSec = subsecDigits2 >= 0 || !sign || subsecNanoString;
          return (sign < 0 ? "-" : "") + "P" + formatDurationFragments({
            Y: formatDurationNumber(abs.years),
            M: formatDurationNumber(abs.months),
            W: formatDurationNumber(abs.weeks),
            D: formatDurationNumber(abs.days)
          }) + (hours || minutes || wholeSec || forceSec ? "T" + formatDurationFragments({
            H: formatDurationNumber(hours),
            M: formatDurationNumber(minutes),
            S: formatDurationNumber(wholeSec, forceSec) + subsecNanoString
          }) : "");
        })(slots, subsecDigits);
      }, exports2.formatInstantIso = (refineTimeZoneString, getTimeZoneOps, instantSlots, options) => {
        const [timeZoneArg, roundingMode, nanoInc, subsecDigits] = ((options2) => {
          const timeDisplayTuple = refineTimeDisplayTuple(options2 = normalizeOptions(options2));
          return [options2.timeZone, ...timeDisplayTuple];
        })(options), providedTimeZone = void 0 !== timeZoneArg;
        return ((providedTimeZone2, timeZoneOps, epochNano, roundingMode2, nanoInc2, subsecDigits2) => {
          epochNano = roundBigNanoByInc(epochNano, nanoInc2, roundingMode2, 1);
          const offsetNano = timeZoneOps.getOffsetNanosecondsFor(epochNano);
          return formatIsoDateTimeFields(epochNanoToIso(epochNano, offsetNano), subsecDigits2) + (providedTimeZone2 ? formatOffsetNano(roundToMinute(offsetNano)) : "Z");
        })(providedTimeZone, getTimeZoneOps(providedTimeZone ? refineTimeZoneString(timeZoneArg) : utcTimeZoneId), instantSlots.epochNanoseconds, roundingMode, nanoInc, subsecDigits);
      }, exports2.formatMonthCode = formatMonthCode, exports2.formatOffsetNano = formatOffsetNano, exports2.formatPlainDateIso = (plainDateSlots, options) => {
        return calendarId = plainDateSlots.calendar, isoFields = plainDateSlots, calendarDisplay = refineDateDisplayOptions(options), formatIsoDateFields(isoFields) + formatCalendar(calendarId, calendarDisplay);
        var calendarId, isoFields, calendarDisplay;
      }, exports2.formatPlainDateTimeIso = (plainDateTimeSlots0, options) => {
        const [a, b, c, d] = ((options2) => (options2 = normalizeOptions(options2), [refineCalendarDisplay(options2), ...refineTimeDisplayTuple(options2)]))(options);
        return calendarId = plainDateTimeSlots0.calendar, calendarDisplay = a, subsecDigits = d, formatIsoDateTimeFields(roundDateTimeToNano(plainDateTimeSlots0, c, b), subsecDigits) + formatCalendar(calendarId, calendarDisplay);
        var calendarId, calendarDisplay, subsecDigits;
      }, exports2.formatPlainMonthDayIso = (plainMonthDaySlots, options) => formatDateLikeIso(plainMonthDaySlots.calendar, formatIsoMonthDayFields, plainMonthDaySlots, refineDateDisplayOptions(options)), exports2.formatPlainTimeIso = (slots, options) => {
        const [a, b, c] = refineTimeDisplayOptions(options);
        return subsecDigits = c, formatIsoTimeFields(roundTimeToNano(slots, b, a)[0], subsecDigits);
        var subsecDigits;
      }, exports2.formatPlainYearMonthIso = (plainYearMonthSlots, options) => formatDateLikeIso(plainYearMonthSlots.calendar, formatIsoYearMonthFields, plainYearMonthSlots, refineDateDisplayOptions(options)), exports2.formatZonedDateTimeIso = (getTimeZoneOps, zonedDateTimeSlots0, options) => {
        const [a, b, c, d, e, f] = ((options2) => {
          options2 = normalizeOptions(options2);
          const calendarDisplay = refineCalendarDisplay(options2), subsecDigits = refineSubsecDigits(options2), offsetDisplay = refineOffsetDisplay(options2), roundingMode = refineRoundingMode(options2, 4), smallestUnit = refineSmallestUnit(options2, 4);
          return [calendarDisplay, refineTimeZoneDisplay(options2), offsetDisplay, roundingMode, ...refineSmallestUnitAndSubsecDigits(smallestUnit, subsecDigits)];
        })(options);
        return ((getTimeZoneOps2, calendarId, timeZoneId, epochNano, calendarDisplay, timeZoneDisplay, offsetDisplay, roundingMode, nanoInc, subsecDigits) => {
          epochNano = roundBigNanoByInc(epochNano, nanoInc, roundingMode, 1);
          const offsetNano = getTimeZoneOps2(timeZoneId).getOffsetNanosecondsFor(epochNano);
          return formatIsoDateTimeFields(epochNanoToIso(epochNano, offsetNano), subsecDigits) + formatOffsetNano(roundToMinute(offsetNano), offsetDisplay) + ((timeZoneId2, timeZoneDisplay2) => 1 !== timeZoneDisplay2 ? "[" + (2 === timeZoneDisplay2 ? "!" : "") + timeZoneId2 + "]" : "")(timeZoneId, timeZoneDisplay) + formatCalendar(calendarId, calendarDisplay);
        })(getTimeZoneOps, zonedDateTimeSlots0.calendar, zonedDateTimeSlots0.timeZone, zonedDateTimeSlots0.epochNanoseconds, a, b, c, d, e, f);
      }, exports2.getCommonCalendarId = getCommonCalendarId, exports2.getCommonTimeZoneId = getCommonTimeZoneId, exports2.getCurrentEpochNano = getCurrentEpochNano, exports2.getCurrentIsoDateTime = (timeZoneOps) => {
        const epochNano = getCurrentEpochNano();
        return epochNanoToIso(epochNano, timeZoneOps.getOffsetNanosecondsFor(epochNano));
      }, exports2.getCurrentTimeZoneId = () => new RawDateTimeFormat().resolvedOptions().timeZone, exports2.getDurationBlank = (slots) => !slots.sign, exports2.getEpochMicro = (slots) => bigNanoToBigInt(slots.epochNanoseconds, nanoInMicro), exports2.getEpochMilli = getEpochMilli, exports2.getEpochNano = (slots) => bigNanoToBigInt(slots.epochNanoseconds), exports2.getEpochSec = (slots) => epochNanoToSec(slots.epochNanoseconds), exports2.getSingleInstantFor = getSingleInstantFor, exports2.identity = (arg) => arg, exports2.instantConfig = instantConfig, exports2.instantToZonedDateTime = (instantSlots, timeZoneId, calendarId = isoCalendarId) => createZonedDateTimeSlots(instantSlots.epochNanoseconds, timeZoneId, calendarId), exports2.instantsEqual = (instantSlots0, instantSlots1) => !compareInstants(instantSlots0, instantSlots1), exports2.invalidBag = "Invalid bag", exports2.invalidCalendar = invalidCalendar, exports2.invalidCallingContext = "Invalid calling context", exports2.invalidFormatType = (branding) => `Cannot format ${branding}`, exports2.invalidTimeZone = invalidTimeZone, exports2.isObjectLike = isObjectLike, exports2.isoCalendarId = isoCalendarId, exports2.isoDateFieldNamesAlpha = isoDateFieldNamesAlpha, exports2.isoTimeFieldDefaults = isoTimeFieldDefaults, exports2.isoTimeFieldNamesAsc = isoTimeFieldNamesAsc, exports2.isoTimeFieldsToCal = isoTimeFieldsToCal, exports2.isoToEpochNano = isoToEpochNano, exports2.mapPropNames = mapPropNames, exports2.mapProps = mapProps, exports2.memoize = memoize, exports2.mismatchingFormatTypes = "Mismatching types for formatting", exports2.monthDayConfig = monthDayConfig, exports2.moveBigNano = moveBigNano, exports2.moveByDays = moveByDays, exports2.moveDateTime = moveDateTime, exports2.moveInstant = (doSubtract, instantSlots, durationSlots) => createInstantSlots(checkEpochNanoInBounds(addBigNanos(instantSlots.epochNanoseconds, ((fields) => {
        if (durationHasDateParts(fields)) {
          throw new RangeError("Cannot use large units");
        }
        return durationFieldsToBigNano(fields, 5);
      })(doSubtract ? negateDurationFields(durationSlots) : durationSlots)))), exports2.movePlainDate = (getCalendarOps, doSubtract, plainDateSlots, durationSlots, options) => {
        const { calendar } = plainDateSlots;
        return createPlainDateSlots(moveDate(getCalendarOps(calendar), plainDateSlots, doSubtract ? negateDurationFields(durationSlots) : durationSlots, options), calendar);
      }, exports2.movePlainDateTime = (getCalendarOps, doSubtract, plainDateTimeSlots, durationSlots, options = /* @__PURE__ */ Object.create(null)) => {
        const { calendar } = plainDateTimeSlots;
        return createPlainDateTimeSlots(moveDateTime(getCalendarOps(calendar), plainDateTimeSlots, doSubtract ? negateDurationFields(durationSlots) : durationSlots, options), calendar);
      }, exports2.movePlainTime = (doSubtract, slots, durationSlots) => createPlainTimeSlots(moveTime(slots, doSubtract ? negateDurationFields(durationSlots) : durationSlots)[0]), exports2.movePlainYearMonth = (getCalendarOps, doSubtract, plainYearMonthSlots, durationSlots, options) => {
        const calendarId = plainYearMonthSlots.calendar, calendarOps = getCalendarOps(calendarId);
        let isoDateFields = checkIsoDateInBounds(moveToDayOfMonthUnsafe(calendarOps, plainYearMonthSlots));
        doSubtract && (durationSlots = negateDuration(durationSlots)), durationSlots.sign < 0 && (isoDateFields = calendarOps.dateAdd(isoDateFields, {
          ...durationFieldDefaults,
          months: 1
        }), isoDateFields = moveByDays(isoDateFields, -1));
        const movedIsoDateFields = calendarOps.dateAdd(isoDateFields, durationSlots, options);
        return createPlainYearMonthSlots(moveToDayOfMonthUnsafe(calendarOps, movedIsoDateFields), calendarId);
      }, exports2.moveToDayOfMonthUnsafe = moveToDayOfMonthUnsafe, exports2.moveZonedDateTime = (getCalendarOps, getTimeZoneOps, doSubtract, zonedDateTimeSlots, durationSlots, options = /* @__PURE__ */ Object.create(null)) => {
        const timeZoneOps = getTimeZoneOps(zonedDateTimeSlots.timeZone), calendarOps = getCalendarOps(zonedDateTimeSlots.calendar);
        return {
          ...zonedDateTimeSlots,
          ...moveZonedEpochs(timeZoneOps, calendarOps, zonedDateTimeSlots, doSubtract ? negateDurationFields(durationSlots) : durationSlots, options)
        };
      }, exports2.moveZonedEpochs = moveZonedEpochs, exports2.nanoInHour = nanoInHour, exports2.nanoInMicro = nanoInMicro, exports2.nanoInMilli = nanoInMilli, exports2.nanoInMinute = nanoInMinute, exports2.nanoInSec = nanoInSec, exports2.nanoInUtcDay = nanoInUtcDay, exports2.nativeYearMonthAdd = nativeYearMonthAdd, exports2.negateDuration = negateDuration, exports2.numberToBigNano = numberToBigNano, exports2.parseCalendarId = (s) => {
        const res = parseDateTimeLike(s) || parseYearMonthOnly(s) || parseMonthDayOnly(s);
        return res ? res.calendar : s;
      }, exports2.parseDuration = (s) => {
        const parsed = ((s2) => {
          const parts = durationRegExp.exec(s2);
          return parts ? ((parts2) => {
            function parseUnit(wholeStr, fracStr, timeUnit) {
              let leftoverUnits = 0, wholeUnits = 0;
              if (timeUnit && ([leftoverUnits, leftoverNano] = divModFloor(leftoverNano, unitNanoMap[timeUnit])), void 0 !== wholeStr) {
                if (hasAnyFrac) {
                  throw new RangeError(invalidSubstring(wholeStr));
                }
                wholeUnits = ((s3) => {
                  const n = parseInt(s3);
                  if (!Number.isFinite(n)) {
                    throw new RangeError(invalidSubstring(s3));
                  }
                  return n;
                })(wholeStr), hasAny = 1, fracStr && (leftoverNano = parseSubsecNano(fracStr) * (unitNanoMap[timeUnit] / nanoInSec), hasAnyFrac = 1);
              }
              return leftoverUnits + wholeUnits;
            }
            let hasAny = 0, hasAnyFrac = 0, leftoverNano = 0, durationFields = {
              ...zipProps(durationFieldNamesAsc, [parseUnit(parts2[2]), parseUnit(parts2[3]), parseUnit(parts2[4]), parseUnit(parts2[5]), parseUnit(parts2[6], parts2[7], 5), parseUnit(parts2[8], parts2[9], 4), parseUnit(parts2[10], parts2[11], 3)]),
              ...nanoToGivenFields(leftoverNano, 2, durationFieldNamesAsc)
            };
            if (!hasAny) {
              throw new RangeError(noValidFields(durationFieldNamesAsc));
            }
            return parseSign(parts2[1]) < 0 && (durationFields = negateDurationFields(durationFields)), durationFields;
          })(parts) : void 0;
        })(requireString(s));
        if (!parsed) {
          throw new RangeError(failedParse(s));
        }
        return createDurationSlots(checkDurationUnits(parsed));
      }, exports2.parseInstant = (s) => {
        const organized = parseDateTimeLike(s = toStringViaPrimitive(s));
        if (!organized) {
          throw new RangeError(failedParse(s));
        }
        let offsetNano;
        if (organized.hasZ) {
          offsetNano = 0;
        } else {
          if (!organized.offset) {
            throw new RangeError(failedParse(s));
          }
          offsetNano = parseOffsetNano(organized.offset);
        }
        return organized.timeZone && parseOffsetNanoMaybe(organized.timeZone, 1), createInstantSlots(isoToEpochNanoWithOffset(checkIsoDateTimeFields(organized), offsetNano));
      }, exports2.parsePlainDate = parsePlainDate, exports2.parsePlainDateTime = (s) => {
        const organized = parseDateTimeLike(requireString(s));
        if (!organized || organized.hasZ) {
          throw new RangeError(failedParse(s));
        }
        return createPlainDateTimeSlots(finalizeDateTime(organized));
      }, exports2.parsePlainMonthDay = (getCalendarOps, s) => {
        const organized = parseMonthDayOnly(requireString(s));
        if (organized) {
          return requireIsoCalendar(organized), createPlainMonthDaySlots(checkIsoDateFields(organized));
        }
        const dateSlots = parsePlainDate(s, 0, 1), { calendar } = dateSlots, calendarOps = getCalendarOps(calendar), [origYear, origMonth, day] = calendarOps.dateParts(dateSlots), [monthCodeNumber, isLeapMonth] = calendarOps.monthCodeParts(origYear, origMonth), [year, month] = calendarOps.yearMonthForMonthDay(monthCodeNumber, isLeapMonth, day);
        return createPlainMonthDaySlots(checkIsoDateInBounds(calendarOps.isoFields(year, month, day)), calendar);
      }, exports2.parsePlainTime = (s) => {
        let altParsed, organized = ((s2) => {
          const parts = timeRegExp.exec(s2);
          return parts ? (organizeAnnotationParts(parts[10]), organizeTimeParts(parts)) : void 0;
        })(requireString(s));
        if (!organized) {
          if (organized = parseDateTimeLike(s), !organized) {
            throw new RangeError(failedParse(s));
          }
          if (!organized.hasTime) {
            throw new RangeError(failedParse(s));
          }
          if (organized.hasZ) {
            throw new RangeError(invalidSubstring("Z"));
          }
          requireIsoCalendar(organized);
        }
        if ((altParsed = parseYearMonthOnly(s)) && isIsoDateFieldsValid(altParsed)) {
          throw new RangeError(failedParse(s));
        }
        if ((altParsed = parseMonthDayOnly(s)) && isIsoDateFieldsValid(altParsed)) {
          throw new RangeError(failedParse(s));
        }
        return createPlainTimeSlots(constrainIsoTimeFields(organized, 1));
      }, exports2.parsePlainYearMonth = (getCalendarOps, s) => {
        const organized = parseYearMonthOnly(requireString(s));
        if (organized) {
          return requireIsoCalendar(organized), createPlainYearMonthSlots(checkIsoYearMonthInBounds(checkIsoDateFields(organized)));
        }
        const isoSlots = parsePlainDate(s, 1);
        return createPlainYearMonthSlots(moveToDayOfMonthUnsafe(getCalendarOps(isoSlots.calendar), isoSlots));
      }, exports2.parseRelativeToSlots = (s) => {
        const organized = parseDateTimeLike(requireString(s));
        if (!organized) {
          throw new RangeError(failedParse(s));
        }
        if (organized.timeZone) {
          return finalizeZonedDateTime(organized, organized.offset ? parseOffsetNano(organized.offset) : void 0);
        }
        if (organized.hasZ) {
          throw new RangeError(failedParse(s));
        }
        return finalizeDate(organized);
      }, exports2.parseTimeZoneId = (s) => {
        const parsed = parseDateTimeLike(s);
        return parsed && (parsed.timeZone || parsed.hasZ && utcTimeZoneId || parsed.offset) || s;
      }, exports2.parseZonedDateTime = (s, options) => {
        const organized = parseDateTimeLike(requireString(s));
        if (!organized || !organized.timeZone) {
          throw new RangeError(failedParse(s));
        }
        const { offset } = organized, offsetNano = offset ? parseOffsetNano(offset) : void 0, [, offsetDisambig, epochDisambig] = refineZonedFieldOptions(options);
        return finalizeZonedDateTime(organized, offsetNano, offsetDisambig, epochDisambig);
      }, exports2.plainDateTimeToPlainMonthDay = (getCalendarOps, plainDateTimeSlots, plainDateFields) => convertToPlainMonthDay(getCalendarOps(plainDateTimeSlots.calendar), plainDateFields), exports2.plainDateTimeToPlainYearMonth = (getCalendarOps, plainDateTimeSlots, plainDateFields) => {
        const calendarOps = getCalendarOps(plainDateTimeSlots.calendar);
        return createPlainYearMonthSlots({
          ...plainDateTimeSlots,
          ...convertToPlainYearMonth(calendarOps, plainDateFields)
        });
      }, exports2.plainDateTimeToZonedDateTime = (getTimeZoneOps, plainDateTimeSlots, timeZoneId, options) => createZonedDateTimeSlots(checkEpochNanoInBounds(((getTimeZoneOps2, timeZoneId2, isoFields, options2) => {
        const epochDisambig = ((options3) => refineEpochDisambig(normalizeOptions(options3)))(options2);
        return getSingleInstantFor(getTimeZoneOps2(timeZoneId2), isoFields, epochDisambig);
      })(getTimeZoneOps, timeZoneId, plainDateTimeSlots, options)), timeZoneId, plainDateTimeSlots.calendar), exports2.plainDateTimeWithFields = (getCalendarOps, plainDateTimeSlots, modFields, options) => {
        const calendarOps = getCalendarOps(plainDateTimeSlots.calendar), validFieldNames = [...calendarOps.fields(dateFieldNamesAlpha), ...timeFieldNamesAsc].sort(), origFields = {
          ...computeDateEssentials(slots = plainDateTimeSlots),
          hour: slots.isoHour,
          minute: slots.isoMinute,
          second: slots.isoSecond,
          millisecond: slots.isoMillisecond,
          microsecond: slots.isoMicrosecond,
          nanosecond: slots.isoNanosecond
        };
        var slots;
        const partialFields = refineFields(modFields, validFieldNames), overflow = refineOverflowOptions(options), mergedCalendarFields = calendarOps.mergeFields(origFields, partialFields), mergedAllFields = {
          ...origFields,
          ...partialFields
        };
        return createPlainDateTimeSlots(checkIsoDateTimeInBounds({
          ...calendarOps.dateFromFields(mergedCalendarFields, fabricateOverflowOptions(overflow)),
          ...constrainIsoTimeFields(timeFieldsToIso(mergedAllFields), overflow)
        }));
      }, exports2.plainDateTimeWithPlainDate = (plainDateTimeSlots, plainDateSlots) => createPlainDateTimeSlots({
        ...plainDateTimeSlots,
        ...plainDateSlots
      }, getPreferredCalendarId(plainDateTimeSlots.calendar, plainDateSlots.calendar)), exports2.plainDateTimeWithPlainTime = (plainDateTimeSlots, plainTimeSlots = isoTimeFieldDefaults) => createPlainDateTimeSlots(checkIsoDateTimeInBounds({
        ...plainDateTimeSlots,
        ...plainTimeSlots
      })), exports2.plainDateTimesEqual = (plainDateTimeSlots0, plainDateTimeSlots1) => !compareIsoDateTimeFields(plainDateTimeSlots0, plainDateTimeSlots1) && plainDateTimeSlots0.calendar === plainDateTimeSlots1.calendar, exports2.plainDateToPlainDateTime = (plainDateSlots, plainTimeFields = isoTimeFieldDefaults) => createPlainDateTimeSlots(checkIsoDateTimeInBounds({
        ...plainDateSlots,
        ...plainTimeFields
      })), exports2.plainDateToPlainMonthDay = (getCalendarOps, plainDateSlots, plainDateFields) => convertToPlainMonthDay(getCalendarOps(plainDateSlots.calendar), plainDateFields), exports2.plainDateToPlainYearMonth = (getCalendarOps, plainDateSlots, plainDateFields) => convertToPlainYearMonth(getCalendarOps(plainDateSlots.calendar), plainDateFields), exports2.plainDateToZonedDateTime = (refineTimeZoneString, refinePlainTimeArg, getTimeZoneOps, plainDateSlots, options) => {
        const timeZoneId = refineTimeZoneString(options.timeZone), plainTimeArg = options.plainTime, isoTimeFields = void 0 !== plainTimeArg ? refinePlainTimeArg(plainTimeArg) : void 0, timeZoneOps = getTimeZoneOps(timeZoneId);
        let epochNano;
        return epochNano = isoTimeFields ? getSingleInstantFor(timeZoneOps, {
          ...plainDateSlots,
          ...isoTimeFields
        }) : getStartOfDayInstantFor(timeZoneOps, {
          ...plainDateSlots,
          ...isoTimeFieldDefaults
        }), createZonedDateTimeSlots(epochNano, timeZoneId, plainDateSlots.calendar);
      }, exports2.plainDateWithFields = (getCalendarOps, plainDateSlots, modFields, options) => {
        const calendarOps = getCalendarOps(plainDateSlots.calendar), validFieldNames = calendarOps.fields(dateFieldNamesAlpha).sort(), origFields = computeDateEssentials(plainDateSlots), partialFields = refineFields(modFields, validFieldNames), mergedFields = calendarOps.mergeFields(origFields, partialFields);
        return calendarOps.dateFromFields(mergedFields, options);
      }, exports2.plainDatesEqual = (plainDateSlots0, plainDateSlots1) => !compareIsoDateFields(plainDateSlots0, plainDateSlots1) && plainDateSlots0.calendar === plainDateSlots1.calendar, exports2.plainMonthDayToPlainDate = (getCalendarOps, plainMonthDaySlots, plainMonthDayFields, bag) => ((calendarOps, input, bag2) => convertToIso(calendarOps, input, monthCodeDayFieldNames, requireObjectLike(bag2), yearFieldNames))(getCalendarOps(plainMonthDaySlots.calendar), plainMonthDayFields, bag), exports2.plainMonthDayWithFields = (getCalendarOps, plainMonthDaySlots, modFields, options) => {
        const calendarOps = getCalendarOps(plainMonthDaySlots.calendar), validFieldNames = calendarOps.fields(dateFieldNamesAlpha).sort(), origFields = ((slots) => {
          const calendarOps2 = createNativePartOps(slots.calendar), [year, month, day] = calendarOps2.dateParts(slots), [monthCodeNumber, isLeapMonth] = calendarOps2.monthCodeParts(year, month);
          return {
            monthCode: formatMonthCode(monthCodeNumber, isLeapMonth),
            day
          };
        })(plainMonthDaySlots), partialFields = refineFields(modFields, validFieldNames), mergedFields = calendarOps.mergeFields(origFields, partialFields);
        return calendarOps.monthDayFromFields(mergedFields, options);
      }, exports2.plainMonthDaysEqual = (plainMonthDaySlots0, plainMonthDaySlots1) => !compareIsoDateFields(plainMonthDaySlots0, plainMonthDaySlots1) && plainMonthDaySlots0.calendar === plainMonthDaySlots1.calendar, exports2.plainTimeToPlainDateTime = (plainTimeSlots0, plainDateSlots1) => createPlainDateTimeSlots(checkIsoDateTimeInBounds({
        ...plainTimeSlots0,
        ...plainDateSlots1
      })), exports2.plainTimeToZonedDateTime = (refineTimeZoneString, refinePlainDateArg, getTimeZoneOps, slots, options) => {
        const refinedOptions = requireObjectLike(options), plainDateSlots = refinePlainDateArg(refinedOptions.plainDate), timeZoneId = refineTimeZoneString(refinedOptions.timeZone);
        return createZonedDateTimeSlots(getSingleInstantFor(getTimeZoneOps(timeZoneId), {
          ...plainDateSlots,
          ...slots
        }), timeZoneId, plainDateSlots.calendar);
      }, exports2.plainTimeWithFields = (initialFields, mod, options) => createPlainTimeSlots(((initialFields2, modFields, options2) => refineTimeBag({
        ...pluckProps(timeFieldNamesAlpha, initialFields2),
        ...refineFields(modFields, timeFieldNamesAlpha)
      }, refineOverflowOptions(options2)))(initialFields, mod, options)), exports2.plainTimesEqual = (plainTimeSlots0, plainTimeSlots1) => !compareIsoTimeFields(plainTimeSlots0, plainTimeSlots1), exports2.plainYearMonthToPlainDate = (getCalendarOps, plainYearMonthSlots, plainYearMonthFields, bag) => ((calendarOps, input, bag2) => convertToIso(calendarOps, input, yearMonthCodeFieldNames, requireObjectLike(bag2), dayFieldNames))(getCalendarOps(plainYearMonthSlots.calendar), plainYearMonthFields, bag), exports2.plainYearMonthWithFields = (getCalendarOps, plainYearMonthSlots, modFields, options) => {
        const calendarOps = getCalendarOps(plainYearMonthSlots.calendar), validFieldNames = calendarOps.fields(yearMonthFieldNames).sort(), origFields = ((slots) => {
          const calendarOps2 = createNativePartOps(slots.calendar), [year, month] = calendarOps2.dateParts(slots), [monthCodeNumber, isLeapMonth] = calendarOps2.monthCodeParts(year, month);
          return {
            year,
            monthCode: formatMonthCode(monthCodeNumber, isLeapMonth)
          };
        })(plainYearMonthSlots), partialFields = refineFields(modFields, validFieldNames), mergedFields = calendarOps.mergeFields(origFields, partialFields);
        return calendarOps.yearMonthFromFields(mergedFields, options);
      }, exports2.plainYearMonthsEqual = (plainYearMonthSlots0, plainYearMonthSlots1) => !compareIsoDateFields(plainYearMonthSlots0, plainYearMonthSlots1) && plainYearMonthSlots0.calendar === plainYearMonthSlots1.calendar, exports2.pluckProps = pluckProps, exports2.prepareZonedEpochDiff = prepareZonedEpochDiff, exports2.queryNativeTimeZone = queryNativeTimeZone, exports2.refineCalendarId = (id) => resolveCalendarId(requireString(id)), exports2.refineDirectionOptions = (options) => {
        const normalizedOptions = normalizeOptionsOrString(options, "direction"), res = refineChoiceOption("direction", directionMap, normalizedOptions, 0);
        if (!res) {
          throw new RangeError(invalidEntity("direction", res));
        }
        return res;
      }, exports2.refineDurationBag = (bag) => {
        const durationFields = refineFields(bag, durationFieldNamesAlpha);
        return createDurationSlots(checkDurationUnits({
          ...durationFieldDefaults,
          ...durationFields
        }));
      }, exports2.refineMaybeZonedDateTimeBag = (refineTimeZoneString, getTimeZoneOps, calendarOps, bag) => {
        const fields = refineCalendarFields(calendarOps, bag, dateFieldNamesAlpha, [], timeAndZoneFieldNames);
        if (void 0 !== fields.timeZone) {
          const isoDateFields = calendarOps.dateFromFields(fields), isoTimeFields = refineTimeBag(fields), timeZoneId = refineTimeZoneString(fields.timeZone);
          return {
            epochNanoseconds: getMatchingInstantFor(getTimeZoneOps(timeZoneId), {
              ...isoDateFields,
              ...isoTimeFields
            }, void 0 !== fields.offset ? parseOffsetNano(fields.offset) : void 0),
            timeZone: timeZoneId
          };
        }
        return {
          ...calendarOps.dateFromFields(fields),
          ...isoTimeFieldDefaults
        };
      }, exports2.refineOverflowOptions = refineOverflowOptions, exports2.refinePlainDateBag = (calendarOps, bag, options, requireFields = []) => {
        const fields = refineCalendarFields(calendarOps, bag, dateFieldNamesAlpha, requireFields);
        return calendarOps.dateFromFields(fields, options);
      }, exports2.refinePlainDateTimeBag = (calendarOps, bag, options) => {
        const fields = refineCalendarFields(calendarOps, bag, dateFieldNamesAlpha, [], timeFieldNamesAsc), overflow = refineOverflowOptions(options);
        return createPlainDateTimeSlots(checkIsoDateTimeInBounds({
          ...calendarOps.dateFromFields(fields, fabricateOverflowOptions(overflow)),
          ...refineTimeBag(fields, overflow)
        }));
      }, exports2.refinePlainMonthDayBag = (calendarOps, calendarAbsent, bag, options) => {
        const fields = refineCalendarFields(calendarOps, bag, dateFieldNamesAlpha, dayFieldNames);
        return calendarAbsent && void 0 !== fields.month && void 0 === fields.monthCode && void 0 === fields.year && (fields.year = isoEpochFirstLeapYear), calendarOps.monthDayFromFields(fields, options);
      }, exports2.refinePlainTimeBag = (bag, options) => createPlainTimeSlots(refineTimeBag(refineFields(bag, timeFieldNamesAlpha, [], 1), refineOverflowOptions(options))), exports2.refinePlainYearMonthBag = (calendarOps, bag, options, requireFields) => {
        const fields = refineCalendarFields(calendarOps, bag, yearMonthFieldNames, requireFields);
        return calendarOps.yearMonthFromFields(fields, options);
      }, exports2.refineTimeZoneId = (id) => resolveTimeZoneId(requireString(id)), exports2.refineUnitDiffOptions = (smallestUnit, options) => void 0 !== options ? refineRoundingMathOptions(smallestUnit, options, 1) : [], exports2.refineUnitRoundOptions = (smallestUnit, options) => void 0 !== options ? refineRoundingMathOptions(smallestUnit, options) : [1, 7], exports2.refineZonedDateTimeBag = (refineTimeZoneString, getTimeZoneOps, calendarOps, calendarId, bag, options) => {
        const fields = refineCalendarFields(calendarOps, bag, dateFieldNamesAlpha, timeZoneFieldNames, timeAndZoneFieldNames), timeZoneId = refineTimeZoneString(fields.timeZone), [overflow, offsetDisambig, epochDisambig] = refineZonedFieldOptions(options), isoDateFields = calendarOps.dateFromFields(fields, fabricateOverflowOptions(overflow)), isoTimeFields = refineTimeBag(fields, overflow);
        return createZonedDateTimeSlots(getMatchingInstantFor(getTimeZoneOps(timeZoneId), {
          ...isoDateFields,
          ...isoTimeFields
        }, void 0 !== fields.offset ? parseOffsetNano(fields.offset) : void 0, offsetDisambig, epochDisambig), timeZoneId, calendarId);
      }, exports2.refineZonedFieldOptions = refineZonedFieldOptions, exports2.requireBoolean = requireBoolean, exports2.requireInteger = requireInteger, exports2.requireIntegerOrUndefined = (input) => {
        if (void 0 !== input) {
          return requireInteger(input);
        }
      }, exports2.requireNumberIsInteger = requireNumberIsInteger, exports2.requireObjectLike = requireObjectLike, exports2.requirePositiveInteger = requirePositiveInteger, exports2.requirePositiveIntegerOrUndefined = (input) => {
        if (void 0 !== input) {
          return requirePositiveInteger(input);
        }
      }, exports2.requireString = requireString, exports2.requireStringOrUndefined = (input) => {
        if (void 0 !== input) {
          return requireString(input);
        }
      }, exports2.resolveCalendarId = resolveCalendarId, exports2.resolveTimeZoneId = resolveTimeZoneId, exports2.roundBigNanoByInc = roundBigNanoByInc, exports2.roundByInc = roundByInc, exports2.roundDuration = (refineRelativeTo, getCalendarOps, getTimeZoneOps, slots, options) => {
        const durationLargestUnit = getMaxDurationUnit(slots), [largestUnit, smallestUnit, roundingInc, roundingMode, relativeToSlots] = ((options2, defaultLargestUnit, refineRelativeTo2) => {
          options2 = normalizeOptionsOrString(options2, smallestUnitStr);
          let largestUnit2 = refineLargestUnit(options2);
          const relativeToInternals = refineRelativeTo2(options2.relativeTo);
          let roundingInc2 = parseRoundingIncInteger(options2);
          const roundingMode2 = refineRoundingMode(options2, 7);
          let smallestUnit2 = refineSmallestUnit(options2);
          if (void 0 === largestUnit2 && void 0 === smallestUnit2) {
            throw new RangeError("Required smallestUnit or largestUnit");
          }
          if (null == smallestUnit2 && (smallestUnit2 = 0), null == largestUnit2 && (largestUnit2 = Math.max(smallestUnit2, defaultLargestUnit)), checkLargestSmallestUnit(largestUnit2, smallestUnit2), roundingInc2 = refineRoundingInc(roundingInc2, smallestUnit2, 1), roundingInc2 > 1 && smallestUnit2 > 5 && largestUnit2 !== smallestUnit2) {
            throw new RangeError("For calendar units with roundingIncrement > 1, use largestUnit = smallestUnit");
          }
          return [largestUnit2, smallestUnit2, roundingInc2, roundingMode2, relativeToInternals];
        })(options, durationLargestUnit, refineRelativeTo), maxUnit = Math.max(durationLargestUnit, largestUnit);
        if (!relativeToSlots && maxUnit <= 6) {
          return createDurationSlots(checkDurationUnits(((durationFields, largestUnit2, smallestUnit2, roundingInc2, roundingMode2) => {
            const roundedBigNano = roundBigNano(durationFieldsToBigNano(durationFields), smallestUnit2, roundingInc2, roundingMode2);
            return {
              ...durationFieldDefaults,
              ...nanoToDurationDayTimeFields(roundedBigNano, largestUnit2)
            };
          })(slots, largestUnit, smallestUnit, roundingInc, roundingMode)));
        }
        if (!isZonedEpochSlots(relativeToSlots) && !slots.sign) {
          return slots;
        }
        if (!relativeToSlots) {
          throw new RangeError("Missing relativeTo");
        }
        const [marker, calendarOps, timeZoneOps] = createMarkerSystem(getCalendarOps, getTimeZoneOps, relativeToSlots), markerToEpochNano = createMarkerToEpochNano(timeZoneOps), moveMarker = createMoveMarker(timeZoneOps), diffMarkers = createDiffMarkers(timeZoneOps), endMarker = moveMarker(calendarOps, marker, slots);
        isZonedEpochSlots(relativeToSlots) || (checkIsoDateTimeInBounds(marker), checkIsoDateTimeInBounds(endMarker));
        let balancedDuration = diffMarkers(calendarOps, marker, endMarker, largestUnit);
        const origSign = slots.sign, balancedSign = computeDurationSign(balancedDuration);
        if (origSign && balancedSign && origSign !== balancedSign) {
          throw new RangeError(invalidProtocolResults);
        }
        return balancedDuration = roundRelativeDuration(balancedDuration, markerToEpochNano(endMarker), largestUnit, smallestUnit, roundingInc, roundingMode, calendarOps, marker, markerToEpochNano, moveMarker), createDurationSlots(balancedDuration);
      }, exports2.roundInstant = (instantSlots, options) => {
        const [smallestUnit, roundingInc, roundingMode] = refineRoundingOptions(options, 5, 1);
        return createInstantSlots(roundBigNano(instantSlots.epochNanoseconds, smallestUnit, roundingInc, roundingMode, 1));
      }, exports2.roundPlainDateTime = (slots, options) => createPlainDateTimeSlots(roundDateTime(slots, ...refineRoundingOptions(options)), slots.calendar), exports2.roundPlainTime = (slots, options) => {
        const [a, b, c] = refineRoundingOptions(options, 5);
        var roundingMode;
        return createPlainTimeSlots((roundingMode = c, roundTimeToNano(slots, computeNanoInc(a, b), roundingMode)[0]));
      }, exports2.roundWithMode = roundWithMode, exports2.roundZonedDateTime = (getTimeZoneOps, slots, options) => {
        let { epochNanoseconds, timeZone, calendar } = slots;
        const [smallestUnit, roundingInc, roundingMode] = refineRoundingOptions(options);
        if (0 === smallestUnit && 1 === roundingInc) {
          return slots;
        }
        const timeZoneOps = getTimeZoneOps(timeZone);
        if (6 === smallestUnit) {
          epochNanoseconds = roundZonedEpochToInterval(computeDayInterval, timeZoneOps, slots, roundingMode);
        } else {
          const offsetNano = timeZoneOps.getOffsetNanosecondsFor(epochNanoseconds);
          epochNanoseconds = getMatchingInstantFor(timeZoneOps, roundDateTime(epochNanoToIso(epochNanoseconds, offsetNano), smallestUnit, roundingInc, roundingMode), offsetNano, 2, 0, 1);
        }
        return createZonedDateTimeSlots(epochNanoseconds, timeZone, calendar);
      }, exports2.roundZonedEpochToInterval = roundZonedEpochToInterval, exports2.slotsWithCalendarId = (slots, calendarId) => ({
        ...slots,
        calendar: calendarId
      }), exports2.slotsWithTimeZoneId = (slots, timeZoneId) => ({
        ...slots,
        timeZone: timeZoneId
      }), exports2.timeConfig = timeConfig, exports2.timeFieldNamesAsc = timeFieldNamesAsc, exports2.toInteger = toInteger, exports2.toStrictInteger = toStrictInteger, exports2.totalDuration = (refineRelativeTo, getCalendarOps, getTimeZoneOps, slots, options) => {
        const maxDurationUnit = getMaxDurationUnit(slots), [totalUnit, relativeToSlots] = ((options2, refineRelativeTo2) => {
          const relativeToInternals = refineRelativeTo2((options2 = normalizeOptionsOrString(options2, "unit")).relativeTo);
          let totalUnit2 = refineTotalUnit(options2);
          return totalUnit2 = requirePropDefined("unit", totalUnit2), [totalUnit2, relativeToInternals];
        })(options, refineRelativeTo), maxUnit = Math.max(totalUnit, maxDurationUnit);
        if (!relativeToSlots && isUniformUnit(maxUnit, relativeToSlots)) {
          return totalDayTimeDuration(slots, totalUnit);
        }
        if (!relativeToSlots) {
          throw new RangeError("Missing relativeTo");
        }
        if (!slots.sign) {
          return 0;
        }
        const [marker, calendarOps, timeZoneOps] = createMarkerSystem(getCalendarOps, getTimeZoneOps, relativeToSlots), markerToEpochNano = createMarkerToEpochNano(timeZoneOps), moveMarker = createMoveMarker(timeZoneOps), diffMarkers = createDiffMarkers(timeZoneOps), endMarker = moveMarker(calendarOps, marker, slots);
        isZonedEpochSlots(relativeToSlots) || (checkIsoDateTimeInBounds(marker), checkIsoDateTimeInBounds(endMarker));
        const balancedDuration = diffMarkers(calendarOps, marker, endMarker, totalUnit);
        return isUniformUnit(totalUnit, relativeToSlots) ? totalDayTimeDuration(balancedDuration, totalUnit) : totalRelativeDuration(balancedDuration, markerToEpochNano(endMarker), totalUnit, calendarOps, marker, markerToEpochNano, moveMarker);
      }, exports2.totalRelativeDuration = totalRelativeDuration, exports2.unsupportedWeekNumbers = "Calendar week operations forbidden", exports2.yearMonthConfig = yearMonthConfig, exports2.zonedConfig = zonedConfig, exports2.zonedDateTimeToInstant = (zonedDateTimeSlots0) => createInstantSlots(zonedDateTimeSlots0.epochNanoseconds), exports2.zonedDateTimeToPlainDate = (getTimeZoneOps, zonedDateTimeSlots0) => createPlainDateSlots(zonedEpochSlotsToIso(zonedDateTimeSlots0, getTimeZoneOps)), exports2.zonedDateTimeToPlainDateTime = (getTimeZoneOps, zonedDateTimeSlots0) => createPlainDateTimeSlots(zonedEpochSlotsToIso(zonedDateTimeSlots0, getTimeZoneOps)), exports2.zonedDateTimeToPlainMonthDay = (getCalendarOps, zonedDateTimeSlots0, zonedDateTimeFields) => convertToPlainMonthDay(getCalendarOps(zonedDateTimeSlots0.calendar), zonedDateTimeFields), exports2.zonedDateTimeToPlainTime = (getTimeZoneOps, zonedDateTimeSlots0) => createPlainTimeSlots(zonedEpochSlotsToIso(zonedDateTimeSlots0, getTimeZoneOps)), exports2.zonedDateTimeToPlainYearMonth = (getCalendarOps, zonedDateTimeSlots0, zonedDateTimeFields) => convertToPlainYearMonth(getCalendarOps(zonedDateTimeSlots0.calendar), zonedDateTimeFields), exports2.zonedDateTimeWithFields = (getCalendarOps, getTimeZoneOps, zonedDateTimeSlots, modFields, options) => {
        const { calendar, timeZone } = zonedDateTimeSlots, calendarOps = getCalendarOps(calendar), timeZoneOps = getTimeZoneOps(timeZone), validFieldNames = [...calendarOps.fields(dateFieldNamesAlpha), ...timeAndOffsetFieldNames].sort(), origFields = ((slots) => {
          const isoFields = zonedEpochSlotsToIso(slots, queryNativeTimeZone), offsetString = formatOffsetNano(isoFields.offsetNanoseconds), calendarOps2 = createNativePartOps(slots.calendar), [year, month, day] = calendarOps2.dateParts(isoFields), [monthCodeNumber, isLeapMonth] = calendarOps2.monthCodeParts(year, month), monthCode = formatMonthCode(monthCodeNumber, isLeapMonth);
          return {
            ...isoTimeFieldsToCal(isoFields),
            year,
            monthCode,
            day,
            offset: offsetString
          };
        })(zonedDateTimeSlots), partialFields = refineFields(modFields, validFieldNames), mergedCalendarFields = calendarOps.mergeFields(origFields, partialFields), mergedAllFields = {
          ...origFields,
          ...partialFields
        }, [overflow, offsetDisambig, epochDisambig] = refineZonedFieldOptions(options, 2);
        return createZonedDateTimeSlots(getMatchingInstantFor(timeZoneOps, {
          ...calendarOps.dateFromFields(mergedCalendarFields, fabricateOverflowOptions(overflow)),
          ...constrainIsoTimeFields(timeFieldsToIso(mergedAllFields), overflow)
        }, parseOffsetNano(mergedAllFields.offset), offsetDisambig, epochDisambig), timeZone, calendar);
      }, exports2.zonedDateTimeWithPlainDate = (getTimeZoneOps, zonedDateTimeSlots, plainDateSlots) => {
        const timeZoneId = zonedDateTimeSlots.timeZone, timeZoneOps = getTimeZoneOps(timeZoneId), isoFields = {
          ...zonedEpochSlotsToIso(zonedDateTimeSlots, timeZoneOps),
          ...plainDateSlots
        }, calendar = getPreferredCalendarId(zonedDateTimeSlots.calendar, plainDateSlots.calendar);
        return createZonedDateTimeSlots(getMatchingInstantFor(timeZoneOps, isoFields, isoFields.offsetNanoseconds, 2), timeZoneId, calendar);
      }, exports2.zonedDateTimeWithPlainTime = (getTimeZoneOps, zonedDateTimeSlots, plainTimeSlots) => {
        const timeZoneId = zonedDateTimeSlots.timeZone, timeZoneOps = getTimeZoneOps(timeZoneId), isoFields = {
          ...zonedEpochSlotsToIso(zonedDateTimeSlots, timeZoneOps),
          ...plainTimeSlots || isoTimeFieldDefaults
        };
        let epochNano;
        return epochNano = plainTimeSlots ? getMatchingInstantFor(timeZoneOps, isoFields, isoFields.offsetNanoseconds, 2) : getStartOfDayInstantFor(timeZoneOps, isoFields), createZonedDateTimeSlots(epochNano, timeZoneId, zonedDateTimeSlots.calendar);
      }, exports2.zonedDateTimesEqual = (zonedDateTimeSlots0, zonedDateTimeSlots1) => !compareZonedDateTimes(zonedDateTimeSlots0, zonedDateTimeSlots1) && !!isTimeZoneIdsEqual(zonedDateTimeSlots0.timeZone, zonedDateTimeSlots1.timeZone) && zonedDateTimeSlots0.calendar === zonedDateTimeSlots1.calendar, exports2.zonedEpochSlotsToIso = zonedEpochSlotsToIso;
    }
  });

  // node_modules/temporal-polyfill/chunks/classApi.cjs
  var require_classApi = __commonJS({
    "node_modules/temporal-polyfill/chunks/classApi.cjs"(exports2) {
      "use strict";
      function createSlotClass(branding, construct, getters, methods, staticMethods, formatFunc) {
        function Class(...args) {
          if (!(this instanceof Class)) {
            throw new TypeError(internal.invalidCallingContext);
          }
          {
            const slots = construct(...args);
            setSlots(this, slots), dbg(this, slots, formatFunc);
          }
        }
        function bindMethod(method, methodName) {
          return Object.defineProperties((function(...args) {
            return method.call(this, getSpecificSlots(this), ...args);
          }), internal.createNameDescriptors(methodName));
        }
        function getSpecificSlots(obj) {
          const slots = getSlots(obj);
          if (!slots || slots.branding !== branding) {
            throw new TypeError(internal.invalidCallingContext);
          }
          return slots;
        }
        return Object.defineProperties(Class.prototype, {
          ...internal.createGetterDescriptors(internal.mapProps(bindMethod, getters)),
          ...internal.createPropDescriptors(internal.mapProps(bindMethod, methods)),
          ...internal.createStringTagDescriptors("Temporal." + branding)
        }), Object.defineProperties(Class, {
          ...internal.createPropDescriptors(staticMethods),
          ...internal.createNameDescriptors(branding)
        }), [Class, (slots) => {
          const instance = Object.create(Class.prototype);
          return setSlots(instance, slots), dbg(instance, slots, formatFunc), instance;
        }, getSpecificSlots];
      }
      function rejectInvalidBag(bag) {
        if (getSlots(bag) || void 0 !== bag.calendar || void 0 !== bag.timeZone) {
          throw new TypeError(internal.invalidBag);
        }
        return bag;
      }
      function dbg(instance, slots, formatSlots) {
        "dbg" === dbg.name && Object.defineProperty(instance, "_str_", {
          value: formatSlots(slots),
          writable: 0,
          enumerable: 0,
          configurable: 0
        });
      }
      function getCalendarIdFromBag(bag) {
        return extractCalendarIdFromBag(bag) || internal.isoCalendarId;
      }
      function extractCalendarIdFromBag(bag) {
        const { calendar: calendarArg } = bag;
        if (void 0 !== calendarArg) {
          return refineCalendarArg(calendarArg);
        }
      }
      function refineCalendarArg(arg) {
        if (internal.isObjectLike(arg)) {
          const { calendar } = getSlots(arg) || {};
          if (!calendar) {
            throw new TypeError(internal.invalidCalendar(arg));
          }
          return calendar;
        }
        return ((arg2) => internal.resolveCalendarId(internal.parseCalendarId(internal.requireString(arg2))))(arg);
      }
      function createCalendarGetters(methodNameMap) {
        const methods = {};
        for (const methodName in methodNameMap) {
          methods[methodName] = (slots) => {
            const { calendar } = slots;
            return internal.createNativeStandardOps(calendar)[methodName](slots);
          };
        }
        return methods;
      }
      function neverValueOf() {
        throw new TypeError(internal.forbiddenValueOf);
      }
      function refineTimeZoneArg(arg) {
        if (internal.isObjectLike(arg)) {
          const { timeZone } = getSlots(arg) || {};
          if (!timeZone) {
            throw new TypeError(internal.invalidTimeZone(arg));
          }
          return timeZone;
        }
        return ((arg2) => internal.resolveTimeZoneId(internal.parseTimeZoneId(internal.requireString(arg2))))(arg);
      }
      function toDurationSlots(arg) {
        if (internal.isObjectLike(arg)) {
          const slots = getSlots(arg);
          return slots && slots.branding === internal.DurationBranding ? slots : internal.refineDurationBag(arg);
        }
        return internal.parseDuration(arg);
      }
      function refinePublicRelativeTo(relativeTo) {
        if (void 0 !== relativeTo) {
          if (internal.isObjectLike(relativeTo)) {
            const slots = getSlots(relativeTo) || {};
            switch (slots.branding) {
              case internal.ZonedDateTimeBranding:
              case internal.PlainDateBranding:
                return slots;
              case internal.PlainDateTimeBranding:
                return internal.createPlainDateSlots(slots);
            }
            const calendarId = getCalendarIdFromBag(relativeTo);
            return {
              ...internal.refineMaybeZonedDateTimeBag(refineTimeZoneArg, internal.queryNativeTimeZone, internal.createNativeStandardOps(calendarId), relativeTo),
              calendar: calendarId
            };
          }
          return internal.parseRelativeToSlots(relativeTo);
        }
      }
      function toPlainTimeSlots(arg, options) {
        if (internal.isObjectLike(arg)) {
          const slots = getSlots(arg) || {};
          switch (slots.branding) {
            case internal.PlainTimeBranding:
              return internal.refineOverflowOptions(options), slots;
            case internal.PlainDateTimeBranding:
              return internal.refineOverflowOptions(options), internal.createPlainTimeSlots(slots);
            case internal.ZonedDateTimeBranding:
              return internal.refineOverflowOptions(options), internal.zonedDateTimeToPlainTime(internal.queryNativeTimeZone, slots);
          }
          return internal.refinePlainTimeBag(arg, options);
        }
        const timeSlots = internal.parsePlainTime(arg);
        return internal.refineOverflowOptions(options), timeSlots;
      }
      function optionalToPlainTimeFields(timeArg) {
        return void 0 === timeArg ? void 0 : toPlainTimeSlots(timeArg);
      }
      function toPlainDateTimeSlots(arg, options) {
        if (internal.isObjectLike(arg)) {
          const slots = getSlots(arg) || {};
          switch (slots.branding) {
            case internal.PlainDateTimeBranding:
              return internal.refineOverflowOptions(options), slots;
            case internal.PlainDateBranding:
              return internal.refineOverflowOptions(options), internal.createPlainDateTimeSlots({
                ...slots,
                ...internal.isoTimeFieldDefaults
              });
            case internal.ZonedDateTimeBranding:
              return internal.refineOverflowOptions(options), internal.zonedDateTimeToPlainDateTime(internal.queryNativeTimeZone, slots);
          }
          return internal.refinePlainDateTimeBag(internal.createNativeStandardOps(getCalendarIdFromBag(arg)), arg, options);
        }
        const res = internal.parsePlainDateTime(arg);
        return internal.refineOverflowOptions(options), res;
      }
      function toPlainMonthDaySlots(arg, options) {
        if (internal.isObjectLike(arg)) {
          const slots = getSlots(arg);
          if (slots && slots.branding === internal.PlainMonthDayBranding) {
            return internal.refineOverflowOptions(options), slots;
          }
          const calendarIdMaybe = extractCalendarIdFromBag(arg), calendarId = calendarIdMaybe || internal.isoCalendarId;
          return internal.refinePlainMonthDayBag(internal.createNativeStandardOps(calendarId), !calendarIdMaybe, arg, options);
        }
        const res = internal.parsePlainMonthDay(internal.createNativeStandardOps, arg);
        return internal.refineOverflowOptions(options), res;
      }
      function toPlainYearMonthSlots(arg, options) {
        if (internal.isObjectLike(arg)) {
          const slots = getSlots(arg);
          return slots && slots.branding === internal.PlainYearMonthBranding ? (internal.refineOverflowOptions(options), slots) : internal.refinePlainYearMonthBag(internal.createNativeStandardOps(getCalendarIdFromBag(arg)), arg, options);
        }
        const res = internal.parsePlainYearMonth(internal.createNativeStandardOps, arg);
        return internal.refineOverflowOptions(options), res;
      }
      function toPlainDateSlots(arg, options) {
        if (internal.isObjectLike(arg)) {
          const slots = getSlots(arg) || {};
          switch (slots.branding) {
            case internal.PlainDateBranding:
              return internal.refineOverflowOptions(options), slots;
            case internal.PlainDateTimeBranding:
              return internal.refineOverflowOptions(options), internal.createPlainDateSlots(slots);
            case internal.ZonedDateTimeBranding:
              return internal.refineOverflowOptions(options), internal.zonedDateTimeToPlainDate(internal.queryNativeTimeZone, slots);
          }
          return internal.refinePlainDateBag(internal.createNativeStandardOps(getCalendarIdFromBag(arg)), arg, options);
        }
        const res = internal.parsePlainDate(arg);
        return internal.refineOverflowOptions(options), res;
      }
      function toZonedDateTimeSlots(arg, options) {
        if (internal.isObjectLike(arg)) {
          const slots = getSlots(arg);
          if (slots && slots.branding === internal.ZonedDateTimeBranding) {
            return internal.refineZonedFieldOptions(options), slots;
          }
          const calendarId = getCalendarIdFromBag(arg);
          return internal.refineZonedDateTimeBag(refineTimeZoneArg, internal.queryNativeTimeZone, internal.createNativeStandardOps(calendarId), calendarId, arg, options);
        }
        return internal.parseZonedDateTime(arg, options);
      }
      function adaptDateMethods(methods) {
        return internal.mapProps(((method) => (slots) => method(slotsToIso(slots))), methods);
      }
      function slotsToIso(slots) {
        return internal.zonedEpochSlotsToIso(slots, internal.queryNativeTimeZone);
      }
      function toInstantSlots(arg) {
        if (internal.isObjectLike(arg)) {
          const slots = getSlots(arg);
          if (slots) {
            switch (slots.branding) {
              case internal.InstantBranding:
                return slots;
              case internal.ZonedDateTimeBranding:
                return internal.createInstantSlots(slots.epochNanoseconds);
            }
          }
        }
        return internal.parseInstant(arg);
      }
      function createFormatMethod(methodName) {
        return Object.defineProperties((function(...formattables) {
          const prepFormat = internalsMap.get(this), [format, ...rawFormattables] = prepFormat(methodName.includes("Range"), ...formattables);
          return format[methodName](...rawFormattables);
        }), internal.createNameDescriptors(methodName));
      }
      function createProxiedMethod(methodName) {
        return Object.defineProperties((function(...args) {
          return internalsMap.get(this).rawFormat[methodName](...args);
        }), internal.createNameDescriptors(methodName));
      }
      function createFormatPrepperForBranding(branding) {
        const config = classFormatConfigs[branding];
        if (!config) {
          throw new TypeError(internal.invalidFormatType(branding));
        }
        return internal.createFormatPrepper(config, internal.memoize(internal.createFormatForPrep), 1);
      }
      var internal = require_internal();
      var slotsMap = /* @__PURE__ */ new WeakMap();
      var getSlots = slotsMap.get.bind(slotsMap);
      var setSlots = slotsMap.set.bind(slotsMap);
      var yearMonthOnlyRefiners = {
        era: internal.requireStringOrUndefined,
        eraYear: internal.requireIntegerOrUndefined,
        year: internal.requireInteger,
        month: internal.requirePositiveInteger,
        daysInMonth: internal.requirePositiveInteger,
        daysInYear: internal.requirePositiveInteger,
        inLeapYear: internal.requireBoolean,
        monthsInYear: internal.requirePositiveInteger
      };
      var monthOnlyRefiners = {
        monthCode: internal.requireString
      };
      var dayOnlyRefiners = {
        day: internal.requirePositiveInteger
      };
      var dateOnlyRefiners = {
        dayOfWeek: internal.requirePositiveInteger,
        dayOfYear: internal.requirePositiveInteger,
        weekOfYear: internal.requirePositiveIntegerOrUndefined,
        yearOfWeek: internal.requireIntegerOrUndefined,
        daysInWeek: internal.requirePositiveInteger
      };
      var dateGetters = createCalendarGetters({
        ...yearMonthOnlyRefiners,
        ...monthOnlyRefiners,
        ...dayOnlyRefiners,
        ...dateOnlyRefiners
      });
      var yearMonthGetters = createCalendarGetters({
        ...yearMonthOnlyRefiners,
        ...monthOnlyRefiners
      });
      var monthDayGetters = createCalendarGetters({
        ...monthOnlyRefiners,
        ...dayOnlyRefiners
      });
      var calendarIdGetters = {
        calendarId: (slots) => slots.calendar
      };
      var durationGetters = internal.mapPropNames(((propName) => (slots) => slots[propName]), internal.durationFieldNamesAsc.concat("sign"));
      var timeGetters = internal.mapPropNames(((_name, i2) => (slots) => slots[internal.isoTimeFieldNamesAsc[i2]]), internal.timeFieldNamesAsc);
      var epochGetters = {
        epochMilliseconds: internal.getEpochMilli,
        epochNanoseconds: internal.getEpochNano
      };
      var [Duration, createDuration, getDurationSlots] = createSlotClass(internal.DurationBranding, internal.constructDurationSlots, {
        ...durationGetters,
        blank: internal.getDurationBlank
      }, {
        with: (slots, mod) => createDuration(internal.durationWithFields(slots, mod)),
        negated: (slots) => createDuration(internal.negateDuration(slots)),
        abs: (slots) => createDuration(internal.absDuration(slots)),
        add: (slots, otherArg, options) => createDuration(internal.addDurations(refinePublicRelativeTo, internal.createNativeStandardOps, internal.queryNativeTimeZone, 0, slots, toDurationSlots(otherArg), options)),
        subtract: (slots, otherArg, options) => createDuration(internal.addDurations(refinePublicRelativeTo, internal.createNativeStandardOps, internal.queryNativeTimeZone, 1, slots, toDurationSlots(otherArg), options)),
        round: (slots, options) => createDuration(internal.roundDuration(refinePublicRelativeTo, internal.createNativeStandardOps, internal.queryNativeTimeZone, slots, options)),
        total: (slots, options) => internal.totalDuration(refinePublicRelativeTo, internal.createNativeStandardOps, internal.queryNativeTimeZone, slots, options),
        toLocaleString(slots, locales, options) {
          return Intl.DurationFormat ? new Intl.DurationFormat(locales, options).format(this) : internal.formatDurationIso(slots);
        },
        toString: internal.formatDurationIso,
        toJSON: (slots) => internal.formatDurationIso(slots),
        valueOf: neverValueOf
      }, {
        from: (arg) => createDuration(toDurationSlots(arg)),
        compare: (durationArg0, durationArg1, options) => internal.compareDurations(refinePublicRelativeTo, internal.createNativeStandardOps, internal.queryNativeTimeZone, toDurationSlots(durationArg0), toDurationSlots(durationArg1), options)
      }, internal.formatDurationIso);
      var classFormatConfigs = {
        Instant: internal.instantConfig,
        PlainDateTime: internal.dateTimeConfig,
        PlainDate: internal.dateConfig,
        PlainTime: internal.timeConfig,
        PlainYearMonth: internal.yearMonthConfig,
        PlainMonthDay: internal.monthDayConfig
      };
      var prepInstantFormat = internal.createFormatPrepper(internal.instantConfig);
      var prepZonedDateTimeFormat = internal.createFormatPrepper(internal.zonedConfig);
      var prepPlainDateTimeFormat = internal.createFormatPrepper(internal.dateTimeConfig);
      var prepPlainDateFormat = internal.createFormatPrepper(internal.dateConfig);
      var prepPlainTimeFormat = internal.createFormatPrepper(internal.timeConfig);
      var prepPlainYearMonthFormat = internal.createFormatPrepper(internal.yearMonthConfig);
      var prepPlainMonthDayFormat = internal.createFormatPrepper(internal.monthDayConfig);
      var [PlainTime, createPlainTime] = createSlotClass(internal.PlainTimeBranding, internal.constructPlainTimeSlots, timeGetters, {
        with(_slots, mod, options) {
          return createPlainTime(internal.plainTimeWithFields(this, rejectInvalidBag(mod), options));
        },
        add: (slots, durationArg) => createPlainTime(internal.movePlainTime(0, slots, toDurationSlots(durationArg))),
        subtract: (slots, durationArg) => createPlainTime(internal.movePlainTime(1, slots, toDurationSlots(durationArg))),
        until: (slots, otherArg, options) => createDuration(internal.diffPlainTimes(0, slots, toPlainTimeSlots(otherArg), options)),
        since: (slots, otherArg, options) => createDuration(internal.diffPlainTimes(1, slots, toPlainTimeSlots(otherArg), options)),
        round: (slots, options) => createPlainTime(internal.roundPlainTime(slots, options)),
        equals: (slots, other) => internal.plainTimesEqual(slots, toPlainTimeSlots(other)),
        toLocaleString(slots, locales, options) {
          const [format, epochMilli] = prepPlainTimeFormat(locales, options, slots);
          return format.format(epochMilli);
        },
        toString: internal.formatPlainTimeIso,
        toJSON: (slots) => internal.formatPlainTimeIso(slots),
        valueOf: neverValueOf
      }, {
        from: (arg, options) => createPlainTime(toPlainTimeSlots(arg, options)),
        compare: (arg0, arg1) => internal.compareIsoTimeFields(toPlainTimeSlots(arg0), toPlainTimeSlots(arg1))
      }, internal.formatPlainTimeIso);
      var [PlainDateTime, createPlainDateTime] = createSlotClass(internal.PlainDateTimeBranding, internal.bindArgs(internal.constructPlainDateTimeSlots, internal.refineCalendarId), {
        ...calendarIdGetters,
        ...dateGetters,
        ...timeGetters
      }, {
        with: (slots, mod, options) => createPlainDateTime(internal.plainDateTimeWithFields(internal.createNativeStandardOps, slots, rejectInvalidBag(mod), options)),
        withCalendar: (slots, calendarArg) => createPlainDateTime(internal.slotsWithCalendarId(slots, refineCalendarArg(calendarArg))),
        withPlainTime: (slots, plainTimeArg) => createPlainDateTime(internal.plainDateTimeWithPlainTime(slots, optionalToPlainTimeFields(plainTimeArg))),
        add: (slots, durationArg, options) => createPlainDateTime(internal.movePlainDateTime(internal.createNativeStandardOps, 0, slots, toDurationSlots(durationArg), options)),
        subtract: (slots, durationArg, options) => createPlainDateTime(internal.movePlainDateTime(internal.createNativeStandardOps, 1, slots, toDurationSlots(durationArg), options)),
        until: (slots, otherArg, options) => createDuration(internal.diffPlainDateTimes(internal.createNativeStandardOps, 0, slots, toPlainDateTimeSlots(otherArg), options)),
        since: (slots, otherArg, options) => createDuration(internal.diffPlainDateTimes(internal.createNativeStandardOps, 1, slots, toPlainDateTimeSlots(otherArg), options)),
        round: (slots, options) => createPlainDateTime(internal.roundPlainDateTime(slots, options)),
        equals: (slots, otherArg) => internal.plainDateTimesEqual(slots, toPlainDateTimeSlots(otherArg)),
        toZonedDateTime: (slots, timeZoneArg, options) => createZonedDateTime(internal.plainDateTimeToZonedDateTime(internal.queryNativeTimeZone, slots, refineTimeZoneArg(timeZoneArg), options)),
        toPlainDate: (slots) => createPlainDate(internal.createPlainDateSlots(slots)),
        toPlainTime: (slots) => createPlainTime(internal.createPlainTimeSlots(slots)),
        toLocaleString(slots, locales, options) {
          const [format, epochMilli] = prepPlainDateTimeFormat(locales, options, slots);
          return format.format(epochMilli);
        },
        toString: internal.formatPlainDateTimeIso,
        toJSON: (slots) => internal.formatPlainDateTimeIso(slots),
        valueOf: neverValueOf
      }, {
        from: (arg, options) => createPlainDateTime(toPlainDateTimeSlots(arg, options)),
        compare: (arg0, arg1) => internal.compareIsoDateTimeFields(toPlainDateTimeSlots(arg0), toPlainDateTimeSlots(arg1))
      }, internal.formatPlainDateTimeIso);
      var [PlainMonthDay, createPlainMonthDay, getPlainMonthDaySlots] = createSlotClass(internal.PlainMonthDayBranding, internal.bindArgs(internal.constructPlainMonthDaySlots, internal.refineCalendarId), {
        ...calendarIdGetters,
        ...monthDayGetters
      }, {
        with: (slots, mod, options) => createPlainMonthDay(internal.plainMonthDayWithFields(internal.createNativeStandardOps, slots, rejectInvalidBag(mod), options)),
        equals: (slots, otherArg) => internal.plainMonthDaysEqual(slots, toPlainMonthDaySlots(otherArg)),
        toPlainDate(slots, bag) {
          return createPlainDate(internal.plainMonthDayToPlainDate(internal.createNativeStandardOps, slots, this, bag));
        },
        toLocaleString(slots, locales, options) {
          const [format, epochMilli] = prepPlainMonthDayFormat(locales, options, slots);
          return format.format(epochMilli);
        },
        toString: internal.formatPlainMonthDayIso,
        toJSON: (slots) => internal.formatPlainMonthDayIso(slots),
        valueOf: neverValueOf
      }, {
        from: (arg, options) => createPlainMonthDay(toPlainMonthDaySlots(arg, options))
      }, internal.formatPlainMonthDayIso);
      var [PlainYearMonth, createPlainYearMonth, getPlainYearMonthSlots] = createSlotClass(internal.PlainYearMonthBranding, internal.bindArgs(internal.constructPlainYearMonthSlots, internal.refineCalendarId), {
        ...calendarIdGetters,
        ...yearMonthGetters
      }, {
        with: (slots, mod, options) => createPlainYearMonth(internal.plainYearMonthWithFields(internal.createNativeStandardOps, slots, rejectInvalidBag(mod), options)),
        add: (slots, durationArg, options) => createPlainYearMonth(internal.movePlainYearMonth(internal.createNativeStandardOps, 0, slots, toDurationSlots(durationArg), options)),
        subtract: (slots, durationArg, options) => createPlainYearMonth(internal.movePlainYearMonth(internal.createNativeStandardOps, 1, slots, toDurationSlots(durationArg), options)),
        until: (slots, otherArg, options) => createDuration(internal.diffPlainYearMonth(internal.createNativeStandardOps, 0, slots, toPlainYearMonthSlots(otherArg), options)),
        since: (slots, otherArg, options) => createDuration(internal.diffPlainYearMonth(internal.createNativeStandardOps, 1, slots, toPlainYearMonthSlots(otherArg), options)),
        equals: (slots, otherArg) => internal.plainYearMonthsEqual(slots, toPlainYearMonthSlots(otherArg)),
        toPlainDate(slots, bag) {
          return createPlainDate(internal.plainYearMonthToPlainDate(internal.createNativeStandardOps, slots, this, bag));
        },
        toLocaleString(slots, locales, options) {
          const [format, epochMilli] = prepPlainYearMonthFormat(locales, options, slots);
          return format.format(epochMilli);
        },
        toString: internal.formatPlainYearMonthIso,
        toJSON: (slots) => internal.formatPlainYearMonthIso(slots),
        valueOf: neverValueOf
      }, {
        from: (arg, options) => createPlainYearMonth(toPlainYearMonthSlots(arg, options)),
        compare: (arg0, arg1) => internal.compareIsoDateFields(toPlainYearMonthSlots(arg0), toPlainYearMonthSlots(arg1))
      }, internal.formatPlainYearMonthIso);
      var [PlainDate, createPlainDate, getPlainDateSlots] = createSlotClass(internal.PlainDateBranding, internal.bindArgs(internal.constructPlainDateSlots, internal.refineCalendarId), {
        ...calendarIdGetters,
        ...dateGetters
      }, {
        with: (slots, mod, options) => createPlainDate(internal.plainDateWithFields(internal.createNativeStandardOps, slots, rejectInvalidBag(mod), options)),
        withCalendar: (slots, calendarArg) => createPlainDate(internal.slotsWithCalendarId(slots, refineCalendarArg(calendarArg))),
        add: (slots, durationArg, options) => createPlainDate(internal.movePlainDate(internal.createNativeStandardOps, 0, slots, toDurationSlots(durationArg), options)),
        subtract: (slots, durationArg, options) => createPlainDate(internal.movePlainDate(internal.createNativeStandardOps, 1, slots, toDurationSlots(durationArg), options)),
        until: (slots, otherArg, options) => createDuration(internal.diffPlainDates(internal.createNativeStandardOps, 0, slots, toPlainDateSlots(otherArg), options)),
        since: (slots, otherArg, options) => createDuration(internal.diffPlainDates(internal.createNativeStandardOps, 1, slots, toPlainDateSlots(otherArg), options)),
        equals: (slots, otherArg) => internal.plainDatesEqual(slots, toPlainDateSlots(otherArg)),
        toZonedDateTime(slots, options) {
          const optionsObj = internal.isObjectLike(options) ? options : {
            timeZone: options
          };
          return createZonedDateTime(internal.plainDateToZonedDateTime(refineTimeZoneArg, toPlainTimeSlots, internal.queryNativeTimeZone, slots, optionsObj));
        },
        toPlainDateTime: (slots, plainTimeArg) => createPlainDateTime(internal.plainDateToPlainDateTime(slots, optionalToPlainTimeFields(plainTimeArg))),
        toPlainYearMonth(slots) {
          return createPlainYearMonth(internal.plainDateToPlainYearMonth(internal.createNativeStandardOps, slots, this));
        },
        toPlainMonthDay(slots) {
          return createPlainMonthDay(internal.plainDateToPlainMonthDay(internal.createNativeStandardOps, slots, this));
        },
        toLocaleString(slots, locales, options) {
          const [format, epochMilli] = prepPlainDateFormat(locales, options, slots);
          return format.format(epochMilli);
        },
        toString: internal.formatPlainDateIso,
        toJSON: (slots) => internal.formatPlainDateIso(slots),
        valueOf: neverValueOf
      }, {
        from: (arg, options) => createPlainDate(toPlainDateSlots(arg, options)),
        compare: (arg0, arg1) => internal.compareIsoDateFields(toPlainDateSlots(arg0), toPlainDateSlots(arg1))
      }, internal.formatPlainDateIso);
      var [ZonedDateTime, createZonedDateTime] = createSlotClass(internal.ZonedDateTimeBranding, internal.bindArgs(internal.constructZonedDateTimeSlots, internal.refineCalendarId, internal.refineTimeZoneId), {
        ...epochGetters,
        ...calendarIdGetters,
        ...adaptDateMethods(dateGetters),
        ...adaptDateMethods(timeGetters),
        offset: (slots) => internal.formatOffsetNano(slotsToIso(slots).offsetNanoseconds),
        offsetNanoseconds: (slots) => slotsToIso(slots).offsetNanoseconds,
        timeZoneId: (slots) => slots.timeZone,
        hoursInDay: (slots) => internal.computeZonedHoursInDay(internal.queryNativeTimeZone, slots)
      }, {
        with: (slots, mod, options) => createZonedDateTime(internal.zonedDateTimeWithFields(internal.createNativeStandardOps, internal.queryNativeTimeZone, slots, rejectInvalidBag(mod), options)),
        withCalendar: (slots, calendarArg) => createZonedDateTime(internal.slotsWithCalendarId(slots, refineCalendarArg(calendarArg))),
        withTimeZone: (slots, timeZoneArg) => createZonedDateTime(internal.slotsWithTimeZoneId(slots, refineTimeZoneArg(timeZoneArg))),
        withPlainTime: (slots, plainTimeArg) => createZonedDateTime(internal.zonedDateTimeWithPlainTime(internal.queryNativeTimeZone, slots, optionalToPlainTimeFields(plainTimeArg))),
        add: (slots, durationArg, options) => createZonedDateTime(internal.moveZonedDateTime(internal.createNativeStandardOps, internal.queryNativeTimeZone, 0, slots, toDurationSlots(durationArg), options)),
        subtract: (slots, durationArg, options) => createZonedDateTime(internal.moveZonedDateTime(internal.createNativeStandardOps, internal.queryNativeTimeZone, 1, slots, toDurationSlots(durationArg), options)),
        until: (slots, otherArg, options) => createDuration(internal.createDurationSlots(internal.diffZonedDateTimes(internal.createNativeStandardOps, internal.queryNativeTimeZone, 0, slots, toZonedDateTimeSlots(otherArg), options))),
        since: (slots, otherArg, options) => createDuration(internal.createDurationSlots(internal.diffZonedDateTimes(internal.createNativeStandardOps, internal.queryNativeTimeZone, 1, slots, toZonedDateTimeSlots(otherArg), options))),
        round: (slots, options) => createZonedDateTime(internal.roundZonedDateTime(internal.queryNativeTimeZone, slots, options)),
        startOfDay: (slots) => createZonedDateTime(internal.computeZonedStartOfDay(internal.queryNativeTimeZone, slots)),
        equals: (slots, otherArg) => internal.zonedDateTimesEqual(slots, toZonedDateTimeSlots(otherArg)),
        toInstant: (slots) => createInstant(internal.zonedDateTimeToInstant(slots)),
        toPlainDateTime: (slots) => createPlainDateTime(internal.zonedDateTimeToPlainDateTime(internal.queryNativeTimeZone, slots)),
        toPlainDate: (slots) => createPlainDate(internal.zonedDateTimeToPlainDate(internal.queryNativeTimeZone, slots)),
        toPlainTime: (slots) => createPlainTime(internal.zonedDateTimeToPlainTime(internal.queryNativeTimeZone, slots)),
        toLocaleString(slots, locales, options = {}) {
          const [format, epochMilli] = prepZonedDateTimeFormat(locales, options, slots);
          return format.format(epochMilli);
        },
        toString: (slots, options) => internal.formatZonedDateTimeIso(internal.queryNativeTimeZone, slots, options),
        toJSON: (slots) => internal.formatZonedDateTimeIso(internal.queryNativeTimeZone, slots),
        valueOf: neverValueOf,
        getTimeZoneTransition(slots, options) {
          const { timeZone: timeZoneId, epochNanoseconds: epochNano } = slots, direction = internal.refineDirectionOptions(options), newEpochNano = internal.queryNativeTimeZone(timeZoneId).getTransition(epochNano, direction);
          return newEpochNano ? createZonedDateTime({
            ...slots,
            epochNanoseconds: newEpochNano
          }) : null;
        }
      }, {
        from: (arg, options) => createZonedDateTime(toZonedDateTimeSlots(arg, options)),
        compare: (arg0, arg1) => internal.compareZonedDateTimes(toZonedDateTimeSlots(arg0), toZonedDateTimeSlots(arg1))
      }, ((slots) => internal.formatZonedDateTimeIso(internal.queryNativeTimeZone, slots)));
      var [Instant, createInstant, getInstantSlots] = createSlotClass(internal.InstantBranding, internal.constructInstantSlots, epochGetters, {
        add: (slots, durationArg) => createInstant(internal.moveInstant(0, slots, toDurationSlots(durationArg))),
        subtract: (slots, durationArg) => createInstant(internal.moveInstant(1, slots, toDurationSlots(durationArg))),
        until: (slots, otherArg, options) => createDuration(internal.diffInstants(0, slots, toInstantSlots(otherArg), options)),
        since: (slots, otherArg, options) => createDuration(internal.diffInstants(1, slots, toInstantSlots(otherArg), options)),
        round: (slots, options) => createInstant(internal.roundInstant(slots, options)),
        equals: (slots, otherArg) => internal.instantsEqual(slots, toInstantSlots(otherArg)),
        toZonedDateTimeISO: (slots, timeZoneArg) => createZonedDateTime(internal.instantToZonedDateTime(slots, refineTimeZoneArg(timeZoneArg))),
        toLocaleString(slots, locales, options) {
          const [format, epochMilli] = prepInstantFormat(locales, options, slots);
          return format.format(epochMilli);
        },
        toString: (slots, options) => internal.formatInstantIso(refineTimeZoneArg, internal.queryNativeTimeZone, slots, options),
        toJSON: (slots) => internal.formatInstantIso(refineTimeZoneArg, internal.queryNativeTimeZone, slots),
        valueOf: neverValueOf
      }, {
        from: (arg) => createInstant(toInstantSlots(arg)),
        fromEpochMilliseconds: (epochMilli) => createInstant(internal.epochMilliToInstant(epochMilli)),
        fromEpochNanoseconds: (epochNano) => createInstant(internal.epochNanoToInstant(epochNano)),
        compare: (a, b) => internal.compareInstants(toInstantSlots(a), toInstantSlots(b))
      }, ((slots) => internal.formatInstantIso(refineTimeZoneArg, internal.queryNativeTimeZone, slots)));
      var Now = Object.defineProperties({}, {
        ...internal.createStringTagDescriptors("Temporal.Now"),
        ...internal.createPropDescriptors({
          timeZoneId: () => internal.getCurrentTimeZoneId(),
          instant: () => createInstant(internal.createInstantSlots(internal.getCurrentEpochNano())),
          zonedDateTimeISO: (timeZoneArg = internal.getCurrentTimeZoneId()) => createZonedDateTime(internal.createZonedDateTimeSlots(internal.getCurrentEpochNano(), refineTimeZoneArg(timeZoneArg), internal.isoCalendarId)),
          plainDateTimeISO: (timeZoneArg = internal.getCurrentTimeZoneId()) => createPlainDateTime(internal.createPlainDateTimeSlots(internal.getCurrentIsoDateTime(internal.queryNativeTimeZone(refineTimeZoneArg(timeZoneArg))), internal.isoCalendarId)),
          plainDateISO: (timeZoneArg = internal.getCurrentTimeZoneId()) => createPlainDate(internal.createPlainDateSlots(internal.getCurrentIsoDateTime(internal.queryNativeTimeZone(refineTimeZoneArg(timeZoneArg))), internal.isoCalendarId)),
          plainTimeISO: (timeZoneArg = internal.getCurrentTimeZoneId()) => createPlainTime(internal.createPlainTimeSlots(internal.getCurrentIsoDateTime(internal.queryNativeTimeZone(refineTimeZoneArg(timeZoneArg)))))
        })
      });
      var Temporal = Object.defineProperties({}, {
        ...internal.createStringTagDescriptors("Temporal"),
        ...internal.createPropDescriptors({
          PlainYearMonth,
          PlainMonthDay,
          PlainDate,
          PlainTime,
          PlainDateTime,
          ZonedDateTime,
          Instant,
          Duration,
          Now
        })
      });
      var DateTimeFormat = (function() {
        function DateTimeFormatFunc(locales, options) {
          return new DateTimeFormatNew(locales, options);
        }
        function DateTimeFormatNew(locales, options = /* @__PURE__ */ Object.create(null)) {
          internalsMap.set(this, ((locales2, options2) => {
            const rawFormat = new internal.RawDateTimeFormat(locales2, options2), resolveOptions = rawFormat.resolvedOptions(), resolvedLocale = resolveOptions.locale, copiedOptions = internal.pluckProps(Object.keys(options2), resolveOptions), queryFormatPrepperForBranding = internal.memoize(createFormatPrepperForBranding), prepFormat = (isRange, ...formattables) => {
              if (isRange) {
                if (2 !== formattables.length) {
                  throw new TypeError(internal.mismatchingFormatTypes);
                }
                for (const formattable of formattables) {
                  if (void 0 === formattable) {
                    throw new TypeError(internal.mismatchingFormatTypes);
                  }
                }
              }
              isRange || void 0 !== formattables[0] || (formattables = []);
              const formattableEssences = formattables.map(((formattable) => getSlots(formattable) || Number(formattable)));
              let overallBranding, i2 = 0;
              for (const formattableEssence of formattableEssences) {
                const slotsBranding = "object" == typeof formattableEssence ? formattableEssence.branding : void 0;
                if (i2++ && slotsBranding !== overallBranding) {
                  throw new TypeError(internal.mismatchingFormatTypes);
                }
                overallBranding = slotsBranding;
              }
              return overallBranding ? queryFormatPrepperForBranding(overallBranding)(resolvedLocale, copiedOptions, ...formattableEssences) : [rawFormat, ...formattableEssences];
            };
            return prepFormat.rawFormat = rawFormat, prepFormat;
          })(locales, options));
        }
        const members = internal.RawDateTimeFormat.prototype, memberDescriptors = Object.getOwnPropertyDescriptors(members), classDescriptors = Object.getOwnPropertyDescriptors(internal.RawDateTimeFormat);
        for (const memberName in memberDescriptors) {
          const memberDescriptor = memberDescriptors[memberName], formatLikeMethod = memberName.startsWith("format") && createFormatMethod(memberName);
          "function" == typeof memberDescriptor.value ? memberDescriptor.value = "constructor" === memberName ? DateTimeFormatFunc : formatLikeMethod || createProxiedMethod(memberName) : formatLikeMethod && (memberDescriptor.get = function() {
            if (!internalsMap.has(this)) {
              throw new TypeError(internal.invalidCallingContext);
            }
            return (...args) => formatLikeMethod.apply(this, args);
          }, Object.defineProperties(memberDescriptor.get, internal.createNameDescriptors(`get ${memberName}`)));
        }
        return classDescriptors.prototype.value = DateTimeFormatNew.prototype = Object.create({}, memberDescriptors), Object.defineProperties(DateTimeFormatFunc, classDescriptors), DateTimeFormatFunc;
      })();
      var internalsMap = /* @__PURE__ */ new WeakMap();
      var IntlExtended = Object.defineProperties(Object.create(Intl), internal.createPropDescriptors({
        DateTimeFormat
      }));
      exports2.DateTimeFormat = DateTimeFormat, exports2.IntlExtended = IntlExtended, exports2.Temporal = Temporal, exports2.toTemporalInstant = function() {
        const epochMilli = Date.prototype.valueOf.call(this);
        return createInstant(internal.createInstantSlots(internal.numberToBigNano(internal.requireNumberIsInteger(epochMilli), internal.nanoInMilli)));
      };
    }
  });

  // node_modules/temporal-polyfill/index.cjs
  var require_temporal_polyfill = __commonJS({
    "node_modules/temporal-polyfill/index.cjs"(exports2) {
      "use strict";
      var classApi = require_classApi();
      exports2.Intl = classApi.IntlExtended, exports2.Temporal = classApi.Temporal, exports2.toTemporalInstant = classApi.toTemporalInstant;
    }
  });

  // node_modules/@abaplint/runtime/build/src/statements/convert.js
  var require_convert = __commonJS({
    "node_modules/@abaplint/runtime/build/src/statements/convert.js"(exports2) {
      "use strict";
      Object.defineProperty(exports2, "__esModule", { value: true });
      exports2.convert = convert;
      var temporal_polyfill_1 = require_temporal_polyfill();
      function convert(source, target) {
        let date = "";
        if (source.date) {
          if (typeof source.date === "string") {
            date = source.date;
          } else {
            date = source.date.get();
          }
          if (date.trimEnd() === "") {
            date = "00000000";
          }
        }
        let time = "";
        if (source.time) {
          if (typeof source.time === "string") {
            time = source.time;
          } else {
            time = source.time.get();
          }
          if (time.trimEnd() === "") {
            time = "000000";
          }
        }
        let stamp = "";
        if (source.stamp) {
          if (typeof source.stamp === "string") {
            stamp = source.stamp;
          } else {
            stamp = source.stamp.get() + "";
          }
        }
        let zone = "";
        if (source.zone) {
          if (typeof source.zone === "string") {
            zone = source.zone;
          } else {
            zone = source.zone.get() + "";
          }
          zone = zone.trimEnd();
        }
        if (zone.trim() === "") {
          zone = "UTC";
        }
        let zoned = void 0;
        if (date !== "" && time !== "") {
          if (date === "00000000" && time === "000000") {
            target.stamp?.clear();
            return;
          }
          const pt = temporal_polyfill_1.Temporal.PlainTime.from(time.substring(0, 2) + ":" + time.substring(2, 4) + ":" + time.substring(4, 6));
          zoned = temporal_polyfill_1.Temporal.PlainDate.from(date).toZonedDateTime({ timeZone: zone, plainTime: pt });
          zoned = zoned.withTimeZone("UTC");
        } else {
          if (stamp === "0") {
            target.date?.clear();
            target.time?.clear();
            return;
          }
          const pt = temporal_polyfill_1.Temporal.PlainTime.from(stamp.substring(8, 10) + ":" + stamp.substring(10, 12) + ":" + stamp.substring(12, 14));
          zoned = temporal_polyfill_1.Temporal.PlainDate.from(stamp.substring(0, 8)).toZonedDateTime({ timeZone: "UTC", plainTime: pt });
          zoned = zoned.withTimeZone(zone);
        }
        const d = zoned.toPlainDate().toString().replace(/-/g, "");
        const t = zoned.toPlainTime().toString().replace(/:/g, "");
        if (target.stamp) {
          target.stamp.set(d + t);
        }
        if (target.date) {
          target.date.set(d);
        }
        if (target.time) {
          target.time.set(t);
        }
      }
    }
  });

  // node_modules/@abaplint/runtime/build/src/statements/create_data.js
  var require_create_data = __commonJS({
    "node_modules/@abaplint/runtime/build/src/statements/create_data.js"(exports2) {
      "use strict";
      Object.defineProperty(exports2, "__esModule", { value: true });
      exports2.createData = createData;
      var throw_error_1 = require_throw_error();
      var types_12 = require_types();
      var tableOptions = { withHeader: false, keyType: types_12.TableKeyType.default };
      function createData(target, options) {
        if (target instanceof types_12.FieldSymbol) {
          createData(target.getPointer(), options);
          return;
        } else if (!(target instanceof types_12.DataReference)) {
          throw new Error("CREATE_DATA_REFERENCE_EXPECTED");
        }
        if (options?.name && options?.table) {
          if (abap.DDIC[options.name.trimEnd()] === void 0) {
            (0, throw_error_1.throwError)("CX_SY_CREATE_DATA_ERROR");
          }
          target.assign(new abap.types.Table(abap.DDIC[options.name.trimEnd()].type(), tableOptions));
        } else if (options?.name !== void 0) {
          if (abap.DDIC[options.name.trimEnd()]) {
            target.assign(abap.DDIC[options.name.trimEnd()].type().clone());
          } else if (options.name.includes("=>")) {
            const [className, typeName] = options.name.trimEnd().toUpperCase().split("=>");
            if (abap.Classes[className] === void 0) {
              (0, throw_error_1.throwError)("CX_SY_CREATE_DATA_ERROR");
            }
            if (abap.Classes[className][typeName.toLowerCase()] === void 0) {
              (0, throw_error_1.throwError)("CX_SY_CREATE_DATA_ERROR");
            }
            target.assign(abap.Classes[className][typeName.toLowerCase()].clone());
          } else if (options.name.startsWith("\\TYPE=%")) {
            const clas = abap.Classes["KERNEL_CREATE_DATA_HANDLE"];
            if (clas === void 0) {
              throw new Error("CreateData, kernel class missing");
            }
            clas.anonymous({ name: options.name.trimEnd(), dref: target });
          } else if (options.name.trimEnd() === "ABAP_BOOL") {
            target.assign(new types_12.Character(1, { qualifiedName: "ABAP_BOOL", ddicName: "ABAP_BOOL" }));
          } else if (options.name.trimEnd() === "STRING") {
            target.assign(new types_12.String());
          } else if (options.name.trimEnd() === "XSTRING") {
            target.assign(new types_12.XString());
          } else if (options.name.trimEnd() === "UTCLONG") {
            target.assign(new types_12.UTCLong());
          } else if (options.name.trimEnd() === "I") {
            target.assign(new types_12.Integer());
          } else if (options.name.trimEnd() === "T") {
            target.assign(new types_12.Time());
          } else if (options.name.trimEnd() === "D") {
            target.assign(new types_12.Date());
          } else if (options.name.trimEnd() === "F") {
            target.assign(new types_12.Float());
          } else if (options.name.trimEnd() === "INT8") {
            target.assign(new types_12.Integer8());
          } else if (options.refTo === true) {
            if (abap.Classes[options.name.toUpperCase()] === void 0) {
              (0, throw_error_1.throwError)("CX_SY_CREATE_DATA_ERROR");
            }
            target.assign(new abap.types.ABAPObject({ qualifiedName: options.name, RTTIName: options.name }));
          } else {
            (0, throw_error_1.throwError)("CX_SY_CREATE_DATA_ERROR");
          }
          if (options.typeLineOf === true) {
            target.assign(target.getPointer().getRowType().clone());
          }
        } else if (options?.typeName) {
          switch (options.typeName) {
            case "C":
              {
                let length = 1;
                if (options.length) {
                  length = options.length.get();
                }
                target.assign(new types_12.Character(length));
              }
              break;
            case "N":
              {
                let length = 1;
                if (options.length) {
                  length = options.length.get();
                }
                target.assign(new types_12.Numc({ length }));
              }
              break;
            case "X":
              {
                let length = 1;
                if (options.length) {
                  length = options.length.get();
                }
                target.assign(new types_12.Hex({ length }));
              }
              break;
            case "P":
              {
                let length = 1;
                if (options.length) {
                  length = options.length.get();
                }
                let decimals = 0;
                if (options.decimals) {
                  decimals = options.decimals.get();
                }
                target.assign(new types_12.Packed({ length, decimals }));
              }
              break;
            case "F":
              target.assign(new types_12.Float());
              break;
            case "D":
              target.assign(new types_12.Date());
              break;
            case "T":
              target.assign(new types_12.Time());
              break;
            case "I":
              target.assign(new types_12.Integer());
              break;
            case "STRING":
              target.assign(new types_12.String());
              break;
            case "INT8":
              target.assign(new types_12.Integer8());
              break;
            case "XSTRING":
              target.assign(new types_12.XString());
              break;
            case "UTCLONG":
              target.assign(new types_12.UTCLong());
              break;
            default:
              if (abap.DDIC[options.typeName.trimEnd()]) {
                target.assign(abap.DDIC[options.typeName.trimEnd()].type().clone());
              } else if (options.typeName.includes("=>")) {
                const [className, typeName] = options.typeName.toUpperCase().split("=>");
                if (abap.Classes[className] === void 0) {
                  (0, throw_error_1.throwError)("CX_SY_CREATE_DATA_ERROR");
                }
                if (abap.Classes[className][typeName.toLowerCase().trimEnd()] === void 0) {
                  (0, throw_error_1.throwError)("CX_SY_CREATE_DATA_ERROR");
                }
                target.assign(abap.Classes[className][typeName.toLowerCase().trimEnd()].clone());
              } else {
                throw "CREATE DATA, unknown type " + options.typeName;
              }
          }
        } else if (options?.type) {
          target.assign(options.type.clone());
        } else if (options?.likeLineOf) {
          if (options.likeLineOf instanceof types_12.FieldSymbol) {
            options.likeLineOf = options.likeLineOf.getPointer();
          }
          target.assign(options.likeLineOf.getRowType().clone());
        } else if (options?.like) {
          if (options.like instanceof types_12.FieldSymbol) {
            options.like = options.like.getPointer();
          }
          if (options.table === true) {
            target.assign(new abap.types.Table(options.like.clone(), tableOptions));
          } else {
            target.assign(options.like.clone());
          }
        } else {
          target.assign(target.getType()?.clone());
        }
      }
    }
  });

  // node_modules/@abaplint/runtime/build/src/statements/loop.js
  var require_loop = __commonJS({
    "node_modules/@abaplint/runtime/build/src/statements/loop.js"(exports, module) {
      "use strict";
      Object.defineProperty(exports, "__esModule", { value: true });
      exports.loop = loop;
      var binary_search_1 = require_binary_search();
      var types_1 = require_types();
      function determineFromTo(array, topEquals, key) {
        if (topEquals === void 0) {
          return { from: 1, to: array.length };
        }
        let from = 0;
        let to = array.length;
        const keyField = key.keyFields[0].toLowerCase();
        const keyValue = topEquals[keyField];
        if (keyField && keyValue) {
          from = (0, binary_search_1.binarySearchFrom)(array, from, to, keyField, keyValue);
          to = (0, binary_search_1.binarySearchTo)(array, from, to, keyField, keyValue);
        }
        return {
          from,
          to
        };
      }
      function dynamicToWhere(condition, evaluate) {
        let text = condition.replace(/ AND /gi, " && ").replace(/ OR /gi, " || ").replace(/ = /gi, " EQ ").replace(/ <> /gi, " NE ");
        if (evaluate === void 0) {
          throw new Error("Dynamic WHERE evaluation function is not defined");
        }
        const matches = text.matchAll(/([\w-]+)\s+(\w+)\s+([<>\w-]+)/gi);
        for (const match of matches) {
          const left = match[1];
          const comparator = match[2].toLowerCase();
          let right = "";
          const cleft = "i." + left.toLowerCase().replace(/-/g, ".get().");
          const rightMatches = match[3].matchAll(/<(\w+)>-(\w+)/gi);
          for (const rightMatch of rightMatches) {
            const name = "fs_" + rightMatch[1].toLowerCase() + "_";
            right = `evaluate("${name}").get()["${rightMatch[2].toLowerCase()}"]`;
          }
          if (right === "") {
            right = `evaluate("${match[3]}")`;
          }
          if (comparator === "in") {
            const cnew = `abap.compare.in(${cleft}, ${right})`;
            text = text.replace(match[0], cnew);
          } else {
            const cnew = `abap.compare.${comparator}(${cleft}, ${right})`;
            text = text.replace(match[0], cnew);
          }
        }
        return async (i) => {
          return eval(text);
        };
      }
      async function* loop(table, options) {
        if (table === void 0) {
          throw new Error("LOOP at undefined");
        } else if (table instanceof types_1.FieldSymbol) {
          const pnt = table.getPointer();
          if (pnt === void 0) {
            throw new Error("GETWA_NOT_ASSIGNED");
          }
          yield* loop(pnt, options);
          return;
        }
        if (options?.dynamicWhere) {
          const dynamicWhere = options.dynamicWhere;
          const newOptions = { ...options };
          delete newOptions.dynamicWhere;
          newOptions.where = dynamicToWhere(dynamicWhere.condition, dynamicWhere.evaluate);
          yield* loop(table, newOptions);
          return;
        }
        const length = table.getArrayLength();
        if (length === 0) {
          abap.builtin.sy.get().subrc.set(4);
          return;
        }
        let loopFrom = options?.from && options?.from.get() > 0 ? options.from.get() - 1 : 0;
        let loopTo = options?.to && options.to.get() < length ? options.to.get() : length;
        let array = [];
        if (options?.usingKey && options.usingKey !== void 0 && options.usingKey !== "primary_key") {
          array = table.getSecondaryIndex(options.usingKey);
          const { from, to } = determineFromTo(array, options.topEquals, table.getKeyByName(options.usingKey));
          loopFrom = Math.max(loopFrom, from) - 1;
          loopTo = Math.min(loopTo, to);
        } else {
          array = table.array();
        }
        const loopController = table.startLoop(loopFrom, loopTo, array);
        let entered = false;
        try {
          const isStructured = array[0] instanceof types_1.Structure;
          while (loopController.index < loopController.loopTo) {
            if (loopController.index > array.length) {
              break;
            }
            const current = array[loopController.index];
            if (options?.where) {
              const row = isStructured ? current.get() : { table_line: current };
              if (await options.where(row) === false) {
                loopController.index++;
                continue;
              }
            }
            abap.builtin.sy.get().tabix.set(loopController.index + 1);
            entered = true;
            yield current;
            loopController.index++;
            if (options?.to === void 0 && options?.usingKey === void 0) {
              loopController.loopTo = array.length;
            }
          }
        } finally {
          table.unregisterLoop(loopController);
          abap.builtin.sy.get().subrc.set(entered ? 0 : 4);
        }
      }
    }
  });

  // node_modules/@abaplint/runtime/build/src/statements/delete_internal.js
  var require_delete_internal = __commonJS({
    "node_modules/@abaplint/runtime/build/src/statements/delete_internal.js"(exports2) {
      "use strict";
      Object.defineProperty(exports2, "__esModule", { value: true });
      exports2.deleteInternal = deleteInternal;
      var types_12 = require_types();
      var compare_1 = require_compare();
      var loop_1 = require_loop();
      async function deleteInternal(target, options) {
        let index = 0;
        if (target instanceof types_12.FieldSymbol) {
          target = target.getPointer();
          if (target === void 0) {
            throw new Error("deleteInternal, FS not assigned");
          }
        }
        if (options?.index && options?.where === void 0 && options?.adjacent === void 0 && options?.fromValue === void 0 && options?.from === void 0 && options?.to === void 0) {
          if (options.index.get() === 0) {
            throw new Error("TABLE_INVALID_INDEX");
          }
          if (target.array()[options.index.get() - 1] === void 0) {
            abap.builtin.sy.get().subrc.set(4);
            return;
          } else {
            target.deleteIndex(options.index.get() - 1);
            abap.builtin.sy.get().subrc.set(0);
            return;
          }
        }
        if (options?.to) {
          if (options?.from !== void 0 || options?.where !== void 0) {
            throw "DeleteInternalTodo";
          }
          for (let i2 = 0; i2 < options.to.get(); i2++) {
            target.deleteIndex(0);
          }
          return;
        }
        if (options?.adjacent === true) {
          if (target instanceof types_12.HashedTable) {
            throw new Error("delete adjacent, hashed table");
          }
          const array = target.array();
          for (let index2 = array.length - 1; index2 > 0; index2--) {
            const prev = array[index2 - 1];
            const i2 = array[index2];
            if (options?.comparing) {
              let match = false;
              for (const compareField of options.comparing) {
                match = (0, compare_1.eq)(prev.get()[compareField], i2.get()[compareField]);
                if (!match) {
                  break;
                }
              }
              if (match) {
                target.deleteIndex(index2);
              }
            } else if ((0, compare_1.eq)(prev, i2) === true) {
              target.deleteIndex(index2);
            }
          }
          return;
        }
        if (target instanceof types_12.HashedTable && options?.fromValue) {
          target.deleteFrom(options.fromValue);
          return;
        }
        if (options === void 0) {
          target.deleteIndex(target.getCurrentLoopIndex());
          return;
        }
        for await (const i2 of (0, loop_1.loop)(target)) {
          index = abap.builtin.sy.get().tabix.get() - 1;
          if (options?.where) {
            const row = i2 instanceof types_12.Structure ? i2.get() : { table_line: i2 };
            if (await options.where(row) === true) {
              if (target instanceof types_12.HashedTable) {
                target.deleteFrom(i2);
              } else {
                target.deleteIndex(index);
              }
            }
          } else if (options?.index && options.index.get() === index) {
            target.deleteIndex(options.index.get() - 1);
            break;
          } else if (options?.fromValue && (0, compare_1.eq)(options.fromValue, i2)) {
            target.deleteIndex(index);
          } else if (options?.from && options.from.get() <= index + 1) {
            target.deleteIndex(index);
          }
        }
      }
    }
  });

  // node_modules/@abaplint/runtime/build/src/statements/describe.js
  var require_describe = __commonJS({
    "node_modules/@abaplint/runtime/build/src/statements/describe.js"(exports2) {
      "use strict";
      Object.defineProperty(exports2, "__esModule", { value: true });
      exports2.describe = describe;
      var types_12 = require_types();
      function describe(input) {
        if (input.type) {
          if (input.field instanceof types_12.FieldSymbol) {
            describe({ field: input.field.getPointer(), type: input.type, length: input.length, mode: input.mode });
            return;
          }
          if (input.field instanceof types_12.Table || input.field instanceof types_12.HashedTable) {
            input.type.set("h");
          } else if (input.field instanceof types_12.Character || typeof input.field === "string") {
            input.type.set("C");
          } else if (input.field instanceof types_12.Integer) {
            input.type.set("I");
          } else if (input.field instanceof types_12.Integer8) {
            input.type.set("8");
          } else if (input.field instanceof types_12.Date) {
            input.type.set("D");
          } else if (input.field instanceof types_12.Time) {
            input.type.set("T");
          } else if (input.field instanceof types_12.Float) {
            input.type.set("F");
          } else if (input.field instanceof types_12.Numc) {
            input.type.set("N");
          } else if (input.field instanceof types_12.Hex || input.field instanceof types_12.HexUInt8) {
            input.type.set("X");
          } else if (input.field instanceof types_12.Packed) {
            input.type.set("P");
          } else if (input.field instanceof types_12.String) {
            input.type.set("g");
          } else if (input.field instanceof types_12.XString) {
            input.type.set("y");
          } else if (input.field instanceof types_12.DecFloat34) {
            input.type.set("e");
          } else if (input.field instanceof types_12.Structure) {
            input.type.set("u");
          } else if (input.field instanceof types_12.ABAPObject) {
            input.type.set("r");
          } else if (input.field instanceof types_12.DataReference) {
            input.type.set("l");
          } else {
            throw new Error("DESCRIBE, todo, transpiler, " + input.field.constructor.name);
          }
        }
        if (input.field instanceof types_12.FieldSymbol) {
          input.field = input.field.getPointer();
        }
        if (input.length) {
          if (input.field instanceof types_12.Character || input.field instanceof types_12.Packed || input.field instanceof types_12.Numc || input.field instanceof types_12.HexUInt8 || input.field instanceof types_12.Hex) {
            input.length.set(input.field.getLength());
          } else {
            throw new Error("DESCRIBE length, unsupported or todo, " + input.field.constructor.name);
          }
        }
        if (input.decimals) {
          if (input.field instanceof types_12.Packed) {
            input.decimals.set(input.field.getDecimals());
          } else {
            throw new Error("DESCRIBE decimals, unsupported or todo, " + input.field.constructor.name);
          }
        }
        if (input.table) {
          abap.builtin.sy.get().tfill.set(input.table.getArrayLength());
          input.lines?.set(input.table.getArrayLength());
        }
      }
    }
  });

  // node_modules/@abaplint/runtime/build/src/abap_regex.js
  var require_abap_regex = __commonJS({
    "node_modules/@abaplint/runtime/build/src/abap_regex.js"(exports2) {
      "use strict";
      Object.defineProperty(exports2, "__esModule", { value: true });
      exports2.ABAPRegExp = void 0;
      var ABAPRegExp = class _ABAPRegExp {
        // converts from ABAP specific regex to javascript regex
        static convert(input) {
          let ret = input;
          ret = ret.replace(/\[\[:punct:\]\]/g, "[@%\\.\\,\\-\\{\\}\\[\\]\\:\\!\\?\\(\\)\\;\\']");
          ret = ret.replace(/\[\^\[:print:\]\]/g, "[\\x00-\\x1F\\x7F]");
          ret = ret.replace(/\[\[:digit:\]\]/g, "[0-9]");
          ret = ret.replace(/\\C/g, "[a-zA-Z]");
          ret = ret.replace("[[:space:]]", "\\s");
          return ret;
        }
        static escapeRegExp(text2) {
          return text2.replace(/[-[\]{}()*+?.,\\^$|#]/g, "\\$&");
        }
        static getRegex(options) {
          if (options.regex) {
            if (typeof options.regex === "string") {
              if (options.regex === "") {
                throw new Error("FIND, runtime, no input, regex empty");
              }
            } else if (options.regex.get() === "") {
              throw new Error("FIND, runtime, no input, regex empty");
            }
          }
          let ignoreCase = options.ignoringCase === true ? "i" : "";
          const allOccurrences = options.all === true ? "g" : "";
          let r = options.regex;
          if (r === void 0) {
            r = options.pcre;
          }
          if (typeof r !== "string") {
            r = r.get();
          }
          if (r.constructor.name === "cl_abap_regex") {
            const obj = r;
            r = obj.mv_pattern.get();
            if (obj.mv_ignore_case.get() === "X") {
              ignoreCase = "i";
            }
          } else if (typeof r !== "string") {
            throw "getRegex(), unexpected input";
          }
          r = _ABAPRegExp.convert(r);
          if (r.length === 0 && options.all === true) {
            throw "getRegex(), zero length input";
          }
          return new RegExp(r, "m" + ignoreCase + allOccurrences);
        }
      };
      exports2.ABAPRegExp = ABAPRegExp;
    }
  });

  // node_modules/@abaplint/runtime/build/src/statements/find.js
  var require_find = __commonJS({
    "node_modules/@abaplint/runtime/build/src/statements/find.js"(exports2) {
      "use strict";
      Object.defineProperty(exports2, "__esModule", { value: true });
      exports2.find = find;
      var abap_regex_1 = require_abap_regex();
      var types_12 = require_types();
      function find(input, options) {
        let sectionOffset = options.sectionOffset?.get();
        if (sectionOffset && options.byteMode) {
          sectionOffset = sectionOffset * 2;
        }
        let s = "";
        if (options.find) {
          s = options.find;
          if (typeof s !== "string") {
            s = s.get();
          }
          if (s === "") {
            abap.builtin.sy.get().subrc.set(0);
            return;
          }
          s = s.replace(/\[/g, "\\[");
          s = s.replace(/\]/g, "\\]");
          s = s.replace(/\?/g, "\\?");
          s = s.replace(/\(/g, "\\(");
          s = s.replace(/\)/g, "\\)");
          s = s.replace(/\./g, "\\.");
          s = s.replace(/\|/g, "\\|");
          s = s.replace(/\*/g, "\\*");
          s = s.replace(/\+/g, "\\+");
          s = new RegExp(s, "g");
        } else if (options.regex || options.pcre) {
          s = abap_regex_1.ABAPRegExp.getRegex({ all: true, ...options });
        } else {
          throw "FIND, runtime, no input";
        }
        const matches2 = [];
        if (input instanceof types_12.Table) {
          let line = 1;
          for (const blah of input.array()) {
            let temp;
            while (temp = s.exec(blah.get())) {
              matches2.push({ ...temp, line });
              if (options.first === true) {
                break;
              }
            }
            line++;
          }
        } else {
          let blah = input.get();
          if (sectionOffset) {
            blah = blah.substr(sectionOffset);
          }
          let temp;
          while (temp = s.exec(blah)) {
            matches2.push(temp);
            if (options.first === true) {
              break;
            }
          }
        }
        if (options.submatches) {
          for (let index = 0; index < options.submatches.length; index++) {
            if (matches2[0] && matches2[0][index + 1]) {
              options.submatches[index].set(matches2[0][index + 1]);
            } else if (matches2.length > 0) {
              options.submatches[index].clear();
            }
          }
        }
        if (options.results) {
          options.results.clear();
          for (const m of matches2) {
            const match = new types_12.Structure({
              line: new types_12.Integer(),
              offset: new types_12.Integer(),
              length: new types_12.Integer(),
              submatches: types_12.TableFactory.construct(new types_12.Structure({ offset: new types_12.Integer(), length: new types_12.Integer() }))
            });
            match.get().line.set(m.line || 0);
            match.get().offset.set(m.index);
            match.get().length.set(m[0].length);
            const submatch = new types_12.Structure({ offset: new types_12.Integer(), length: new types_12.Integer() });
            for (let i2 = 1; i2 < m.length; i2++) {
              if (m[i2] === void 0) {
                submatch.get().offset.set(-1);
                submatch.get().length.set(0);
              } else {
                submatch.get().offset.set(m.index + m[0].indexOf(m[i2]));
                submatch.get().length.set(m[i2].length);
              }
              match.get().submatches.append(submatch);
            }
            if (options.results instanceof types_12.Table) {
              options.results.append(match);
            } else {
              options.results.set(match);
            }
            if (options.first === void 0 || options.first === true) {
              break;
            }
          }
        }
        if (matches2.length === 0) {
          abap.builtin.sy.get().subrc.set(4);
        } else {
          abap.builtin.sy.get().subrc.set(0);
        }
        if (matches2[0]?.index !== void 0) {
          let val = matches2[0].index;
          if (sectionOffset) {
            val += sectionOffset;
          }
          if (options.byteMode) {
            val = val / 2;
          }
          options.offset?.set(val);
        }
        if (options?.count) {
          options.count?.set(matches2.length);
        } else {
          options.count?.clear();
        }
        if (options?.length && matches2 && matches2[0]) {
          options.length?.set(matches2[0][0].length);
        } else {
          options.length?.clear();
        }
      }
    }
  });

  // node_modules/@abaplint/runtime/build/src/statements/collect.js
  var require_collect = __commonJS({
    "node_modules/@abaplint/runtime/build/src/statements/collect.js"(exports2) {
      "use strict";
      Object.defineProperty(exports2, "__esModule", { value: true });
      exports2.collect = collect;
      var compare_1 = require_compare();
      var types_12 = require_types();
      var insert_internal_1 = require_insert_internal();
      var read_table_1 = require_read_table();
      function collect(source, target) {
        if (target === void 0 && source instanceof types_12.Table) {
          const read = (0, read_table_1.readTable)(source, { withKey: (i2) => {
            return (0, compare_1.eq)(i2.table_line, source.getHeader());
          } });
          if (read.subrc === 4) {
            (0, insert_internal_1.insertInternal)({ table: source, data: source.getHeader() });
          }
        } else if (target !== void 0) {
          const read = (0, read_table_1.readTable)(target, { withKey: (i2) => {
            return (0, compare_1.eq)(i2.table_line, source);
          } });
          if (read.subrc === 4) {
            (0, insert_internal_1.insertInternal)({ table: target, data: source });
          }
        } else {
          throw "COLLECT, no target specified";
        }
      }
    }
  });

  // node_modules/@abaplint/runtime/build/src/statements/overlay.js
  var require_overlay = __commonJS({
    "node_modules/@abaplint/runtime/build/src/statements/overlay.js"(exports2) {
      "use strict";
      Object.defineProperty(exports2, "__esModule", { value: true });
      exports2.overlay = overlay;
      var offset_length_1 = require_offset_length();
      var types_12 = require_types();
      function overlay(value, withh, _only) {
        const set = value instanceof types_12.Structure ? value.getCharacter() : value.get();
        const w = withh.get();
        const len = set.length;
        for (let i2 = 0; i2 < len; i2++) {
          if (set.substring(i2, i2 + 1) === " ") {
            new offset_length_1.OffsetLength(value, { offset: i2, length: 1 }).set(w.substring(i2, i2 + 1));
          }
        }
      }
    }
  });

  // node_modules/@abaplint/runtime/build/src/statements/cast.js
  var require_cast = __commonJS({
    "node_modules/@abaplint/runtime/build/src/statements/cast.js"(exports2) {
      "use strict";
      Object.defineProperty(exports2, "__esModule", { value: true });
      exports2.cast = cast;
      var throw_error_1 = require_throw_error();
      var types_12 = require_types();
      async function cast(target, source) {
        if (source instanceof types_12.ABAPObject && source.get() === void 0) {
          target.clear();
          return;
        }
        let checkIntf = true;
        if (source instanceof types_12.FieldSymbol) {
          if (source.getPointer() === void 0) {
            throw new Error("GETWA_NOT_ASSIGNED");
          }
          await cast(target, source.getPointer());
          return;
        } else if (target instanceof types_12.FieldSymbol && target.getPointer() === void 0) {
          throw new Error("GETWA_NOT_ASSIGNED");
        }
        let targetName = void 0;
        if (target.getQualifiedName) {
          targetName = target.getQualifiedName()?.toUpperCase();
        }
        let targetClass = abap.Classes[targetName];
        if (targetClass === void 0) {
          targetClass = abap.Classes["PROG-ZFOOBAR-" + targetName];
        }
        if (targetClass?.INTERNAL_TYPE === "CLAS") {
          if (source.get() instanceof targetClass === false) {
            (0, throw_error_1.throwError)("CX_SY_MOVE_CAST_ERROR");
          }
        } else if (checkIntf === true && targetClass?.INTERNAL_TYPE === "INTF") {
          const list = source.get().constructor.IMPLEMENTED_INTERFACES;
          const isImplemented = list.some((i2) => i2 === targetName);
          if (isImplemented === false) {
            (0, throw_error_1.throwError)("CX_SY_MOVE_CAST_ERROR");
          }
        }
        target.set(source);
        return target;
      }
    }
  });

  // node_modules/@abaplint/runtime/build/src/statements/read_report.js
  var require_read_report = __commonJS({
    "node_modules/@abaplint/runtime/build/src/statements/read_report.js"(exports2) {
      "use strict";
      Object.defineProperty(exports2, "__esModule", { value: true });
      exports2.readReport = readReport;
      var types_12 = require_types();
      function readReport(name, options) {
        if (options.into) {
          options.into.clear();
          options.into.append(new types_12.String().set("ReadReportTodo-" + name));
        }
        abap.builtin.sy.get().subrc.set(0);
      }
    }
  });

  // node_modules/@abaplint/runtime/build/src/statements/get_reference.js
  var require_get_reference = __commonJS({
    "node_modules/@abaplint/runtime/build/src/statements/get_reference.js"(exports2) {
      "use strict";
      Object.defineProperty(exports2, "__esModule", { value: true });
      exports2.getReference = getReference;
      var types_12 = require_types();
      function getReference(target, source) {
        if (source instanceof types_12.FieldSymbol) {
          source = source.getPointer();
          if (source === void 0) {
            throw new Error("GETWA_NOT_ASSIGNED");
          }
        }
        if (target instanceof types_12.FieldSymbol) {
          target = target.getPointer();
          if (target === void 0) {
            throw new Error("GETWA_NOT_ASSIGNED");
          }
        }
        target = target;
        target.assign(source);
        return target;
      }
    }
  });

  // node_modules/@abaplint/runtime/build/src/statements/raise_event.js
  var require_raise_event = __commonJS({
    "node_modules/@abaplint/runtime/build/src/statements/raise_event.js"(exports2) {
      "use strict";
      Object.defineProperty(exports2, "__esModule", { value: true });
      exports2.raiseEvent = raiseEvent;
      async function raiseEvent(eventReference, me, parameters) {
        const input = parameters || {};
        await abap.eventing.raiseEvent(eventReference, me, { ...input, sender: me });
      }
    }
  });

  // node_modules/@abaplint/runtime/build/src/statements/receive.js
  var require_receive = __commonJS({
    "node_modules/@abaplint/runtime/build/src/statements/receive.js"(exports2) {
      "use strict";
      Object.defineProperty(exports2, "__esModule", { value: true });
      exports2._receiveSetResult = _receiveSetResult;
      exports2.receive = receive;
      var cache = void 0;
      function _receiveSetResult(options) {
        cache = options;
      }
      function receive(options) {
        if (cache === void 0) {
          throw new Error("runtime receive(), no results");
        }
        for (const a in cache.importing || []) {
          const aval = cache.importing[a];
          const bval = options.importing[a];
          if (bval === void 0) {
            continue;
          }
          bval.set(aval);
        }
        for (const a in cache.tables || []) {
          const aval = cache.tables[a];
          const bval = options.tables[a];
          if (bval === void 0) {
            continue;
          }
          bval.set(aval);
        }
        for (const a in cache.changing || []) {
          const aval = cache.changing[a];
          const bval = options.changing[a];
          if (bval === void 0) {
            continue;
          }
          bval.set(aval);
        }
        cache = void 0;
      }
    }
  });

  // node_modules/@abaplint/runtime/build/src/statements/get_locale.js
  var require_get_locale = __commonJS({
    "node_modules/@abaplint/runtime/build/src/statements/get_locale.js"(exports2) {
      "use strict";
      Object.defineProperty(exports2, "__esModule", { value: true });
      exports2.getLocale = getLocale;
      function getLocale(target) {
        target.set("E");
      }
    }
  });

  // node_modules/@abaplint/runtime/build/src/statements/unpack.js
  var require_unpack = __commonJS({
    "node_modules/@abaplint/runtime/build/src/statements/unpack.js"(exports2) {
      "use strict";
      Object.defineProperty(exports2, "__esModule", { value: true });
      exports2.unpack = unpack;
      var throw_error_1 = require_throw_error();
      var types_12 = require_types();
      async function unpack(source, target) {
        if (source instanceof types_12.FieldSymbol) {
          const pointer = source.getPointer();
          if (pointer === void 0) {
            throw new Error("GETWA_NOT_ASSIGNED");
          }
          return unpack(pointer, target);
        }
        if (target instanceof types_12.FieldSymbol) {
          const pointer = target.getPointer();
          if (pointer === void 0) {
            throw new Error("GETWA_NOT_ASSIGNED");
          }
          return unpack(source, pointer);
        }
        if (source instanceof types_12.Character && target instanceof types_12.Character) {
          const sourceValue = source.getTrimEnd().trimStart();
          if (sourceValue.length > 0 && /^\d+$/.test(sourceValue) === false) {
            (0, throw_error_1.throwError)("CX_SY_CONVERSION_NO_NUMBER");
          }
          target.set(sourceValue.padStart(target.getLength(), "0"));
        } else if (source instanceof types_12.Packed && target instanceof types_12.Date) {
          target.set(source.get() + "");
        } else {
          throw new Error("unpack, transpiler runtime todo, types");
        }
      }
    }
  });

  // node_modules/@abaplint/runtime/build/src/statements/get_parameter.js
  var require_get_parameter = __commonJS({
    "node_modules/@abaplint/runtime/build/src/statements/get_parameter.js"(exports2) {
      "use strict";
      Object.defineProperty(exports2, "__esModule", { value: true });
      exports2.getParameter = getParameter;
      function getParameter(_source, _target) {
        abap.builtin.sy.get().subrc.set(4);
      }
    }
  });

  // node_modules/@abaplint/runtime/build/src/statements/set_locale.js
  var require_set_locale = __commonJS({
    "node_modules/@abaplint/runtime/build/src/statements/set_locale.js"(exports2) {
      "use strict";
      Object.defineProperty(exports2, "__esModule", { value: true });
      exports2.setLocale = setLocale;
      function setLocale(_source) {
      }
    }
  });

  // node_modules/@abaplint/runtime/build/src/statements/get_run_time.js
  var require_get_run_time = __commonJS({
    "node_modules/@abaplint/runtime/build/src/statements/get_run_time.js"(exports2) {
      "use strict";
      Object.defineProperty(exports2, "__esModule", { value: true });
      exports2.getRunTime = getRunTime;
      var prev = void 0;
      function getRunTime(value) {
        if (prev === void 0) {
          value.set(0);
          prev = (/* @__PURE__ */ new Date()).getTime();
        } else {
          const now = (/* @__PURE__ */ new Date()).getTime();
          value.set(now - prev);
          prev = now;
        }
      }
    }
  });

  // node_modules/@abaplint/runtime/build/src/statements/get_time.js
  var require_get_time = __commonJS({
    "node_modules/@abaplint/runtime/build/src/statements/get_time.js"(exports2) {
      "use strict";
      Object.defineProperty(exports2, "__esModule", { value: true });
      exports2.getTime = getTime;
      var types_12 = require_types();
      function getTime(options) {
        const d = /* @__PURE__ */ new Date();
        const date = d.getUTCFullYear() + (d.getUTCMonth() + 1 + "").padStart(2, "0") + (d.getUTCDate() + "").padStart(2, "0");
        const time = (d.getUTCHours() + "").padStart(2, "0") + (d.getUTCMinutes() + "").padStart(2, "0") + (d.getUTCSeconds() + "").padStart(2, "0");
        if (options === void 0) {
          options = {};
        }
        if (options?.sy === void 0) {
          options.sy = abap.builtin.sy;
        }
        options.sy.get().datlo.set(date);
        options.sy.get().datum.set(date);
        options.sy.get().timlo.set(time);
        options.sy.get().uzeit.set(time);
        if (options?.field) {
          options.field.set(time);
        }
        if (options?.stamp) {
          options.stamp.set(date + time);
          if (options.stamp instanceof types_12.Packed && options.stamp.getDecimals() === 7) {
            const str = (d.getUTCMilliseconds() + "").padStart(3, "0") + "0000";
            const decimals = Number.parseFloat("0." + str);
            options.stamp.set(options.stamp.get() + decimals);
          }
        }
      }
    }
  });

  // node_modules/@abaplint/runtime/build/src/prefix.js
  var require_prefix = __commonJS({
    "node_modules/@abaplint/runtime/build/src/prefix.js"(exports2) {
      "use strict";
      Object.defineProperty(exports2, "__esModule", { value: true });
      exports2.buildDbTableName = buildDbTableName;
      function buildDbTableName(table) {
        let ret = `"${abap.dbo.tablePrefix + table.trimEnd().toLowerCase()}"`;
        if (abap.dbo.schemaPrefix !== "") {
          ret = `"${abap.dbo.schemaPrefix}".` + ret;
        }
        return ret;
      }
    }
  });

  // node_modules/@abaplint/runtime/build/src/statements/insert_database.js
  var require_insert_database = __commonJS({
    "node_modules/@abaplint/runtime/build/src/statements/insert_database.js"(exports2) {
      "use strict";
      Object.defineProperty(exports2, "__esModule", { value: true });
      exports2.toValue = toValue;
      exports2.insertDatabase = insertDatabase;
      var prefix_1 = require_prefix();
      var types_12 = require_types();
      function toValue(value) {
        if (typeof value === "string") {
          return "'" + value.replace(/'/g, "''") + "'";
        } else {
          return value;
        }
      }
      async function insertDatabase(table, options, context) {
        const columns = [];
        const values = [];
        if (options.values === void 0 && options.table === void 0) {
          throw "insertDatabase, wrong input";
        }
        if (options.table !== void 0) {
          let subrc2 = 0;
          let dbcnt2 = 0;
          for (const row of options.table.array()) {
            await insertDatabase(table, { values: row, connection: options.connection }, context);
            subrc2 = Math.max(subrc2, abap.builtin.sy.get().subrc.get());
            dbcnt2 += abap.builtin.sy.get().dbcnt.get();
          }
          abap.builtin.sy.get().subrc.set(subrc2);
          abap.builtin.sy.get().dbcnt.set(dbcnt2);
          return;
        }
        const structure = options.values.get();
        for (const k of Object.keys(structure)) {
          const field = structure[k];
          if (field instanceof types_12.Structure) {
            continue;
          }
          columns.push(k);
          values.push(toValue(field.get()));
        }
        if (typeof table !== "string") {
          table = table.get().trimEnd().toLowerCase();
        }
        let db = context.defaultDB();
        if (options.connection) {
          db = context.databaseConnections[options.connection];
        }
        const { subrc, dbcnt } = await db.insert({
          table: (0, prefix_1.buildDbTableName)(table),
          columns,
          values
        });
        abap.builtin.sy.get().subrc.set(subrc);
        abap.builtin.sy.get().dbcnt.set(dbcnt);
        return subrc;
      }
    }
  });

  // node_modules/@abaplint/runtime/build/src/statements/delete_database.js
  var require_delete_database = __commonJS({
    "node_modules/@abaplint/runtime/build/src/statements/delete_database.js"(exports2) {
      "use strict";
      Object.defineProperty(exports2, "__esModule", { value: true });
      exports2.deleteDatabase = deleteDatabase;
      var prefix_1 = require_prefix();
      var types_12 = require_types();
      var insert_database_1 = require_insert_database();
      async function deleteDatabase(table, options, context) {
        if (options.table instanceof types_12.FieldSymbol) {
          options.table = options.table.getPointer();
        }
        if (options.from instanceof types_12.FieldSymbol) {
          options.from = options.from.getPointer();
        }
        if (typeof table !== "string") {
          table = table.get().trimEnd();
        }
        if (options.table) {
          for (const row of options.table.array()) {
            await deleteDatabase(table, { from: row }, context);
          }
        } else if (options.from) {
          let where = [];
          const structure = options.from.get();
          for (const k of Object.keys(structure)) {
            const str = `"${k.toLowerCase()}" = ` + (0, insert_database_1.toValue)(structure[k].get());
            where.push(str);
          }
          where = where.join(" AND ");
          const { subrc, dbcnt } = await context.defaultDB().delete({
            table: (0, prefix_1.buildDbTableName)(table),
            where
          });
          abap.builtin.sy.get().subrc.set(subrc);
          abap.builtin.sy.get().dbcnt.set(dbcnt);
        } else {
          const { subrc, dbcnt } = await context.defaultDB().delete({
            table: (0, prefix_1.buildDbTableName)(table),
            where: options.where || ""
          });
          abap.builtin.sy.get().subrc.set(subrc);
          abap.builtin.sy.get().dbcnt.set(dbcnt);
        }
      }
    }
  });

  // node_modules/@abaplint/runtime/build/src/statements/message.js
  var require_message = __commonJS({
    "node_modules/@abaplint/runtime/build/src/statements/message.js"(exports2) {
      "use strict";
      Object.defineProperty(exports2, "__esModule", { value: true });
      exports2.MessageStatement = void 0;
      var types_12 = require_types();
      function replace(text2, w) {
        for (let i2 = 0; i2 < 6; i2++) {
          const search = "&" + (i2 + 1);
          let replace2 = "";
          if (w && w[i2]) {
            const j = w[i2];
            if (typeof j === "string") {
              replace2 = j;
            } else {
              replace2 = (j.get() + "").trimEnd();
            }
          }
          const field = "msgv" + (i2 + 1);
          if (i2 <= 3) {
            abap.builtin.sy.get()[field].set(replace2);
          }
          text2 = text2.replace(search, replace2);
        }
        return text2.trim();
      }
      async function findText(context, arbgb, msgnr, msgty) {
        let text2 = void 0;
        if (arbgb && msgnr) {
          try {
            const select = `SELECT * FROM t100 WHERE sprsl='E' AND arbgb='${arbgb}' AND msgnr='${msgnr}' LIMIT 1`;
            const { rows: result } = await context.defaultDB().select({ select });
            if (result[0]) {
              text2 = result[0]["text"];
            }
          } catch {
          }
        }
        if (text2 === void 0) {
          text2 = abap.MSAG[arbgb?.trimEnd().toUpperCase()]?.[msgnr];
        }
        if (text2 === void 0) {
          text2 = msgty + ":" + arbgb?.trim() + ":" + msgnr + " &1 &2 &3 &4";
        }
        return text2;
      }
      var MessageStatement = class {
        context;
        constructor(context) {
          this.context = context;
        }
        async message(options) {
          let arbgb = options.id;
          if (arbgb !== void 0 && typeof arbgb !== "string") {
            arbgb = arbgb.get();
          }
          arbgb = arbgb?.toUpperCase();
          let msgty = options.type;
          if (msgty !== void 0 && typeof msgty !== "string") {
            msgty = msgty.get();
          }
          msgty = msgty?.toUpperCase();
          abap.builtin.sy.get().msgid.set(arbgb || "");
          let msgnr = options.number;
          if (msgnr !== void 0 && typeof msgnr !== "string") {
            msgnr = msgnr.get();
          }
          abap.builtin.sy.get().msgno.set(msgnr || "");
          abap.builtin.sy.get().msgty.set(msgty);
          let replaced = "";
          if (options.exceptionOrText) {
            if (options.exceptionOrText instanceof types_12.ABAPObject) {
              replaced = await options.exceptionOrText.get().if_message$get_text();
            } else {
              replaced = options.exceptionOrText.get();
            }
          } else {
            const text2 = await findText(this.context, arbgb, msgnr, msgty);
            replaced = replace(text2, options.with);
          }
          if (options.into) {
            options.into.set(replaced);
          } else {
            console.log(replaced);
          }
        }
      };
      exports2.MessageStatement = MessageStatement;
    }
  });

  // node_modules/@abaplint/runtime/build/src/statements/update_database.js
  var require_update_database = __commonJS({
    "node_modules/@abaplint/runtime/build/src/statements/update_database.js"(exports2) {
      "use strict";
      Object.defineProperty(exports2, "__esModule", { value: true });
      exports2.updateDatabase = updateDatabase;
      var prefix_1 = require_prefix();
      var types_12 = require_types();
      var insert_database_1 = require_insert_database();
      var throw_error_1 = require_throw_error();
      async function updateDatabase(table, options, context) {
        if (options.table instanceof types_12.FieldSymbol) {
          options.table = options.table.getPointer();
        }
        if (options.from instanceof types_12.FieldSymbol) {
          options.from = options.from.getPointer();
        }
        if (typeof table !== "string") {
          table = table.get();
        }
        const tabl = abap.DDIC[table.toUpperCase()];
        if (tabl === void 0) {
          await (0, throw_error_1.throwErrorWithParameters)("CX_SY_DYNAMIC_OSQL_SEMANTICS", { sqlmsg: new types_12.String().set(`Table ${table} not found`) });
        }
        const keys = tabl.keyFields;
        const where = [];
        const set = [];
        if (options.from) {
          const structure = options.from.get();
          for (const k of Object.keys(structure)) {
            const str = k + " = " + (0, insert_database_1.toValue)(structure[k].get());
            if (keys.includes(k.toUpperCase())) {
              where.push(str);
            } else {
              set.push(str);
            }
          }
        } else if (options.set) {
          if (options.where) {
            where.push(options.where);
          }
          set.push(...options.set);
        } else {
          console.dir(table);
          console.dir(options);
          throw new Error("updateDatabase, todo");
        }
        const { subrc, dbcnt } = await context.defaultDB().update({
          table: (0, prefix_1.buildDbTableName)(table),
          where: where.join(" AND "),
          set
        });
        abap.builtin.sy.get().subrc.set(subrc);
        abap.builtin.sy.get().dbcnt.set(dbcnt);
        return subrc;
      }
    }
  });

  // node_modules/@abaplint/runtime/build/src/statements/modify_database.js
  var require_modify_database = __commonJS({
    "node_modules/@abaplint/runtime/build/src/statements/modify_database.js"(exports2) {
      "use strict";
      Object.defineProperty(exports2, "__esModule", { value: true });
      exports2.modifyDatabase = modifyDatabase;
      var types_12 = require_types();
      var insert_database_1 = require_insert_database();
      var update_database_1 = require_update_database();
      async function modifyDatabase(table, options, context) {
        if (options.table instanceof types_12.FieldSymbol) {
          options.table = options.table.getPointer();
        }
        if (options.values instanceof types_12.FieldSymbol) {
          options.values = options.values.getPointer();
        }
        if (options.table) {
          for (const row of options.table.array()) {
            const subrc = await (0, insert_database_1.insertDatabase)(table, { values: row }, context);
            if (subrc !== 0) {
              await (0, update_database_1.updateDatabase)(table, { from: row }, context);
            }
          }
        } else if (options.values) {
          const subrc = await (0, insert_database_1.insertDatabase)(table, { values: options.values }, context);
          if (subrc !== 0) {
            await (0, update_database_1.updateDatabase)(table, { from: options.values }, context);
          }
        } else {
          throw "modifyDatabase todo";
        }
      }
    }
  });

  // node_modules/@abaplint/runtime/build/src/statements/modify_internal.js
  var require_modify_internal = __commonJS({
    "node_modules/@abaplint/runtime/build/src/statements/modify_internal.js"(exports2) {
      "use strict";
      Object.defineProperty(exports2, "__esModule", { value: true });
      exports2.modifyInternal = modifyInternal;
      var types_12 = require_types();
      var delete_internal_1 = require_delete_internal();
      var insert_internal_1 = require_insert_internal();
      var read_table_1 = require_read_table();
      function modifyInternal(table, options) {
        let found = false;
        if (options.index) {
          const index = options.index.get() - 1;
          const element = table.array()[index];
          found = element !== void 0;
          if (found) {
            element.set(options.from);
          }
        } else if (options.where && options.transporting && options.from) {
          let index = 1;
          const fs = new types_12.FieldSymbol();
          while (index <= table.array().length) {
            const currentIndex = new types_12.Integer().set(index);
            const readResult = (0, read_table_1.readTable)(table, {
              withKey: options.where,
              assigning: fs,
              index: currentIndex
            });
            if (readResult.subrc === 0) {
              found = true;
              for (const t of options.transporting) {
                fs.get()[t].set(options.from.get()[t]);
              }
            }
            index++;
          }
        } else if (options.from) {
          const readResult = (0, read_table_1.readTable)(table, { from: options.from });
          if (readResult.subrc === 0) {
            (0, delete_internal_1.deleteInternal)(table, { index: new types_12.Integer().set(readResult.foundIndex) });
          }
          (0, insert_internal_1.insertInternal)({ table, data: options.from });
        }
        const subrc = found ? 0 : 4;
        abap.builtin.sy.get().subrc.set(subrc);
      }
    }
  });

  // node_modules/@abaplint/runtime/build/src/statements/move_corresponding.js
  var require_move_corresponding = __commonJS({
    "node_modules/@abaplint/runtime/build/src/statements/move_corresponding.js"(exports2) {
      "use strict";
      Object.defineProperty(exports2, "__esModule", { value: true });
      exports2.moveCorresponding = moveCorresponding;
      var types_12 = require_types();
      function moveCorresponding(source, target) {
        if (source instanceof types_12.FieldSymbol) {
          if (source.isAssigned() === false) {
            throw new Error("GETWA_NOT_ASSIGNED");
          }
          return moveCorresponding(source.getPointer(), target);
        }
        if (target instanceof types_12.FieldSymbol) {
          if (target.isAssigned() === false) {
            throw new Error("GETWA_NOT_ASSIGNED");
          }
          return moveCorresponding(source, target.getPointer());
        }
        for (const n in source.get()) {
          if (target.get()[n] instanceof types_12.Structure) {
            moveCorresponding(source.get()[n], target.get()[n]);
          } else {
            target.get()[n]?.set(source.get()[n]);
          }
        }
        return target;
      }
    }
  });

  // node_modules/@abaplint/runtime/build/src/statements/replace.js
  var require_replace = __commonJS({
    "node_modules/@abaplint/runtime/build/src/statements/replace.js"(exports2) {
      "use strict";
      Object.defineProperty(exports2, "__esModule", { value: true });
      exports2.replace = replace;
      var abap_regex_1 = require_abap_regex();
      var types_12 = require_types();
      var concatenate_1 = require_concatenate();
      function replace(input) {
        if (input.target instanceof types_12.Table) {
          for (const row of input.target.array()) {
            replace({ ...input, target: row });
          }
          return;
        }
        let temp = input.target.get();
        const ignoreCase = input.ignoringCase === true ? "i" : "";
        const allOccurrences = input.all === true ? "g" : "";
        let search = void 0;
        let found = false;
        if (input.of) {
          let inp = input.of.get();
          if (input.of instanceof types_12.Character) {
            inp = input.of.getTrimEnd();
          }
          if (inp.length === 0 && input.all === true) {
            throw "REPLACE, zero length input";
          }
          found = temp.indexOf(inp) >= 0;
          inp = abap_regex_1.ABAPRegExp.escapeRegExp(inp);
          search = new RegExp(inp, ignoreCase + allOccurrences);
        } else if (input.regex || input.pcre) {
          search = abap_regex_1.ABAPRegExp.getRegex(input);
          found = temp.match(search) !== null;
        } else if (input.sectionLength && input.sectionOffset) {
          const before = input.target.getOffset({ length: input.sectionOffset });
          const after = input.target.getOffset({ offset: input.sectionLength.get() + input.sectionOffset.get() });
          (0, concatenate_1.concatenate)({ source: [before, input.with, after], target: input.target });
          abap.builtin.sy.get().subrc.set(0);
          return;
        } else {
          throw "REPLACE, unexpected input";
        }
        let rr = "";
        if (typeof input.with === "string") {
          rr = input.with;
        } else {
          if (input.with instanceof types_12.Character) {
            rr = input.with.getTrimEnd();
          } else {
            rr = input.with.get();
          }
          rr = rr.replace(/\\\$/g, "$");
          rr = rr.replace(/\\\{/g, "{");
          rr = rr.replace(/\\\}/g, "}");
        }
        if (input.replacementLength) {
          const match = temp.match(search);
          let replacement = rr;
          for (let counter = 1; counter < 10; counter++) {
            const dollar = "$" + counter;
            if (replacement.includes(dollar) && match && match[counter] !== void 0) {
              replacement = replacement.replace(dollar, match[counter]);
            }
          }
          input.replacementLength.set(replacement.length);
        }
        if (input.replacementCount) {
          const match = temp.match(search);
          input.replacementCount.set(match?.length || 0);
        }
        temp = temp.replace(search, rr);
        const subrc = found ? 0 : 4;
        abap.builtin.sy.get().subrc.set(subrc);
        input.target.set(temp);
      }
    }
  });

  // node_modules/@abaplint/runtime/build/src/statements/rollback.js
  var require_rollback = __commonJS({
    "node_modules/@abaplint/runtime/build/src/statements/rollback.js"(exports2) {
      "use strict";
      Object.defineProperty(exports2, "__esModule", { value: true });
      exports2.rollback = rollback;
      function rollback() {
      }
    }
  });

  // node_modules/@abaplint/runtime/build/src/statements/select.js
  var require_select = __commonJS({
    "node_modules/@abaplint/runtime/build/src/statements/select.js"(exports2) {
      "use strict";
      Object.defineProperty(exports2, "__esModule", { value: true });
      exports2.select = select;
      exports2.rowsToTarget = rowsToTarget;
      var types_12 = require_types();
      async function select(target, input, runtimeOptions, context) {
        const { rows } = await context.defaultDB().select(input);
        if (target instanceof types_12.FieldSymbol) {
          if (target.isAssigned() === false) {
            throw new Error("GETWA_NOT_ASSIGNED");
          }
          target = target.getPointer();
        }
        if (rows.length === 0) {
          abap.builtin.sy.get().dbcnt.set(0);
          abap.builtin.sy.get().subrc.set(4);
          return;
        }
        if (runtimeOptions?.appending !== true) {
          if (Array.isArray(target)) {
            target.forEach((f) => f.clear());
          } else {
            target?.clear();
          }
        }
        rowsToTarget(target, rows);
        if (target === void 0 && rows.length === 1) {
          abap.builtin.sy.get().dbcnt.set(Object.values(rows[0])[0]);
        } else {
          abap.builtin.sy.get().dbcnt.set(rows.length);
        }
        abap.builtin.sy.get().subrc.set(0);
      }
      function rowsToTarget(target, rows) {
        if (target instanceof types_12.Structure) {
          const result = {};
          for (const column in rows[0]) {
            if (rows[0][column] === null || target.get()[column] === void 0) {
              continue;
            }
            result[column] = target.get()[column].clone().set(rows[0][column]);
          }
          abap.statements.moveCorresponding(new types_12.Structure(result), target);
        } else if (target instanceof types_12.Table || target instanceof types_12.HashedTable) {
          for (const row of rows) {
            const targetRow = target.getRowType().clone();
            if (targetRow instanceof types_12.Structure) {
              for (let columnName in row) {
                columnName = columnName.toLowerCase();
                if (row[columnName] === null) {
                  targetRow.get()[columnName]?.clear();
                  continue;
                }
                targetRow.get()[columnName]?.set(row[columnName]);
              }
            } else {
              const columnName = Object.keys(row)[0];
              targetRow.set(row[columnName]);
            }
            abap.statements.insertInternal({ table: target, data: targetRow, noClone: true });
          }
        } else if (Array.isArray(target)) {
          for (let index = 0; index < target.length; index++) {
            const element = target[index];
            element.set(rows[0][Object.keys(rows[0])[index]]);
          }
        } else if (target !== void 0) {
          target.set(rows[0][Object.keys(rows[0])[0]]);
        }
      }
    }
  });

  // node_modules/@abaplint/runtime/build/src/statements/set_bit.js
  var require_set_bit = __commonJS({
    "node_modules/@abaplint/runtime/build/src/statements/set_bit.js"(exports2) {
      "use strict";
      Object.defineProperty(exports2, "__esModule", { value: true });
      exports2.setBit = setBit;
      var types_12 = require_types();
      function setBit(number, hex, val) {
        if (number.get() <= 0) {
          throw new Error("BIT_OFFSET_NOT_POSITIVE");
        } else if (hex instanceof types_12.HexUInt8) {
          const byteIndex = Math.floor((number.get() - 1) / 8);
          const bitIndex = (number.get() - 1) % 8;
          let bits = hex.getOffsetRaw(byteIndex);
          const bitMask = 1 << 8 - bitIndex - 1;
          if (val?.get() === 0 || val?.get() === "0") {
            bits &= ~bitMask;
          } else {
            bits |= bitMask;
          }
          hex.setOffset(byteIndex, bits);
        } else {
          const hexFull = hex.get();
          const fullByteLength = Math.ceil(hexFull.length / 2);
          const byteNum = Math.ceil(number.get() / 8);
          if (byteNum > fullByteLength) {
            return;
          }
          let pre = "";
          let byte = "";
          let post = "";
          if (hexFull.length > 2) {
            if (byteNum > 1) {
              pre = hexFull.substr(0, (byteNum - 1) * 2);
            }
            byte = hexFull.substr((byteNum - 1) * 2, 2);
            if (fullByteLength > byteNum) {
              post = hexFull.substr(byteNum * 2, (fullByteLength - byteNum) * 2);
            }
          } else {
            byte = hexFull;
          }
          let bits = parseInt(byte, 16);
          const bitMask = 1 << 8 - (number.get() - (byteNum - 1) * 8);
          if (val?.get() === 0 || val?.get() === "0") {
            bits &= ~bitMask;
          } else {
            bits |= bitMask;
          }
          const reconstructed = pre + bits.toString(16).toUpperCase().padStart(2, "0") + post;
          hex.set(reconstructed);
        }
      }
    }
  });

  // node_modules/@abaplint/runtime/build/src/statements/shift.js
  var require_shift = __commonJS({
    "node_modules/@abaplint/runtime/build/src/statements/shift.js"(exports2) {
      "use strict";
      Object.defineProperty(exports2, "__esModule", { value: true });
      exports2.shift = shift;
      var compare_1 = require_compare();
      var types_12 = require_types();
      function shift(target, options) {
        if (options?.mode === "BYTE") {
          shift_byte_mode(target, options);
        } else {
          shift_character_mode(target, options);
        }
      }
      function shift_character_mode(target, options) {
        let value = target.get();
        if (options?.deletingLeading) {
          let leading = options.deletingLeading;
          if (typeof leading !== "string") {
            leading = leading.get();
          }
          const split = leading.split("");
          while (split.some((s) => value.substr(0, 1) === s)) {
            value = value.substr(1);
          }
        } else if (options?.deletingTrailing) {
          let trailing = options.deletingTrailing;
          if (typeof trailing !== "string") {
            trailing = trailing.get();
          }
          if ((0, compare_1.co)(value, " ") === false) {
            while (value.endsWith(trailing)) {
              value = " ".repeat(trailing.length) + value.substring(0, value.length - trailing.length);
            }
          }
        } else if (options?.places) {
          const p = options.places.get();
          if (options.circular) {
            value = value.substr(p) + value.substr(0, p);
          } else {
            if (options.direction === "RIGHT") {
              value = " ".repeat(options.places.get()) + value.substring(0, options.places.get());
            } else {
              value = value.substr(p);
            }
          }
        } else if (options?.to) {
          let to = "";
          if (typeof options.to === "string") {
            to = options.to;
          } else {
            to = options.to.get();
          }
          const index = value.search(to);
          if (index > 0) {
            value = value.substr(index);
          }
        } else if (options?.circular) {
          if (options.direction === "RIGHT") {
            value = value.substring(value.length - 1, value.length) + value.substring(0, value.length - 1);
          } else {
            value = value.substr(1) + value.substr(0, 1);
          }
        } else {
          value = value.substr(1);
        }
        if (target instanceof types_12.Numc) {
          target.set(value, true);
        } else {
          target.set(value);
        }
      }
      function shift_byte_mode(target, options) {
        let value = target.get();
        if (options?.deletingLeading) {
          let leading = options.deletingLeading;
          if (typeof leading !== "string") {
            leading = leading.get();
          }
          const split = leading.split("");
          while (split.some((s) => value.substr(0, 2) === s)) {
            value = value.substr(2);
          }
        } else if (options?.places) {
          if (options.circular) {
            if (options.direction === "RIGHT") {
              for (let i2 = 0; i2 < options.places.get(); i2++) {
                value = value.substr(value.length - 2) + value.substr(0, value.length - 2);
              }
            } else {
              for (let i2 = 0; i2 < options.places.get(); i2++) {
                value = value.substr(2) + value.substr(0, 2);
              }
            }
          } else {
            const p = options.places.get() * 2;
            if (options.direction === "RIGHT") {
              value = "0".repeat(p) + value.substring(0, p);
            } else {
              value = value.substr(p);
            }
          }
        } else if (options?.to) {
          let to = "";
          if (typeof options.to === "string") {
            to = options.to;
          } else {
            to = options.to.get();
          }
          const index = value.search(to);
          if (index > 0) {
            value = value.substr(index);
          }
        } else if (options?.circular) {
          value = value.substr(2) + value.substr(0, 2);
        } else {
          value = value.substr(2);
        }
        target.set(value);
      }
    }
  });

  // node_modules/@abaplint/runtime/build/src/statements/wait.js
  var require_wait = __commonJS({
    "node_modules/@abaplint/runtime/build/src/statements/wait.js"(exports2) {
      "use strict";
      Object.defineProperty(exports2, "__esModule", { value: true });
      exports2.wait = wait;
      async function wait(options) {
        await new Promise((r) => setTimeout(r, 50));
        while (true) {
          if (options.cond() === true) {
            break;
          }
          await new Promise((r) => setTimeout(r, 500));
          console.log("WAIT waiting another round");
        }
      }
    }
  });

  // node_modules/@abaplint/runtime/build/src/statements/fetch_next_cursor.js
  var require_fetch_next_cursor = __commonJS({
    "node_modules/@abaplint/runtime/build/src/statements/fetch_next_cursor.js"(exports2) {
      "use strict";
      Object.defineProperty(exports2, "__esModule", { value: true });
      exports2.fetchNextCursor = fetchNextCursor;
      var types_12 = require_types();
      var select_1 = require_select();
      async function fetchNextCursor(context, cursor, target, packageSize) {
        if (target instanceof types_12.FieldSymbol) {
          if (target.isAssigned() === false) {
            throw new Error("GETWA_NOT_ASSIGNED");
          }
          target = target.getPointer();
        }
        if (target instanceof types_12.Structure) {
          packageSize = 1;
        }
        const result = await context.cursors[cursor].fetchNextCursor(packageSize);
        if (result.rows.length === 0) {
          abap.builtin.sy.get().subrc.set(4);
          return;
        }
        abap.builtin.sy.get().subrc.set(0);
        (0, select_1.rowsToTarget)(target, result.rows);
      }
    }
  });

  // node_modules/@abaplint/runtime/build/src/statements/open_cursor.js
  var require_open_cursor = __commonJS({
    "node_modules/@abaplint/runtime/build/src/statements/open_cursor.js"(exports2) {
      "use strict";
      Object.defineProperty(exports2, "__esModule", { value: true });
      exports2.openCursor = openCursor;
      async function openCursor(context, select, options) {
        let db = context.defaultDB();
        if (options?.connection) {
          db = context.databaseConnections[options.connection];
        }
        const callbacks = await db.openCursor({ select });
        const num = context.cursorCounter++;
        context.cursors[num] = callbacks;
        return num;
      }
    }
  });

  // node_modules/@abaplint/runtime/build/src/statements/close_cursor.js
  var require_close_cursor = __commonJS({
    "node_modules/@abaplint/runtime/build/src/statements/close_cursor.js"(exports2) {
      "use strict";
      Object.defineProperty(exports2, "__esModule", { value: true });
      exports2.closeCursor = closeCursor;
      async function closeCursor(context, cursor) {
        await context.cursors[cursor].closeCursor();
        delete context.cursors[cursor];
      }
    }
  });

  // node_modules/@abaplint/runtime/build/src/statements/set_handler.js
  var require_set_handler = __commonJS({
    "node_modules/@abaplint/runtime/build/src/statements/set_handler.js"(exports2) {
      "use strict";
      Object.defineProperty(exports2, "__esModule", { value: true });
      exports2.setHandler = setHandler;
      var types_12 = require_types();
      function setHandler(eventReference, methods, forObject, activation) {
        if (forObject instanceof types_12.FieldSymbol) {
          const pointer = forObject.getPointer();
          if (pointer === void 0) {
            throw new Error("CX_SY SOMETHING TODO");
          }
          return setHandler(eventReference, methods, pointer, activation);
        } else if (forObject instanceof types_12.ABAPObject && forObject.get() === void 0) {
          throw new Error("SET_HANDLER_FOR_NULL");
        }
        const act = activation === void 0 ? true : activation.get() === "X";
        abap.eventing.setHandler(eventReference, methods, forObject, act);
      }
    }
  });

  // node_modules/@abaplint/runtime/build/src/statements/split.js
  var require_split = __commonJS({
    "node_modules/@abaplint/runtime/build/src/statements/split.js"(exports2) {
      "use strict";
      Object.defineProperty(exports2, "__esModule", { value: true });
      exports2.split = split;
      var types_12 = require_types();
      function split(param) {
        let source = "";
        if (typeof param.source === "string") {
          source = param.source;
        } else if (param.source instanceof types_12.Character) {
          source = param.source.getTrimEnd();
        } else {
          source = param.source.get();
        }
        const at = typeof param.at === "string" ? param.at : param.at.get();
        const split2 = source.includes(at) ? source.split(at) : [];
        if (param.table) {
          if (source.endsWith(at)) {
            split2.pop();
          }
          param.table.clear();
          for (const s of split2) {
            param.table.append(new types_12.String().set(s));
          }
          if (source !== "" && split2.length === 0) {
            param.table.append(new types_12.String().set(source));
          }
        }
        if (param.targets) {
          if (split2.length === 0) {
            split2.push(source);
          }
          for (const t of param.targets) {
            t.clear();
            if (split2.length > 0) {
              t.set(split2.shift().replace(/ +$/, ""));
            }
          }
          if (split2.length > 0) {
            const concat = split2.join(at);
            const last = param.targets[param.targets.length - 1];
            last.set(last.get() + at + concat);
          }
        }
      }
    }
  });

  // node_modules/@abaplint/runtime/build/src/statements/translate.js
  var require_translate = __commonJS({
    "node_modules/@abaplint/runtime/build/src/statements/translate.js"(exports2) {
      "use strict";
      Object.defineProperty(exports2, "__esModule", { value: true });
      exports2.translate = translate;
      function translate(input, i2) {
        let c = i2;
        if (typeof c !== "string") {
          c = c.get();
        }
        if (c === "LOWER") {
          input.set(input.get().toLowerCase());
        } else if (c === "UPPER") {
          input.set(input.get().toUpperCase());
        } else {
          const chunks = c.match(/.{1,2}/g);
          const characters = input.get().split("");
          let result = "";
          for (let char of characters) {
            for (const chunk of chunks || []) {
              const search = chunk.substr(0, 1);
              const replace = chunk.substr(1, 1);
              if (char === search) {
                char = replace;
                break;
              }
            }
            result += char;
          }
          input.set(result);
        }
      }
    }
  });

  // node_modules/@abaplint/runtime/build/src/statements/call_transaction.js
  var require_call_transaction = __commonJS({
    "node_modules/@abaplint/runtime/build/src/statements/call_transaction.js"(exports2) {
      "use strict";
      Object.defineProperty(exports2, "__esModule", { value: true });
      exports2.callTransaction = callTransaction;
      function callTransaction() {
        abap.builtin.sy.get().subrc.set(4);
        abap.builtin.sy.get().msgid.set("00");
        abap.builtin.sy.get().msgty.set("E");
        abap.builtin.sy.get().msgno.set("000");
        abap.builtin.sy.get().msgv1.set("CALL TRANSACTION");
        abap.builtin.sy.get().msgv2.set("not supported in open-abap");
      }
    }
  });

  // node_modules/@abaplint/runtime/build/src/statements/write.js
  var require_write = __commonJS({
    "node_modules/@abaplint/runtime/build/src/statements/write.js"(exports2) {
      "use strict";
      Object.defineProperty(exports2, "__esModule", { value: true });
      exports2.WriteStatement = void 0;
      var types_12 = require_types();
      var NO_DEICMAL_CURRENCIES = ["HUF", "KRW", "JPY"];
      var WriteStatement = class {
        context;
        constructor(context) {
          this.context = context;
        }
        write(source, options) {
          let right = false;
          if (source === void 0) {
            throw new Error("WriteStatement: source is undefined");
          }
          if (options?.skipLine === true) {
            this.context.console.add("\n");
          } else {
            if (options?.newLine === true && this.context.console.isEmpty() === false) {
              this.context.console.add("\n");
            }
            let result = "";
            if (typeof source === "string" || typeof source === "number") {
              result = source.toString();
            } else if (source instanceof types_12.Structure) {
              const obj = source.getCharacter();
              this.write(obj, { ...options });
            } else if (source instanceof types_12.Float) {
              if (options?.exponent?.get() === 0) {
                const tens = source.getRaw().toFixed(0).length - 1;
                if (options.noSign === true && source.getRaw() < 0) {
                  result = source.getRaw().toFixed(17 - tens).replace(".", ",");
                  result = result.replace("-", "");
                } else {
                  result = source.getRaw().toFixed(16 - tens).replace(".", ",");
                }
              } else {
                result = source.get().toString();
              }
            } else if (source instanceof types_12.Packed) {
              let num = source.get();
              let decimals = source.getDecimals();
              if (NO_DEICMAL_CURRENCIES.includes(options?.currency?.get().trimEnd() || "")) {
                num = num * 100;
                decimals = 0;
              }
              result = num.toFixed(decimals).replace(".", ",");
              right = true;
            } else {
              result = source.get().toString();
            }
            if (options?.noSign === true) {
              result = result.replace("-", "");
            }
            if (options?.target) {
              if (right === true) {
                const len = options.target.get().length;
                options.target.set(" ".repeat(len - result.length) + result);
              } else {
                options.target.set(result);
              }
            } else {
              this.context.console.add(result);
            }
          }
        }
      };
      exports2.WriteStatement = WriteStatement;
    }
  });

  // node_modules/@abaplint/runtime/build/src/statements/call_function.js
  var require_call_function = __commonJS({
    "node_modules/@abaplint/runtime/build/src/statements/call_function.js"(exports2) {
      "use strict";
      Object.defineProperty(exports2, "__esModule", { value: true });
      exports2.CallFunction = void 0;
      var throw_error_1 = require_throw_error();
      var types_12 = require_types();
      var receive_1 = require_receive();
      var CallFunction = class {
        context;
        constructor(context) {
          this.context = context;
        }
        // note: this is only called if DESTINIATION is supplied
        async callFunction(options) {
          const param = {
            exporting: options.exporting,
            importing: options.importing,
            tables: options.tables,
            changing: options.changing,
            exceptions: options.exceptions
          };
          options.name = options.name.trimEnd();
          const fm = abap.FunctionModules[options.name];
          if (options.destination) {
            if (options.destination.trim() === "") {
              if (fm === void 0) {
                (0, throw_error_1.throwError)("CX_SY_DYN_CALL_ILLEGAL_FUNC");
              }
              await fm(param);
              return;
            }
            const dest = this.context.RFCDestinations[options.destination];
            if (dest === void 0) {
              throw new Error(`RFC destination ${options.destination} does not exist`);
            }
            await dest.call(options.name, {
              exporting: options.exporting,
              importing: options.importing,
              tables: options.tables,
              changing: options.changing,
              exceptions: options.exceptions
            });
          } else if (options.calling) {
            if (fm === void 0) {
              (0, throw_error_1.throwError)("CX_SY_DYN_CALL_ILLEGAL_FUNC");
            }
            await fm(param);
            (0, receive_1._receiveSetResult)(param);
            options.calling({ p_task: new types_12.Character(8).set("OPENABAP") });
          } else {
            throw new Error("runtime: callFunction, unexpected input");
          }
        }
      };
      exports2.CallFunction = CallFunction;
    }
  });

  // node_modules/@abaplint/runtime/build/src/trace.js
  var require_trace = __commonJS({
    "node_modules/@abaplint/runtime/build/src/trace.js"(exports2) {
      "use strict";
      Object.defineProperty(exports2, "__esModule", { value: true });
      exports2.Trace = void 0;
      var statements_1 = require_statements();
      var isAsyncFunction = (fn) => {
        if (typeof fn !== "function") {
          return false;
        }
        const tag = Object.prototype.toString.call(fn);
        if (tag === "[object AsyncFunction]") {
          return true;
        }
        const ctorName = fn?.constructor?.name;
        return ctorName === "AsyncFunction";
      };
      var Trace = class {
        traceTotals = {};
        setTrace(min, totals, statements) {
          const candidates = [...Object.keys(statements), ...Object.getOwnPropertyNames(statements_1.Statements.prototype)];
          for (const c of candidates) {
            if (c === "context" || c === "constructor" || c.startsWith("_") || c === "loop") {
              continue;
            }
            const func = statements[c];
            if (isAsyncFunction(func)) {
              statements[c] = this._traceAsync(func, c, min, totals);
            } else {
              statements[c] = this._trace(func, c, min, totals);
            }
          }
          return this;
        }
        getTotals() {
          return this.traceTotals;
        }
        //////////////////////////////////////////
        _trace(func, name, min, totals) {
          const tt = this.traceTotals;
          const exec1 = (...options) => {
            const start = Date.now();
            const result = func.bind(this)(...options);
            const runtime = Date.now() - start;
            if (totals === true) {
              if (tt[name] === void 0) {
                tt[name] = { calls: 0, totalRuntime: 0 };
              }
              tt[name].totalRuntime += runtime;
              tt[name].calls++;
            }
            if (min > 0 && runtime >= min) {
              console.log(`STATEMENT: ${name}, ${runtime} ms`);
              if (totals === true) {
                console.log(JSON.stringify(tt));
              }
            }
            return result;
          };
          return exec1;
        }
        _traceAsync(func, name, min, totals) {
          const tt = this.traceTotals;
          const exec2 = async (...options) => {
            const start = Date.now();
            const result = await func.bind(this)(...options);
            const runtime = Date.now() - start;
            if (totals === true) {
              if (tt[name] === void 0) {
                tt[name] = { calls: 0, totalRuntime: 0 };
              }
              tt[name].totalRuntime += runtime;
              tt[name].calls++;
            }
            if (min > 0 && runtime >= min) {
              console.log(`STATEMENT: ${name}, ${runtime} ms`);
              if (totals === true) {
                console.log(JSON.stringify(tt));
              }
            }
            return result;
          };
          return exec2;
        }
      };
      exports2.Trace = Trace;
    }
  });

  // node_modules/@abaplint/runtime/build/src/statements/index.js
  var require_statements = __commonJS({
    "node_modules/@abaplint/runtime/build/src/statements/index.js"(exports2) {
      "use strict";
      Object.defineProperty(exports2, "__esModule", { value: true });
      exports2.Statements = void 0;
      var append_1 = require_append();
      var assert_1 = require_assert();
      var assign_1 = require_assign();
      var commit_1 = require_commit();
      var concatenate_1 = require_concatenate();
      var condense_1 = require_condense();
      var convert_1 = require_convert();
      var create_data_1 = require_create_data();
      var delete_internal_1 = require_delete_internal();
      var describe_1 = require_describe();
      var find_1 = require_find();
      var collect_1 = require_collect();
      var overlay_1 = require_overlay();
      var cast_1 = require_cast();
      var get_bit_1 = require_get_bit();
      var read_report_1 = require_read_report();
      var get_reference_1 = require_get_reference();
      var raise_event_1 = require_raise_event();
      var receive_1 = require_receive();
      var get_locale_1 = require_get_locale();
      var unpack_1 = require_unpack();
      var get_parameter_1 = require_get_parameter();
      var set_locale_1 = require_set_locale();
      var get_run_time_1 = require_get_run_time();
      var get_time_1 = require_get_time();
      var insert_database_1 = require_insert_database();
      var insert_internal_1 = require_insert_internal();
      var delete_database_1 = require_delete_database();
      var loop_1 = require_loop();
      var message_1 = require_message();
      var modify_database_1 = require_modify_database();
      var modify_internal_1 = require_modify_internal();
      var move_corresponding_1 = require_move_corresponding();
      var read_table_1 = require_read_table();
      var replace_1 = require_replace();
      var rollback_1 = require_rollback();
      var select_1 = require_select();
      var set_bit_1 = require_set_bit();
      var shift_1 = require_shift();
      var sort_1 = require_sort();
      var wait_1 = require_wait();
      var fetch_next_cursor_1 = require_fetch_next_cursor();
      var open_cursor_1 = require_open_cursor();
      var close_cursor_1 = require_close_cursor();
      var set_handler_1 = require_set_handler();
      var split_1 = require_split();
      var translate_1 = require_translate();
      var call_transaction_1 = require_call_transaction();
      var update_database_1 = require_update_database();
      var write_1 = require_write();
      var call_function_1 = require_call_function();
      var trace_1 = require_trace();
      var Statements = class {
        append = append_1.append;
        assert = assert_1.assert;
        assign = assign_1.assign;
        cast = cast_1.cast;
        collect = collect_1.collect;
        commit = commit_1.commit;
        concatenate = concatenate_1.concatenate;
        condense = condense_1.condense;
        convert = convert_1.convert;
        createData = create_data_1.createData;
        deleteInternal = delete_internal_1.deleteInternal;
        describe = describe_1.describe;
        find = find_1.find;
        unpack = unpack_1.unpack;
        getBit = get_bit_1.getBit;
        readReport = read_report_1.readReport;
        getLocale = get_locale_1.getLocale;
        getParameter = get_parameter_1.getParameter;
        getRunTime = get_run_time_1.getRunTime;
        getTime = get_time_1.getTime;
        insertInternal = insert_internal_1.insertInternal;
        loop = loop_1.loop;
        modifyInternal = modify_internal_1.modifyInternal;
        moveCorresponding = move_corresponding_1.moveCorresponding;
        overlay = overlay_1.overlay;
        raiseEvent = raise_event_1.raiseEvent;
        readTable = read_table_1.readTable;
        replace = replace_1.replace;
        rollback = rollback_1.rollback;
        setBit = set_bit_1.setBit;
        setHandler = set_handler_1.setHandler;
        setLocale = set_locale_1.setLocale;
        getReference = get_reference_1.getReference;
        shift = shift_1.shift;
        sort = sort_1.sort;
        split = split_1.split;
        translate = translate_1.translate;
        wait = wait_1.wait;
        receive = receive_1.receive;
        callTransaction = call_transaction_1.callTransaction;
        context;
        constructor(context) {
          this.context = context;
        }
        _setTrace(min = 10, totals = false) {
          return new trace_1.Trace().setTrace(min, totals, this);
        }
        async openCursor(target, select, options) {
          const num = await (0, open_cursor_1.openCursor)(this.context, select, options);
          target.set(num);
        }
        async fetchNextCursor(cursor, target, packageSize) {
          await (0, fetch_next_cursor_1.fetchNextCursor)(this.context, cursor.get(), target, packageSize?.get() || 0);
        }
        async closeCursor(cursor) {
          await (0, close_cursor_1.closeCursor)(this.context, cursor.get());
        }
        async deleteDatabase(table, options) {
          await (0, delete_database_1.deleteDatabase)(table, options, this.context);
        }
        async insertDatabase(table, options) {
          return (0, insert_database_1.insertDatabase)(table, options, this.context);
        }
        async modifyDatabase(table, options) {
          return (0, modify_database_1.modifyDatabase)(table, options, this.context);
        }
        async select(target, select, runtimeOptions) {
          return (0, select_1.select)(target, select, runtimeOptions || {}, this.context);
        }
        async updateDatabase(table, options) {
          return (0, update_database_1.updateDatabase)(table, options, this.context);
        }
        async callFunction(options) {
          return new call_function_1.CallFunction(this.context).callFunction(options);
        }
        async message(options) {
          return new message_1.MessageStatement(this.context).message(options);
        }
        write(source, options) {
          return new write_1.WriteStatement(this.context).write(source, options);
        }
      };
      exports2.Statements = Statements;
    }
  });

  // node_modules/@abaplint/runtime/build/src/alpha.js
  var require_alpha = __commonJS({
    "node_modules/@abaplint/runtime/build/src/alpha.js"(exports2) {
      "use strict";
      Object.defineProperty(exports2, "__esModule", { value: true });
      exports2.alphaOut = alphaOut;
      exports2.alphaIn = alphaIn;
      var types_12 = require_types();
      function alphaOut(source) {
        const txt = source.get() + "";
        return txt.replace(/^0+/, "");
      }
      function alphaIn(source, context) {
        let txt = source.get() + "";
        if (txt.match(/^[0-9 ]+$/) === null) {
          return txt;
        }
        let length = 0;
        if (context instanceof types_12.String && source instanceof types_12.String) {
          return txt;
        } else if (context instanceof types_12.Character) {
          length = context.getLength();
        } else if (source instanceof types_12.Character) {
          length = source.getLength();
        }
        txt = txt.trimEnd();
        return txt.padStart(length, "0");
      }
    }
  });

  // node_modules/@abaplint/runtime/build/src/template_formatting.js
  var require_template_formatting = __commonJS({
    "node_modules/@abaplint/runtime/build/src/template_formatting.js"(exports2) {
      "use strict";
      Object.defineProperty(exports2, "__esModule", { value: true });
      exports2.templateFormatting = templateFormatting;
      var alpha_1 = require_alpha();
      var types_12 = require_types();
      function templateFormatting(source, options) {
        let text2 = "";
        if (source instanceof types_12.FieldSymbol) {
          if (source.getPointer() === void 0) {
            throw new Error("GETWA_NOT_ASSIGNED");
          }
          return templateFormatting(source.getPointer(), options);
        } else if (source instanceof types_12.Table || source instanceof types_12.HashedTable || source instanceof types_12.ABAPObject || source instanceof types_12.Structure) {
          throw new Error("STRG_ILLEGAL_DATA_TYPE");
        } else if (source instanceof types_12.Character) {
          text2 = source.getTrimEnd();
        } else if (source instanceof types_12.DecFloat34) {
          const raw = source.getRaw();
          if (Number.isInteger(raw)) {
            text2 = raw.toFixed(0);
          } else {
            text2 = raw + "";
          }
        } else if (source instanceof types_12.Float) {
          const raw = source.getRaw();
          if (options?.style === "scientific") {
            text2 = raw.toExponential().toUpperCase();
            text2 = text2.replace(/([+-])(\d)$/, "$10$2");
          } else if (Number.isInteger(raw)) {
            text2 = raw.toFixed(0);
          } else {
            text2 = raw.toFixed(16);
          }
        } else if (source instanceof types_12.Packed) {
          if (options?.decimals) {
            text2 = source.get().toFixed(options.decimals);
          } else {
            text2 = source.get().toFixed(source.getDecimals());
          }
        } else {
          text2 = source.get() + "";
        }
        if (options?.alpha === "out") {
          text2 = (0, alpha_1.alphaOut)(source);
        } else if (options?.alpha === "in") {
          text2 = (0, alpha_1.alphaIn)(source, options.alphaInContext);
        }
        if (options) {
          if (options.currency !== void 0) {
            throw "template formatting with currency not supported";
          }
          if (options.date === "iso") {
            text2 = text2.substr(0, 4) + "-" + text2.substr(4, 2) + "-" + text2.substr(6, 2);
          }
          if (options.time === "iso") {
            text2 = text2.substr(0, 2) + ":" + text2.substr(2, 2) + ":" + text2.substr(4, 2);
          }
          if (options.timestamp === "iso") {
            text2 = templateFormatting(source).replace(".", ",");
            text2 = text2.substr(0, 4) + "-" + text2.substr(4, 2) + "-" + text2.substr(6, 2) + "T" + text2.substr(8, 2) + ":" + text2.substr(10, 2) + ":" + text2.substr(12, 2) + text2.substr(14);
            if (text2 === "0--T::") {
              text2 = "0000-00-00T00:00:00";
            }
          } else if (options.width && options.pad) {
            if (options.align === "right") {
              text2 = text2.trimEnd().padStart(options.width, options.pad);
            } else {
              text2 = text2.trimEnd().padEnd(options.width, options.pad);
            }
          } else if (options.width) {
            text2 = text2.trimEnd().padEnd(options.width, " ");
          } else if (options.decimals && source instanceof types_12.Integer) {
            text2 = source.get().toFixed(options.decimals);
          } else if (options.decimals && source instanceof types_12.Float) {
            text2 = source.getRaw().toFixed(options.decimals);
          }
        }
        return text2;
      }
    }
  });

  // node_modules/@abaplint/runtime/build/src/builtin/abs.js
  var require_abs = __commonJS({
    "node_modules/@abaplint/runtime/build/src/builtin/abs.js"(exports2) {
      "use strict";
      Object.defineProperty(exports2, "__esModule", { value: true });
      exports2.abs = abs;
      var types_12 = require_types();
      function abs(input) {
        let num_in = void 0;
        if (typeof input.val === "number") {
          num_in = input.val;
        } else if (typeof input.val === "string") {
          num_in = parseFloat(input.val);
        } else if (input.val instanceof types_12.Float) {
          num_in = input.val.getRaw();
        } else {
          num_in = parseFloat(input.val.get().toString());
        }
        const ret = Math.abs(num_in);
        return ret;
      }
    }
  });

  // node_modules/@abaplint/runtime/build/src/builtin/boolc.js
  var require_boolc = __commonJS({
    "node_modules/@abaplint/runtime/build/src/builtin/boolc.js"(exports2) {
      "use strict";
      Object.defineProperty(exports2, "__esModule", { value: true });
      exports2.boolc = boolc;
      var types_12 = require_types();
      function boolc(input) {
        if (input === true) {
          return new types_12.String().set("X");
        } else if (input === false || input === void 0) {
          return new types_12.String().set(" ");
        } else if (input.val instanceof types_12.String && input.val.get().trim() === "") {
          return new types_12.String().set(" ");
        } else if (input.val instanceof types_12.Character && input.val.get().trim() === "") {
          return new types_12.String().set(" ");
        } else {
          return new types_12.String().set("X");
        }
      }
    }
  });

  // node_modules/@abaplint/runtime/build/src/builtin/ceil.js
  var require_ceil = __commonJS({
    "node_modules/@abaplint/runtime/build/src/builtin/ceil.js"(exports2) {
      "use strict";
      Object.defineProperty(exports2, "__esModule", { value: true });
      exports2.ceil = ceil;
      var types_12 = require_types();
      function ceil(input) {
        let num_in = void 0;
        if (typeof input.val === "number") {
          num_in = input.val;
        } else if (typeof input.val === "string") {
          num_in = parseFloat(input.val);
        } else if (input.val instanceof types_12.Float) {
          num_in = input.val.getRaw();
        } else {
          num_in = parseFloat(input.val.get().toString());
        }
        return Math.ceil(num_in);
      }
    }
  });

  // node_modules/@abaplint/runtime/build/src/builtin/concat_lines_of.js
  var require_concat_lines_of = __commonJS({
    "node_modules/@abaplint/runtime/build/src/builtin/concat_lines_of.js"(exports2) {
      "use strict";
      Object.defineProperty(exports2, "__esModule", { value: true });
      exports2.concat_lines_of = concat_lines_of;
      var string_1 = require_string();
      function concat_lines_of(input) {
        let s = input.sep;
        if (s === void 0) {
          s = "";
        } else if (typeof s !== "string") {
          s = s.get();
        }
        return new string_1.String().set(input.table.array().map((e) => e.get()).join(s));
      }
    }
  });

  // node_modules/@abaplint/runtime/build/src/builtin/condense.js
  var require_condense2 = __commonJS({
    "node_modules/@abaplint/runtime/build/src/builtin/condense.js"(exports2) {
      "use strict";
      Object.defineProperty(exports2, "__esModule", { value: true });
      exports2.condense = condense;
      var types_12 = require_types();
      function condense(input) {
        let str = typeof input.val === "string" ? input.val : input.val.get().toString();
        let from = " ";
        if (input.from) {
          from = typeof input.from === "string" ? input.from : input.from.get().toString();
        }
        let to = " ";
        if (input.to) {
          to = typeof input.to === "string" ? input.to : input.to.get().toString();
        }
        let del = " ";
        if (input.del) {
          del = typeof input.del === "string" ? input.del : input.del.get().toString();
        }
        const beginning = new RegExp(`[${del}]+$`);
        const end = new RegExp(`^[${del}]+`);
        str = str.replace(beginning, "");
        str = str.replace(end, "");
        for (const f of from.split("")) {
          str = str.replace(new RegExp(f.replace(".", "\\."), "g"), to);
        }
        return new types_12.String().set(str.replace(/ {2,}/g, " "));
      }
    }
  });

  // node_modules/@abaplint/runtime/build/src/builtin/contains.js
  var require_contains = __commonJS({
    "node_modules/@abaplint/runtime/build/src/builtin/contains.js"(exports2) {
      "use strict";
      Object.defineProperty(exports2, "__esModule", { value: true });
      exports2.contains = contains;
      var types_12 = require_types();
      function contains(input) {
        if (input.case !== void 0 || input.off !== void 0 || input.len !== void 0 || input.occ !== void 0) {
          throw "runtime, contains() todo";
        }
        let ret = " ";
        if (input.regex) {
          ret = input.val.get().match(input.regex.get()) !== null ? "X" : " ";
        } else if (input.sub) {
          ret = input.val.get().includes(input.sub.get()) ? "X" : " ";
        } else if (input.start) {
          ret = input.val.get().startsWith(input.start.get()) ? "X" : " ";
        } else if (input.end) {
          ret = input.val.get().endsWith(input.end.get()) ? "X" : " ";
        }
        return new types_12.String().set(ret);
      }
    }
  });

  // node_modules/@abaplint/runtime/build/src/builtin/cos.js
  var require_cos = __commonJS({
    "node_modules/@abaplint/runtime/build/src/builtin/cos.js"(exports2) {
      "use strict";
      Object.defineProperty(exports2, "__esModule", { value: true });
      exports2.cos = cos;
      var types_12 = require_types();
      function cos(input) {
        let num_in = void 0;
        if (typeof input.val === "number") {
          num_in = input.val;
        } else if (typeof input.val === "string") {
          num_in = parseFloat(input.val);
        } else if (input.val instanceof types_12.Float) {
          num_in = input.val.getRaw();
        } else {
          num_in = parseFloat(input.val.get().toString());
        }
        return Math.cos(num_in);
      }
    }
  });

  // node_modules/@abaplint/runtime/build/src/builtin/count_any_of.js
  var require_count_any_of = __commonJS({
    "node_modules/@abaplint/runtime/build/src/builtin/count_any_of.js"(exports2) {
      "use strict";
      Object.defineProperty(exports2, "__esModule", { value: true });
      exports2.count_any_of = count_any_of;
      var types_12 = require_types();
      function count_any_of(input) {
        let found = 0;
        const val = input.val.get();
        const sub = input.sub.get();
        if (sub !== "") {
          for (const char of sub.split("")) {
            const match = val.match(new RegExp(char, "g"));
            found += match?.length || 0;
          }
        }
        return new types_12.Integer().set(found);
      }
    }
  });

  // node_modules/@abaplint/runtime/build/src/builtin/count.js
  var require_count = __commonJS({
    "node_modules/@abaplint/runtime/build/src/builtin/count.js"(exports2) {
      "use strict";
      Object.defineProperty(exports2, "__esModule", { value: true });
      exports2.count = count;
      var compare_1 = require_compare();
      var types_12 = require_types();
      function count(input) {
        let found = 0;
        let val = input.val.get();
        if (input.off) {
          const off = input.off.get();
          val = val.substring(off);
        }
        if (input.len) {
          const len = input.len.get();
          val = val.substring(0, len);
        }
        let reg = "";
        if (input.sub) {
          reg = input.sub.get();
          reg = reg.replace(/\*/g, "\\*");
        } else if (input.regex) {
          reg = input.regex.get();
        } else if (input.pcre) {
          reg = input.pcre.get();
        }
        let options = "g";
        if (input.case && (0, compare_1.initial)(input.case)) {
          options += "i";
        }
        if (val !== "") {
          const res = val.match(new RegExp(reg, options));
          if (res) {
            found = res.length;
          }
        }
        return new types_12.Integer().set(found);
      }
    }
  });

  // node_modules/@abaplint/runtime/build/src/builtin/escape.js
  var require_escape = __commonJS({
    "node_modules/@abaplint/runtime/build/src/builtin/escape.js"(exports2) {
      "use strict";
      Object.defineProperty(exports2, "__esModule", { value: true });
      exports2.escape = escape;
      var types_12 = require_types();
      function escape(input) {
        let val = typeof input.val === "string" ? input.val : input.val.get();
        const format = typeof input.format === "number" ? input.format : input.format.get();
        switch (format) {
          case 1:
            val = val.replace(/&/g, "&amp;");
            val = val.replace(/</g, "&lt;");
            val = val.replace(/"/g, "&quot;");
            val = val.replace(/'/g, "&apos;");
            break;
          case 4:
            val = val.replace(/&/g, "&amp;");
            val = val.replace(/</g, "&lt;");
            val = val.replace(/>/g, "&gt;");
            break;
          case 5:
            val = val.replace(/&/g, "&amp;");
            val = val.replace(/</g, "&lt;");
            val = val.replace(/>/g, "&gt;");
            val = val.replace(/"/g, "&quot;");
            val = val.replace(/'/g, "&#39;");
            break;
          case 12:
            val = encodeURI(val);
            break;
          case 8:
            val = val.replace(/"/g, '\\"');
            val = val.replace(/'/g, "\\'");
            break;
          case 24:
            val = val.replace(/"/g, '\\"');
            val = val.replace(/\n/g, "\\n");
            break;
          default:
        }
        return new types_12.String().set(val);
      }
    }
  });

  // node_modules/@abaplint/runtime/build/src/builtin/find.js
  var require_find2 = __commonJS({
    "node_modules/@abaplint/runtime/build/src/builtin/find.js"(exports2) {
      "use strict";
      Object.defineProperty(exports2, "__esModule", { value: true });
      exports2.find = find;
      var throw_error_1 = require_throw_error();
      var types_12 = require_types();
      function find(input) {
        let val = typeof input.val === "string" ? input.val : input.val.get();
        if (input.len !== void 0) {
          throw "transpiler find(), todo len";
        }
        if (input.regex || input.pcre) {
          if (input.off !== void 0) {
            throw "transpiler find(), todo off regex";
          }
          const caseInput = typeof input.case === "string" ? input.case : input.case?.get();
          let regex = "";
          if (input.regex) {
            regex = typeof input.regex === "string" ? input.regex : input.regex.get();
          } else if (input.pcre) {
            regex = typeof input.pcre === "string" ? input.pcre : input.pcre.get();
          }
          const flags = caseInput !== "X" ? "i" : "";
          const reg = new RegExp(regex, flags);
          const ret = val.match(reg)?.index;
          if (ret !== void 0) {
            return new types_12.Integer().set(ret);
          } else {
            return new types_12.Integer().set(-1);
          }
        } else {
          const sub = typeof input.sub === "string" ? input.sub : input.sub?.get();
          let off = typeof input.off === "number" ? input.off : input.off?.get() || 0;
          let occ = typeof input.occ === "number" ? input.occ : input.occ?.get();
          if (occ === 0) {
            (0, throw_error_1.throwError)("CX_SY_STRG_PAR_VAL");
          } else if (occ === void 0) {
            occ = 1;
          }
          let negative = false;
          if (occ < 0) {
            negative = true;
            let reversed = "";
            for (const character of val) {
              reversed = character + reversed;
            }
            val = reversed;
            occ = Math.abs(occ);
          }
          let found = -1;
          for (let i2 = 0; i2 < occ; i2++) {
            found = val.indexOf(sub || "", off);
            if (found >= 0) {
              off = found + 1;
            }
          }
          if (negative === true && found >= 0) {
            found = val.length - found - 1;
          }
          return new types_12.Integer().set(found);
        }
      }
    }
  });

  // node_modules/@abaplint/runtime/build/src/builtin/floor.js
  var require_floor = __commonJS({
    "node_modules/@abaplint/runtime/build/src/builtin/floor.js"(exports2) {
      "use strict";
      Object.defineProperty(exports2, "__esModule", { value: true });
      exports2.floor = floor;
      var types_12 = require_types();
      function floor(input) {
        let num_in = void 0;
        if (typeof input.val === "number") {
          num_in = input.val;
        } else if (typeof input.val === "string") {
          num_in = parseFloat(input.val);
        } else if (input.val instanceof types_12.Float) {
          num_in = input.val.getRaw();
        } else {
          num_in = parseFloat(input.val.get().toString());
        }
        return Math.floor(num_in);
      }
    }
  });

  // node_modules/@abaplint/runtime/build/src/builtin/frac.js
  var require_frac = __commonJS({
    "node_modules/@abaplint/runtime/build/src/builtin/frac.js"(exports2) {
      "use strict";
      Object.defineProperty(exports2, "__esModule", { value: true });
      exports2.frac = frac;
      var types_12 = require_types();
      function frac(input) {
        let num_in = void 0;
        let ret = 0;
        let pre = "0.";
        if (typeof input.val === "number") {
          num_in = input.val;
        } else if (typeof input.val === "string") {
          num_in = parseFloat(input.val);
        } else if (input.val instanceof types_12.DecFloat34 || input.val instanceof types_12.Float) {
          num_in = input.val.getRaw();
        } else {
          num_in = parseFloat(input.val.get().toString());
        }
        const numSplit = num_in.toString().split(".");
        if (numSplit.length === 2) {
          if (num_in < 0) {
            pre = "-0.";
          }
          ret = parseFloat(pre + numSplit[1]);
        }
        if (input.val instanceof types_12.DecFloat34) {
          return new types_12.DecFloat34().set(ret);
        } else if (input.val instanceof types_12.Float) {
          return new types_12.Float().set(ret);
        } else {
          return ret;
        }
      }
    }
  });

  // node_modules/@abaplint/runtime/build/src/builtin/from_mixed.js
  var require_from_mixed = __commonJS({
    "node_modules/@abaplint/runtime/build/src/builtin/from_mixed.js"(exports2) {
      "use strict";
      Object.defineProperty(exports2, "__esModule", { value: true });
      exports2.from_mixed = from_mixed;
      var throw_error_1 = require_throw_error();
      var types_12 = require_types();
      function from_mixed(input) {
        let sep = input.sep;
        if (sep === void 0) {
          sep = "_";
        }
        if (typeof sep !== "string") {
          sep = sep.get();
        }
        if (sep.length === 0) {
          (0, throw_error_1.throwError)("CX_SY_STRG_PAR_VAL");
        }
        const min = 1;
        if (min < 0) {
          (0, throw_error_1.throwError)("CX_SY_STRG_PAR_VAL");
        }
        let val = input.val;
        if (typeof val !== "string") {
          val = val.get();
        }
        const regex = new RegExp(/([A-Z])/, "g");
        val = val.substring(0, 1) + val.substring(1).replace(regex, "_$1");
        return new types_12.String().set(val.toUpperCase());
      }
    }
  });

  // node_modules/@abaplint/runtime/build/src/builtin/insert.js
  var require_insert = __commonJS({
    "node_modules/@abaplint/runtime/build/src/builtin/insert.js"(exports2) {
      "use strict";
      Object.defineProperty(exports2, "__esModule", { value: true });
      exports2.insert = insert;
      var types_12 = require_types();
      function insert(input) {
        let offset = 0;
        if (input.off) {
          offset = input.off.get();
        }
        const value = input.val.getOffset({ offset: 0, length: offset }).get() + input.sub.get() + input.val.getOffset({ offset }).get();
        return new types_12.String().set(value);
      }
    }
  });

  // node_modules/@abaplint/runtime/build/src/builtin/ipow.js
  var require_ipow = __commonJS({
    "node_modules/@abaplint/runtime/build/src/builtin/ipow.js"(exports2) {
      "use strict";
      Object.defineProperty(exports2, "__esModule", { value: true });
      exports2.ipow = ipow;
      function ipow(input) {
        let base = void 0;
        if (typeof input.base === "number") {
          base = input.base;
        } else if (typeof input.base === "string") {
          base = parseFloat(input.base);
        } else {
          base = parseFloat(input.base.get().toString());
        }
        let exp = void 0;
        if (typeof input.exp === "number") {
          exp = input.exp;
        } else if (typeof input.exp === "string") {
          exp = parseFloat(input.exp);
        } else {
          exp = parseFloat(input.exp.get().toString());
        }
        return Math.pow(base, exp).toFixed(0);
      }
    }
  });

  // node_modules/@abaplint/runtime/build/src/is_line_not_found.js
  var require_is_line_not_found = __commonJS({
    "node_modules/@abaplint/runtime/build/src/is_line_not_found.js"(exports2) {
      "use strict";
      Object.defineProperty(exports2, "__esModule", { value: true });
      exports2.isLineNotFound = isLineNotFound;
      var builtin_1 = require_builtin();
      function isLineNotFound(error) {
        if (abap.Classes[builtin_1.LINE_NOT_FOUND] !== void 0 && error instanceof abap.Classes[builtin_1.LINE_NOT_FOUND]) {
          return true;
        } else if (error.toString() === `Error: Global class ${builtin_1.LINE_NOT_FOUND} not found`) {
          return true;
        }
        return false;
      }
    }
  });

  // node_modules/@abaplint/runtime/build/src/builtin/line_exists.js
  var require_line_exists = __commonJS({
    "node_modules/@abaplint/runtime/build/src/builtin/line_exists.js"(exports2) {
      "use strict";
      Object.defineProperty(exports2, "__esModule", { value: true });
      exports2.LINE_NOT_FOUND = void 0;
      exports2.line_exists = line_exists;
      var is_line_not_found_1 = require_is_line_not_found();
      exports2.LINE_NOT_FOUND = "CX_SY_ITAB_LINE_NOT_FOUND";
      async function line_exists(callback) {
        try {
          await callback();
        } catch (error) {
          if ((0, is_line_not_found_1.isLineNotFound)(error)) {
            return abap.builtin.abap_false;
          }
          throw error;
        }
        return abap.builtin.abap_true;
      }
    }
  });

  // node_modules/@abaplint/runtime/build/src/operators/add.js
  var require_add = __commonJS({
    "node_modules/@abaplint/runtime/build/src/operators/add.js"(exports2) {
      "use strict";
      Object.defineProperty(exports2, "__esModule", { value: true });
      exports2.add = add;
      var types_12 = require_types();
      var string_1 = require_string();
      var _parse_1 = require_parse();
      function add(left, right) {
        if (left instanceof types_12.Integer && right instanceof types_12.Integer) {
          return new types_12.Integer().set(left.get() + right.get());
        } else if (typeof left === "number" && typeof right === "number" && Number.isInteger(left) && Number.isInteger(right)) {
          return new types_12.Integer().set(left + right);
        } else if (typeof left === "number" && Number.isInteger(left) && right instanceof types_12.Integer) {
          return new types_12.Integer().set(left + right.get());
        } else if (typeof right === "number" && Number.isInteger(right) && left instanceof types_12.Integer) {
          return new types_12.Integer().set(left.get() + right);
        } else if ((left instanceof string_1.String || left instanceof types_12.Character) && Number.isInteger(Number(left.get())) && right instanceof types_12.Integer) {
          return new types_12.Integer().set(Number.parseInt(left.get(), 10) + right.get());
        } else if ((right instanceof string_1.String || right instanceof types_12.Character) && Number.isInteger(Number(right)) && left instanceof types_12.Integer) {
          return new types_12.Integer().set(left.get() + Number.parseInt(right.get(), 10));
        } else if (left instanceof types_12.Integer8) {
          if (right instanceof types_12.Integer8) {
            return new types_12.Integer8().set(left.get() + right.get());
          } else {
            return new types_12.Integer8().set(left.get() + BigInt((0, _parse_1.parse)(right)));
          }
        } else if (right instanceof types_12.Integer8) {
          return new types_12.Integer8().set(BigInt((0, _parse_1.parse)(left)) + right.get());
        }
        if (left instanceof types_12.FieldSymbol) {
          if (left.getPointer() === void 0) {
            throw new Error("GETWA_NOT_ASSIGNED");
          }
          return add(left.getPointer(), right);
        }
        if (right instanceof types_12.FieldSymbol) {
          if (right.getPointer() === void 0) {
            throw new Error("GETWA_NOT_ASSIGNED");
          }
          return add(left, right.getPointer());
        }
        const ret = new types_12.Float().set((0, _parse_1.parse)(left) + (0, _parse_1.parse)(right));
        return ret;
      }
    }
  });

  // node_modules/@abaplint/runtime/build/src/operators/_bit_operations.js
  var require_bit_operations = __commonJS({
    "node_modules/@abaplint/runtime/build/src/operators/_bit_operations.js"(exports2) {
      "use strict";
      Object.defineProperty(exports2, "__esModule", { value: true });
      exports2.get_bit_operation_chunks = get_bit_operation_chunks;
      function get_bit_operation_chunks(left, right) {
        const ret = [];
        let leftFull = left.get();
        const leftLen = leftFull.length;
        leftFull = leftFull.padEnd(Math.ceil(leftLen / 2) * 2, "0");
        let rightFull = right.get();
        const rightLen = rightFull.length;
        rightFull = rightFull.padEnd(Math.ceil(rightLen / 2) * 2, "0");
        const maxLen = leftFull.length > rightFull.length ? leftFull.length : rightFull.length;
        const chunks = maxLen / 6;
        for (let pass = chunks; pass > 0; pass--) {
          const chunkStart = maxLen - pass * 6;
          const chunkEnd = maxLen - (pass - 1) * 6;
          let leftSlice = leftFull.slice(chunkStart, chunkEnd);
          let rightSlice = rightFull.slice(chunkStart, chunkEnd);
          const chunkLen = leftSlice.length > rightSlice.length ? leftSlice.length : rightSlice.length;
          leftSlice = leftSlice.padEnd(chunkLen, "0");
          rightSlice = rightSlice.padEnd(chunkLen, "0");
          const leftChunk = parseInt(leftSlice, 16);
          const rightChunk = parseInt(rightSlice, 16);
          ret.push({ leftChunk, rightChunk, chunkLen });
        }
        return ret;
      }
    }
  });

  // node_modules/@abaplint/runtime/build/src/operators/bit-and.js
  var require_bit_and = __commonJS({
    "node_modules/@abaplint/runtime/build/src/operators/bit-and.js"(exports2) {
      "use strict";
      Object.defineProperty(exports2, "__esModule", { value: true });
      exports2.bitand = bitand;
      var types_12 = require_types();
      var _bit_operations_1 = require_bit_operations();
      function bitand(left, right) {
        let and = "";
        const chunks = (0, _bit_operations_1.get_bit_operation_chunks)(left, right);
        for (let i2 = 0, chunk; chunk = chunks[i2]; i2++) {
          and = and + (chunk.leftChunk & chunk.rightChunk).toString(16).toUpperCase().padStart(chunk.chunkLen, "0");
        }
        const ret = new types_12.XString();
        ret.set(and);
        return ret;
      }
    }
  });

  // node_modules/@abaplint/runtime/build/src/operators/bit-not.js
  var require_bit_not = __commonJS({
    "node_modules/@abaplint/runtime/build/src/operators/bit-not.js"(exports2) {
      "use strict";
      Object.defineProperty(exports2, "__esModule", { value: true });
      exports2.bitnot = bitnot;
      var builtin_1 = require_builtin();
      var types_12 = require_types();
      function bitnot(right) {
        const len = (0, builtin_1.xstrlen)({ val: right }).get();
        let not = "";
        for (let i2 = 0; i2 < len; i2++) {
          const byte = right.getOffset({ offset: i2, length: 1 });
          let binary = parseInt(byte.get(), 16).toString(2).padStart(8, "0");
          binary = binary.replace(/0/g, "2");
          binary = binary.replace(/1/g, "0");
          binary = binary.replace(/2/g, "1");
          const hex = parseInt(binary, 2).toString(16).padStart(2, "0");
          not += hex;
        }
        const ret = new types_12.Hex({ length: right.get().length / 2 });
        ret.set(not.toUpperCase());
        return ret;
      }
    }
  });

  // node_modules/@abaplint/runtime/build/src/operators/bit-or.js
  var require_bit_or = __commonJS({
    "node_modules/@abaplint/runtime/build/src/operators/bit-or.js"(exports2) {
      "use strict";
      Object.defineProperty(exports2, "__esModule", { value: true });
      exports2.bitor = bitor;
      var types_12 = require_types();
      var _bit_operations_1 = require_bit_operations();
      function bitor(left, right) {
        let or = "";
        const chunks = (0, _bit_operations_1.get_bit_operation_chunks)(left, right);
        for (let i2 = 0, chunk; chunk = chunks[i2]; i2++) {
          or = or + (chunk.leftChunk | chunk.rightChunk).toString(16).toUpperCase().padStart(chunk.chunkLen, "0");
        }
        const ret = new types_12.XString();
        ret.set(or);
        return ret;
      }
    }
  });

  // node_modules/@abaplint/runtime/build/src/operators/bit-xor.js
  var require_bit_xor = __commonJS({
    "node_modules/@abaplint/runtime/build/src/operators/bit-xor.js"(exports2) {
      "use strict";
      Object.defineProperty(exports2, "__esModule", { value: true });
      exports2.bitxor = bitxor;
      var types_12 = require_types();
      var _bit_operations_1 = require_bit_operations();
      function bitxor(left, right) {
        let xor = "";
        const chunks = (0, _bit_operations_1.get_bit_operation_chunks)(left, right);
        for (let i2 = 0, chunk; chunk = chunks[i2]; i2++) {
          xor = xor + (chunk.leftChunk ^ chunk.rightChunk).toString(16).toUpperCase().padStart(chunk.chunkLen, "0");
        }
        const ret = new types_12.XString();
        ret.set(xor);
        return ret;
      }
    }
  });

  // node_modules/@abaplint/runtime/build/src/operators/concat.js
  var require_concat = __commonJS({
    "node_modules/@abaplint/runtime/build/src/operators/concat.js"(exports2) {
      "use strict";
      Object.defineProperty(exports2, "__esModule", { value: true });
      exports2.concat = concat;
      var types_12 = require_types();
      function concat(left, right) {
        if (Array.isArray(left)) {
          let res = concat(left[0], left[1]);
          for (let i2 = 2; i2 < left.length; i2++) {
            res = concat(res, left[i2]);
          }
          return res;
        }
        let val = "";
        if (typeof left === "string" || typeof left === "number") {
          val += left;
        } else if (left instanceof types_12.Character) {
          val += left.getTrimEnd();
        } else {
          val += left.get();
        }
        if (typeof right === "string" || typeof right === "number") {
          val += right;
        } else if (right instanceof types_12.Character) {
          val += right.getTrimEnd();
        } else {
          val += right.get();
        }
        return new types_12.String().set(val);
      }
    }
  });

  // node_modules/@abaplint/runtime/build/src/operators/div.js
  var require_div = __commonJS({
    "node_modules/@abaplint/runtime/build/src/operators/div.js"(exports2) {
      "use strict";
      Object.defineProperty(exports2, "__esModule", { value: true });
      exports2.div = div;
      var throw_error_1 = require_throw_error();
      var types_12 = require_types();
      var _parse_1 = require_parse();
      function div(left, right) {
        if (left instanceof types_12.Integer8 || right instanceof types_12.Integer8) {
          const l2 = left instanceof types_12.Integer8 ? left.get() : BigInt((0, _parse_1.parse)(left));
          const r2 = right instanceof types_12.Integer8 ? right.get() : BigInt((0, _parse_1.parse)(right));
          if (r2 === 0n) {
            if (l2 === 0n) {
              return new types_12.Integer8().set(0n);
            } else {
              (0, throw_error_1.throwError)("CX_SY_ZERODIVIDE");
            }
          }
          const remainder = l2 % r2;
          let div2 = l2 / r2;
          if (remainder !== 0n) {
            const sign1 = l2 < 0n;
            const sign2 = r2 < 0n;
            if (sign1 !== sign2) {
              div2 = div2 - 1n;
            }
          }
          return new types_12.Integer8().set(div2);
        }
        const l = (0, _parse_1.parse)(left);
        const r = (0, _parse_1.parse)(right);
        if (r === 0) {
          if (l === 0) {
            return new types_12.Integer().set(0);
          } else {
            (0, throw_error_1.throwError)("CX_SY_ZERODIVIDE");
          }
        } else {
          return new types_12.Integer().set(Math.floor(l / r));
        }
      }
    }
  });

  // node_modules/@abaplint/runtime/build/src/operators/divide.js
  var require_divide = __commonJS({
    "node_modules/@abaplint/runtime/build/src/operators/divide.js"(exports2) {
      "use strict";
      Object.defineProperty(exports2, "__esModule", { value: true });
      exports2.divide = divide;
      var throw_error_1 = require_throw_error();
      var types_12 = require_types();
      var _parse_1 = require_parse();
      function divide(left, right) {
        if (left instanceof types_12.Integer8 || right instanceof types_12.Integer8) {
          const l2 = left instanceof types_12.Integer8 ? left.get() : BigInt((0, _parse_1.parse)(left));
          const r2 = right instanceof types_12.Integer8 ? right.get() : BigInt((0, _parse_1.parse)(right));
          if (r2 === 0n) {
            if (l2 === 0n) {
              return new types_12.Integer8().set(0n);
            } else {
              (0, throw_error_1.throwError)("CX_SY_ZERODIVIDE");
            }
          }
          return new types_12.Integer8().set(l2 / r2);
        }
        const r = (0, _parse_1.parse)(right);
        const l = (0, _parse_1.parse)(left);
        if (r === 0) {
          if (l === 0) {
            return new types_12.Integer().set(0);
          } else {
            (0, throw_error_1.throwError)("CX_SY_ZERODIVIDE");
          }
        }
        const val = l / r;
        return new types_12.Float().set(val);
      }
    }
  });

  // node_modules/@abaplint/runtime/build/src/operators/minus.js
  var require_minus = __commonJS({
    "node_modules/@abaplint/runtime/build/src/operators/minus.js"(exports2) {
      "use strict";
      Object.defineProperty(exports2, "__esModule", { value: true });
      exports2.minus = minus;
      var types_12 = require_types();
      var _parse_1 = require_parse();
      var string_1 = require_string();
      function minus(left, right) {
        if (left instanceof types_12.FieldSymbol) {
          if (left.getPointer() === void 0) {
            throw new Error("GETWA_NOT_ASSIGNED");
          }
          return minus(left.getPointer(), right);
        }
        if (right instanceof types_12.FieldSymbol) {
          if (right.getPointer() === void 0) {
            throw new Error("GETWA_NOT_ASSIGNED");
          }
          return minus(left, right.getPointer());
        }
        if (left instanceof types_12.Integer && right instanceof types_12.Integer) {
          return new types_12.Integer().set(left.get() - right.get());
        } else if (left instanceof types_12.Integer8 || right instanceof types_12.Integer8) {
          const l = left instanceof types_12.Integer8 ? left.get() : BigInt((0, _parse_1.parse)(left));
          const r = right instanceof types_12.Integer8 ? right.get() : BigInt((0, _parse_1.parse)(right));
          return new types_12.Integer8().set(l - r);
        } else if (typeof left === "number" && typeof right === "number" && Number.isInteger(left) && Number.isInteger(right)) {
          return new types_12.Integer().set(left - right);
        } else if (typeof left === "number" && Number.isInteger(left) && right instanceof types_12.Integer) {
          return new types_12.Integer().set(left - right.get());
        } else if (typeof right === "number" && Number.isInteger(right) && left instanceof types_12.Integer) {
          return new types_12.Integer().set(left.get() - right);
        } else if ((left instanceof string_1.String || left instanceof types_12.Character) && Number.isInteger(Number(left.get())) && right instanceof types_12.Integer) {
          return new types_12.Integer().set(Number.parseInt(left.get(), 10) - right.get());
        } else if ((right instanceof string_1.String || right instanceof types_12.Character) && Number.isInteger(Number(right)) && left instanceof types_12.Integer) {
          return new types_12.Integer().set(left.get() - Number.parseInt(right.get(), 10));
        }
        return new types_12.Float().set((0, _parse_1.parse)(left) - (0, _parse_1.parse)(right));
      }
    }
  });

  // node_modules/@abaplint/runtime/build/src/operators/mod.js
  var require_mod = __commonJS({
    "node_modules/@abaplint/runtime/build/src/operators/mod.js"(exports2) {
      "use strict";
      Object.defineProperty(exports2, "__esModule", { value: true });
      exports2.mod = mod;
      var throw_error_1 = require_throw_error();
      var types_12 = require_types();
      var _parse_1 = require_parse();
      function mod(left, right) {
        if (left instanceof types_12.Integer8 || right instanceof types_12.Integer8) {
          const l2 = left instanceof types_12.Integer8 ? left.get() : BigInt((0, _parse_1.parse)(left));
          const r2 = right instanceof types_12.Integer8 ? right.get() : BigInt((0, _parse_1.parse)(right));
          if (r2 === 0n) {
            if (l2 === 0n) {
              return new types_12.Integer8().set(0n);
            } else {
              (0, throw_error_1.throwError)("CX_SY_ZERODIVIDE");
            }
          }
          let val2 = (l2 % r2 + r2) % r2;
          if (val2 < 0) {
            val2 = val2 * -1n;
          }
          return new types_12.Integer8().set(val2);
        }
        const l = (0, _parse_1.parse)(left);
        const r = (0, _parse_1.parse)(right);
        if (r === 0) {
          if (l === 0) {
            return new types_12.Integer().set(0);
          } else {
            (0, throw_error_1.throwError)("CX_SY_ZERODIVIDE");
          }
        }
        let val = (l % r + r) % r;
        if (val < 0) {
          val = val * -1;
        }
        if (left instanceof types_12.Integer8 || right instanceof types_12.Integer8) {
          return new types_12.Integer8().set(val);
        } else {
          return new types_12.Integer().set(val);
        }
      }
    }
  });

  // node_modules/@abaplint/runtime/build/src/operators/multiply.js
  var require_multiply = __commonJS({
    "node_modules/@abaplint/runtime/build/src/operators/multiply.js"(exports2) {
      "use strict";
      Object.defineProperty(exports2, "__esModule", { value: true });
      exports2.multiply = multiply;
      var types_12 = require_types();
      var _parse_1 = require_parse();
      var string_1 = require_string();
      function multiply(left, right) {
        if (left instanceof types_12.Integer8 || right instanceof types_12.Integer8) {
          const l = left instanceof types_12.Integer8 ? left.get() : BigInt((0, _parse_1.parse)(left));
          const r = right instanceof types_12.Integer8 ? right.get() : BigInt((0, _parse_1.parse)(right));
          return new types_12.Integer8().set(l * r);
        } else if (left instanceof types_12.Integer && right instanceof types_12.Integer) {
          const val = left.get() * right.get();
          return new types_12.Integer().set(val);
        } else if (typeof left === "number" && typeof right === "number" && Number.isInteger(left) && Number.isInteger(right)) {
          const val = left * right;
          return new types_12.Integer().set(val);
        } else if (typeof left === "number" && Number.isInteger(left) && right instanceof types_12.Integer) {
          const val = left * right.get();
          return new types_12.Integer().set(val);
        } else if (typeof right === "number" && Number.isInteger(right) && left instanceof types_12.Integer) {
          const val = left.get() * right;
          return new types_12.Integer().set(val);
        } else if ((left instanceof string_1.String || left instanceof types_12.Character) && Number.isInteger(Number(left.get())) && right instanceof types_12.Integer) {
          const val = Number.parseInt(left.get(), 10) * right.get();
          return new types_12.Integer().set(val);
        } else if ((right instanceof string_1.String || right instanceof types_12.Character) && Number.isInteger(Number(right)) && left instanceof types_12.Integer) {
          const val = left.get() * Number.parseInt(right.get(), 10);
          return new types_12.Integer().set(val);
        }
        return new types_12.Float().set((0, _parse_1.parse)(left) * (0, _parse_1.parse)(right));
      }
    }
  });

  // node_modules/@abaplint/runtime/build/src/operators/power.js
  var require_power = __commonJS({
    "node_modules/@abaplint/runtime/build/src/operators/power.js"(exports2) {
      "use strict";
      Object.defineProperty(exports2, "__esModule", { value: true });
      exports2.power = power;
      var types_12 = require_types();
      var _parse_1 = require_parse();
      function power(left, right) {
        if (left instanceof types_12.Integer8 || right instanceof types_12.Integer8) {
          const l = left instanceof types_12.Integer8 ? left.get() : BigInt((0, _parse_1.parse)(left));
          const r = right instanceof types_12.Integer8 ? right.get() : BigInt((0, _parse_1.parse)(right));
          return new types_12.Integer8().set(l ** r);
        }
        return new types_12.Float().set(Math.pow((0, _parse_1.parse)(left), (0, _parse_1.parse)(right)));
      }
    }
  });

  // node_modules/@abaplint/runtime/build/src/operators/table_expression.js
  var require_table_expression = __commonJS({
    "node_modules/@abaplint/runtime/build/src/operators/table_expression.js"(exports2) {
      "use strict";
      Object.defineProperty(exports2, "__esModule", { value: true });
      exports2.foundIndex = void 0;
      exports2.tableExpression = tableExpression;
      var read_table_1 = require_read_table();
      var throw_error_1 = require_throw_error();
      var _parse_1 = require_parse();
      exports2.foundIndex = 0;
      async function tableExpression(source, options) {
        let found;
        if (options.index) {
          exports2.foundIndex = (0, _parse_1.parse)(options.index) - 1;
          found = source.array()[exports2.foundIndex];
        } else if (options.withKey) {
          const search = await (0, read_table_1.searchWithKeyPromise)(source.array(), options.withKey, 0, options?.usesTableLine);
          found = search.found;
          exports2.foundIndex = search.foundIndex;
        } else {
          throw new Error("TableExpression runtime: todo");
        }
        if (found === void 0) {
          (0, throw_error_1.throwError)("CX_SY_ITAB_LINE_NOT_FOUND");
        }
        return found;
      }
    }
  });

  // node_modules/@abaplint/runtime/build/src/operators/index.js
  var require_operators = __commonJS({
    "node_modules/@abaplint/runtime/build/src/operators/index.js"(exports2) {
      "use strict";
      var __createBinding = exports2 && exports2.__createBinding || (Object.create ? (function(o, m, k, k2) {
        if (k2 === void 0) k2 = k;
        var desc = Object.getOwnPropertyDescriptor(m, k);
        if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
          desc = { enumerable: true, get: function() {
            return m[k];
          } };
        }
        Object.defineProperty(o, k2, desc);
      }) : (function(o, m, k, k2) {
        if (k2 === void 0) k2 = k;
        o[k2] = m[k];
      }));
      var __exportStar = exports2 && exports2.__exportStar || function(m, exports3) {
        for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports3, p)) __createBinding(exports3, m, p);
      };
      Object.defineProperty(exports2, "__esModule", { value: true });
      __exportStar(require_add(), exports2);
      __exportStar(require_bit_and(), exports2);
      __exportStar(require_bit_not(), exports2);
      __exportStar(require_bit_or(), exports2);
      __exportStar(require_bit_xor(), exports2);
      __exportStar(require_concat(), exports2);
      __exportStar(require_div(), exports2);
      __exportStar(require_divide(), exports2);
      __exportStar(require_minus(), exports2);
      __exportStar(require_mod(), exports2);
      __exportStar(require_multiply(), exports2);
      __exportStar(require_power(), exports2);
      __exportStar(require_table_expression(), exports2);
    }
  });

  // node_modules/@abaplint/runtime/build/src/builtin/line_index.js
  var require_line_index = __commonJS({
    "node_modules/@abaplint/runtime/build/src/builtin/line_index.js"(exports2) {
      "use strict";
      Object.defineProperty(exports2, "__esModule", { value: true });
      exports2.line_index = line_index;
      var is_line_not_found_1 = require_is_line_not_found();
      var operators_1 = require_operators();
      async function line_index(callback) {
        try {
          await callback();
        } catch (error) {
          if ((0, is_line_not_found_1.isLineNotFound)(error)) {
            return abap.IntegerFactory.get(0);
          }
          throw error;
        }
        return abap.IntegerFactory.get(operators_1.foundIndex);
      }
    }
  });

  // node_modules/@abaplint/runtime/build/src/builtin/lines.js
  var require_lines = __commonJS({
    "node_modules/@abaplint/runtime/build/src/builtin/lines.js"(exports2) {
      "use strict";
      Object.defineProperty(exports2, "__esModule", { value: true });
      exports2.lines = lines;
      var types_12 = require_types();
      function lines(input) {
        if (input.val instanceof types_12.FieldSymbol) {
          if (input.val.getPointer() === void 0) {
            throw new Error("GETWA_NOT_ASSIGNED");
          }
          return lines({ val: input.val.getPointer() });
        }
        return new types_12.Integer().set(input.val.getArrayLength());
      }
    }
  });

  // node_modules/@abaplint/runtime/build/src/builtin/match.js
  var require_match = __commonJS({
    "node_modules/@abaplint/runtime/build/src/builtin/match.js"(exports2) {
      "use strict";
      Object.defineProperty(exports2, "__esModule", { value: true });
      exports2.match = match;
      var string_1 = require_string();
      function match(input) {
        const val = typeof input.val === "string" ? input.val : input.val.get();
        let reg = "";
        if (typeof input.regex === "string") {
          reg = input.regex;
        } else {
          reg = input.regex.get();
        }
        const r = new RegExp(reg);
        const res = val.match(r);
        let ret = "";
        if (res && res[0]) {
          ret = res[0];
        }
        return new string_1.String().set(ret);
      }
    }
  });

  // node_modules/@abaplint/runtime/build/src/builtin/matches.js
  var require_matches = __commonJS({
    "node_modules/@abaplint/runtime/build/src/builtin/matches.js"(exports2) {
      "use strict";
      Object.defineProperty(exports2, "__esModule", { value: true });
      exports2.matches = matches2;
      var types_12 = require_types();
      function matches2(input) {
        if (input.pcre === void 0 && input.regex === void 0) {
          throw "matches(), todo";
        }
        const val = typeof input.val === "string" ? input.val : input.val.get();
        let reg = "";
        if (input.regex) {
          if (typeof input.regex === "string") {
            reg = input.regex;
          } else {
            reg = input.regex.get();
          }
        } else if (input.pcre) {
          if (typeof input.pcre === "string") {
            reg = input.pcre;
          } else {
            reg = input.pcre.get();
          }
        }
        const r = new RegExp("^" + reg + "$");
        const res = val.match(r);
        if (res !== null) {
          return new types_12.Character().set("X");
        } else {
          return new types_12.Character().set(" ");
        }
      }
    }
  });

  // node_modules/@abaplint/runtime/build/src/builtin/nmax.js
  var require_nmax = __commonJS({
    "node_modules/@abaplint/runtime/build/src/builtin/nmax.js"(exports2) {
      "use strict";
      Object.defineProperty(exports2, "__esModule", { value: true });
      exports2.nmax = nmax;
      var _parse_1 = require_parse();
      var types_12 = require_types();
      function nmax(input) {
        const values = [];
        values.push((0, _parse_1.parse)(input.val1));
        values.push((0, _parse_1.parse)(input.val2));
        if (input.val3) {
          values.push((0, _parse_1.parse)(input.val3));
        }
        if (input.val4) {
          values.push((0, _parse_1.parse)(input.val4));
        }
        if (input.val5) {
          values.push((0, _parse_1.parse)(input.val5));
        }
        if (input.val6) {
          values.push((0, _parse_1.parse)(input.val6));
        }
        if (input.val7) {
          values.push((0, _parse_1.parse)(input.val7));
        }
        if (input.val8) {
          values.push((0, _parse_1.parse)(input.val8));
        }
        if (input.val9) {
          values.push((0, _parse_1.parse)(input.val9));
        }
        values.sort((a, b) => b - a);
        return new types_12.Float().set(values[0]);
      }
    }
  });

  // node_modules/@abaplint/runtime/build/src/builtin/nmin.js
  var require_nmin = __commonJS({
    "node_modules/@abaplint/runtime/build/src/builtin/nmin.js"(exports2) {
      "use strict";
      Object.defineProperty(exports2, "__esModule", { value: true });
      exports2.nmin = nmin;
      var _parse_1 = require_parse();
      var types_12 = require_types();
      function nmin(input) {
        const values = [];
        values.push((0, _parse_1.parse)(input.val1));
        values.push((0, _parse_1.parse)(input.val2));
        if (input.val3) {
          values.push((0, _parse_1.parse)(input.val3));
        }
        if (input.val4) {
          values.push((0, _parse_1.parse)(input.val4));
        }
        if (input.val5) {
          values.push((0, _parse_1.parse)(input.val5));
        }
        if (input.val6) {
          values.push((0, _parse_1.parse)(input.val6));
        }
        if (input.val7) {
          values.push((0, _parse_1.parse)(input.val7));
        }
        if (input.val8) {
          values.push((0, _parse_1.parse)(input.val8));
        }
        if (input.val9) {
          values.push((0, _parse_1.parse)(input.val9));
        }
        values.sort((a, b) => a - b);
        return new types_12.Float().set(values[0]);
      }
    }
  });

  // node_modules/@abaplint/runtime/build/src/builtin/numofchar.js
  var require_numofchar = __commonJS({
    "node_modules/@abaplint/runtime/build/src/builtin/numofchar.js"(exports2) {
      "use strict";
      Object.defineProperty(exports2, "__esModule", { value: true });
      exports2.numofchar = numofchar;
      var types_12 = require_types();
      function numofchar(input) {
        let str = "";
        if (typeof input.val === "string") {
          str = input.val;
        } else {
          str = input.val.get();
        }
        str = str.trimEnd();
        return new types_12.Integer().set(str.length);
      }
    }
  });

  // node_modules/@abaplint/runtime/build/src/builtin/repeat.js
  var require_repeat = __commonJS({
    "node_modules/@abaplint/runtime/build/src/builtin/repeat.js"(exports2) {
      "use strict";
      Object.defineProperty(exports2, "__esModule", { value: true });
      exports2.repeat = repeat;
      var string_1 = require_string();
      function repeat(input) {
        const val = typeof input.val === "string" ? input.val : input.val.get();
        return new string_1.String().set(val.repeat(input.occ.get()));
      }
    }
  });

  // node_modules/@abaplint/runtime/build/src/builtin/replace.js
  var require_replace2 = __commonJS({
    "node_modules/@abaplint/runtime/build/src/builtin/replace.js"(exports2) {
      "use strict";
      Object.defineProperty(exports2, "__esModule", { value: true });
      exports2.replace = replace;
      var string_1 = require_string();
      var abap_regex_1 = require_abap_regex();
      var types_12 = require_types();
      function replace(input) {
        let val = void 0;
        if (typeof input.val === "string") {
          val = input.val;
        } else if (input.val instanceof types_12.Character) {
          val = input.val.getTrimEnd();
        } else {
          val = input.val.get();
        }
        let wi = void 0;
        if (typeof input.with === "string") {
          wi = input.with;
        } else if (input.with instanceof types_12.Character) {
          wi = input.with.getTrimEnd();
        } else if (input.with) {
          wi = input.with.get();
        }
        let sub = void 0;
        if (typeof input.sub === "string") {
          sub = input.sub;
        } else if (input.sub instanceof types_12.Character) {
          sub = input.sub.getTrimEnd();
        } else if (input.sub) {
          sub = input.sub.get();
        }
        if (sub !== void 0) {
          sub = abap_regex_1.ABAPRegExp.escapeRegExp(sub);
        }
        if (typeof input.regex === "string") {
          sub = new RegExp(abap_regex_1.ABAPRegExp.convert(input.regex), "g");
        } else if (input.regex) {
          sub = new RegExp(abap_regex_1.ABAPRegExp.convert(input.regex.get()), "g");
        }
        if (input.off && input.len && typeof input.val === "string") {
          const offset = input.off.get();
          const length = input.len.get();
          val = val.substring(0, offset) + wi + val.substring(offset + length);
        } else if (input.off && input.len && !(typeof input.val === "string")) {
          const offset = input.off.get();
          const length = input.len.get();
          val = input.val.getOffset({ offset: 0, length: offset }).get() + wi + input.val.getOffset({ offset: offset + length }).get();
        } else if (input.occ === void 0 && sub && wi !== void 0) {
          if (typeof sub === "string") {
            sub = new RegExp(sub);
          }
          val = val.replace(sub, wi);
        } else if (input.occ && input.occ.get() === 0 && sub && wi !== void 0) {
          if (typeof sub === "string") {
            sub = new RegExp(sub, "g");
          }
          val = val.replace(sub, wi);
        }
        return new string_1.String().set(val);
      }
    }
  });

  // node_modules/@abaplint/runtime/build/src/builtin/reverse.js
  var require_reverse = __commonJS({
    "node_modules/@abaplint/runtime/build/src/builtin/reverse.js"(exports2) {
      "use strict";
      Object.defineProperty(exports2, "__esModule", { value: true });
      exports2.reverse = reverse;
      var types_12 = require_types();
      function reverse(input) {
        let val = "";
        if (typeof input.val === "string") {
          val = input.val;
        } else {
          val = input.val.get();
        }
        val = val.split("").reverse().join("");
        return new types_12.String().set(val);
      }
    }
  });

  // node_modules/@abaplint/runtime/build/src/builtin/round.js
  var require_round = __commonJS({
    "node_modules/@abaplint/runtime/build/src/builtin/round.js"(exports2) {
      "use strict";
      Object.defineProperty(exports2, "__esModule", { value: true });
      exports2.round = round;
      var _parse_1 = require_parse();
      var types_12 = require_types();
      function round(input) {
        let mode = input.mode;
        if (mode === void 0) {
          mode = 2;
        } else if (typeof mode !== "number") {
          mode = mode?.get();
        }
        const val = (0, _parse_1.parse)(input.val);
        const dec = (0, _parse_1.parse)(input.dec);
        if (dec !== 0) {
          throw "round(), todo, handle decimals";
        }
        const ret = new types_12.Float();
        switch (mode) {
          case 1:
            ret.set(Math.ceil(val));
            break;
          case 2:
            ret.set(Math.round(val));
            break;
          case 4:
            ret.set(-Math.round(-val));
            break;
          case 5:
            ret.set(Math.trunc(val));
            break;
          case 6:
            ret.set(Math.floor(val));
            break;
          default:
            throw "round(), unknown mode: " + mode;
        }
        return ret;
      }
    }
  });

  // node_modules/@abaplint/runtime/build/src/builtin/segment.js
  var require_segment = __commonJS({
    "node_modules/@abaplint/runtime/build/src/builtin/segment.js"(exports2) {
      "use strict";
      Object.defineProperty(exports2, "__esModule", { value: true });
      exports2.segment = segment;
      var throw_error_1 = require_throw_error();
      var types_12 = require_types();
      function segment(input) {
        let val = input.val;
        if (typeof val !== "string") {
          val = val.get();
        }
        let sep = input.sep;
        if (typeof sep !== "string") {
          sep = sep.get();
        }
        let index = input.index;
        if (typeof index !== "number") {
          index = index.get();
        }
        if (index === 0 || sep.length === 0) {
          (0, throw_error_1.throwError)("CX_SY_STRG_PAR_VAL");
        }
        const array = val.split(sep);
        if (index < 0) {
          array.reverse();
          index = Math.abs(index);
        }
        if (index > array.length) {
          (0, throw_error_1.throwError)("CX_SY_STRG_PAR_VAL");
        }
        return new types_12.String().set(array[index - 1]);
      }
    }
  });

  // node_modules/@abaplint/runtime/build/src/builtin/shift_left.js
  var require_shift_left = __commonJS({
    "node_modules/@abaplint/runtime/build/src/builtin/shift_left.js"(exports2) {
      "use strict";
      Object.defineProperty(exports2, "__esModule", { value: true });
      exports2.shift_left = shift_left;
      var string_1 = require_string();
      var throw_error_1 = require_throw_error();
      function shift_left(input) {
        let val = typeof input.val === "string" ? input.val : input.val.get();
        if (input.sub) {
          const sub = typeof input.sub === "string" ? input.sub : input.sub.get();
          while (val.startsWith(sub)) {
            val = val.substr(sub.length);
          }
        } else if (input.places) {
          let places = typeof input.places === "string" ? input.places : input.places.get();
          if (typeof places === "string") {
            places = parseInt(places, 10);
          }
          if (places > val.length) {
            (0, throw_error_1.throwError)("CX_SY_RANGE_OUT_OF_BOUNDS");
          }
          val = val.substring(places);
        } else if (input.circular) {
          const leftShifts = input.circular.get() % val.length;
          val = val.slice(leftShifts) + val.slice(0, leftShifts);
        } else {
          return shift_left({ val: input.val, sub: " " });
        }
        return new string_1.String().set(val);
      }
    }
  });

  // node_modules/@abaplint/runtime/build/src/builtin/shift_right.js
  var require_shift_right = __commonJS({
    "node_modules/@abaplint/runtime/build/src/builtin/shift_right.js"(exports2) {
      "use strict";
      Object.defineProperty(exports2, "__esModule", { value: true });
      exports2.shift_right = shift_right;
      var string_1 = require_string();
      function shift_right(input) {
        let val = typeof input.val === "string" ? input.val : input.val.get();
        if (input.sub) {
          const sub = typeof input.sub === "string" ? input.sub : input.sub.get();
          while (val.endsWith(sub)) {
            val = val.substr(0, val.length - sub.length);
          }
        } else if (input.places) {
          throw new Error("shift_right todo");
        } else if (input.circular) {
          throw new Error("shift_right todo");
        } else {
          return shift_right({ val: input.val, sub: " " });
        }
        return new string_1.String().set(val);
      }
    }
  });

  // node_modules/@abaplint/runtime/build/src/builtin/sign.js
  var require_sign = __commonJS({
    "node_modules/@abaplint/runtime/build/src/builtin/sign.js"(exports2) {
      "use strict";
      Object.defineProperty(exports2, "__esModule", { value: true });
      exports2.sign = sign;
      function sign(input) {
        let num_in = void 0;
        if (typeof input.val === "number") {
          num_in = input.val;
        } else if (typeof input.val === "string") {
          num_in = parseFloat(input.val);
        } else {
          num_in = parseFloat(input.val.get().toString());
        }
        return Math.sign(num_in);
      }
    }
  });

  // node_modules/@abaplint/runtime/build/src/builtin/sin.js
  var require_sin = __commonJS({
    "node_modules/@abaplint/runtime/build/src/builtin/sin.js"(exports2) {
      "use strict";
      Object.defineProperty(exports2, "__esModule", { value: true });
      exports2.sin = sin;
      var types_12 = require_types();
      function sin(input) {
        let num_in = void 0;
        if (typeof input.val === "number") {
          num_in = input.val;
        } else if (typeof input.val === "string") {
          num_in = parseFloat(input.val);
        } else if (input.val instanceof types_12.Float) {
          num_in = input.val.getRaw();
        } else {
          num_in = parseFloat(input.val.get().toString());
        }
        return Math.sin(num_in);
      }
    }
  });

  // node_modules/@abaplint/runtime/build/src/builtin/sqrt.js
  var require_sqrt = __commonJS({
    "node_modules/@abaplint/runtime/build/src/builtin/sqrt.js"(exports2) {
      "use strict";
      Object.defineProperty(exports2, "__esModule", { value: true });
      exports2.sqrt = sqrt;
      var types_12 = require_types();
      function sqrt(input) {
        let num_in = void 0;
        if (typeof input.val === "number") {
          num_in = input.val;
        } else if (typeof input.val === "string") {
          num_in = parseFloat(input.val);
        } else if (input.val instanceof types_12.Float) {
          num_in = input.val.getRaw();
        } else {
          num_in = parseFloat(input.val.get().toString());
        }
        return Math.sqrt(num_in);
      }
    }
  });

  // node_modules/@abaplint/runtime/build/src/integer_factory.js
  var require_integer_factory = __commonJS({
    "node_modules/@abaplint/runtime/build/src/integer_factory.js"(exports2) {
      "use strict";
      Object.defineProperty(exports2, "__esModule", { value: true });
      exports2.IntegerFactory = void 0;
      var types_12 = require_types();
      var IntegerFactory = class _IntegerFactory {
        static map = {};
        static get(value) {
          if (_IntegerFactory.map[value] === void 0) {
            _IntegerFactory.map[value] = new types_12.Integer().set(value).setConstant();
          }
          return _IntegerFactory.map[value];
        }
      };
      exports2.IntegerFactory = IntegerFactory;
    }
  });

  // node_modules/@abaplint/runtime/build/src/builtin/strlen.js
  var require_strlen = __commonJS({
    "node_modules/@abaplint/runtime/build/src/builtin/strlen.js"(exports2) {
      "use strict";
      Object.defineProperty(exports2, "__esModule", { value: true });
      exports2.strlen = strlen;
      var integer_factory_1 = require_integer_factory();
      var types_12 = require_types();
      function strlen(input) {
        let str = "";
        if (typeof input.val === "string") {
          str = input.val;
        } else if (input.val instanceof types_12.Character) {
          str = input.val.getTrimEnd();
        } else {
          str = input.val.get();
        }
        if (str.length <= 200) {
          return integer_factory_1.IntegerFactory.get(str.length);
        } else {
          return new types_12.Integer().set(str.length);
        }
      }
    }
  });

  // node_modules/@abaplint/runtime/build/src/builtin/substring_after.js
  var require_substring_after = __commonJS({
    "node_modules/@abaplint/runtime/build/src/builtin/substring_after.js"(exports2) {
      "use strict";
      Object.defineProperty(exports2, "__esModule", { value: true });
      exports2.substring_after = substring_after;
      var abap_regex_1 = require_abap_regex();
      var types_12 = require_types();
      var string_1 = require_string();
      function substring_after(input) {
        let val = typeof input.val === "string" ? input.val : input.val.get();
        if (input.val instanceof types_12.Character) {
          val = input.val.getTrimEnd();
        }
        let reg = "";
        if (typeof input.regex === "string") {
          reg = input.regex;
        } else if (typeof input.pcre === "string") {
          reg = input.pcre;
        } else if (input?.regex) {
          reg = input.regex.get();
        } else if (input?.pcre) {
          reg = input.pcre.get();
        } else if (typeof input.sub === "string") {
          reg = abap_regex_1.ABAPRegExp.escapeRegExp(input.sub);
        } else if (input?.sub) {
          reg = abap_regex_1.ABAPRegExp.escapeRegExp(input.sub.get());
        }
        const r = new RegExp(reg + "(.*)");
        const res = val.match(r);
        let ret = "";
        if (res && res[1]) {
          ret = res[1];
        }
        return new string_1.String().set(ret);
      }
    }
  });

  // node_modules/@abaplint/runtime/build/src/builtin/substring_before.js
  var require_substring_before = __commonJS({
    "node_modules/@abaplint/runtime/build/src/builtin/substring_before.js"(exports2) {
      "use strict";
      Object.defineProperty(exports2, "__esModule", { value: true });
      exports2.substring_before = substring_before;
      var abap_regex_1 = require_abap_regex();
      var types_12 = require_types();
      var string_1 = require_string();
      function substring_before(input) {
        let val = "";
        if (typeof input.val === "string") {
          val = input.val;
        } else if (input.val instanceof types_12.Character) {
          val = input.val.getTrimEnd();
        } else {
          val = input.val.get();
        }
        let reg = "";
        if (typeof input.regex === "string") {
          reg = input.regex;
        } else if (input?.regex) {
          reg = input.regex.get();
        } else if (typeof input.sub === "string") {
          reg = abap_regex_1.ABAPRegExp.escapeRegExp(input.sub);
        } else if (input?.sub) {
          reg = abap_regex_1.ABAPRegExp.escapeRegExp(input.sub.get());
        }
        const r = new RegExp("(.*?)" + reg);
        const res = val.match(r);
        let ret = "";
        if (res && res[1]) {
          ret = res[1];
        }
        return new string_1.String().set(ret);
      }
    }
  });

  // node_modules/@abaplint/runtime/build/src/builtin/substring.js
  var require_substring = __commonJS({
    "node_modules/@abaplint/runtime/build/src/builtin/substring.js"(exports2) {
      "use strict";
      Object.defineProperty(exports2, "__esModule", { value: true });
      exports2.substring = substring;
      var string_1 = require_string();
      var throw_error_1 = require_throw_error();
      function substring(input) {
        let off = input?.off?.get();
        if (off === void 0) {
          off = 0;
        } else if (off < 0) {
          (0, throw_error_1.throwError)("CX_SY_RANGE_OUT_OF_BOUNDS");
        }
        const len = input?.len?.get();
        if (len && len < 0) {
          (0, throw_error_1.throwError)("CX_SY_RANGE_OUT_OF_BOUNDS");
        }
        if (typeof input.val === "string") {
          return new string_1.String().set(input.val.substr(off, len));
        } else {
          return input.val.getOffset({ offset: off, length: len });
        }
      }
    }
  });

  // node_modules/@abaplint/runtime/build/src/builtin/sy.js
  var require_sy = __commonJS({
    "node_modules/@abaplint/runtime/build/src/builtin/sy.js"(exports2) {
      "use strict";
      Object.defineProperty(exports2, "__esModule", { value: true });
      exports2.sy = void 0;
      var types_12 = require_types();
      exports2.sy = new types_12.Structure({
        abcde: new types_12.Character(26).set("ABCDEFGHIJKLMNOPQRSTUVWXYZ"),
        datlo: new types_12.Date(),
        datum: new types_12.Date(),
        dbcnt: new types_12.Integer(),
        fdpos: new types_12.Integer(),
        host: new types_12.Character(32).set("localhost"),
        index: new types_12.Integer(),
        langu: new types_12.Character(1).set("E"),
        mandt: new types_12.Character(3).set("123"),
        msgid: new types_12.Character(20),
        msgno: new types_12.Numc({ length: 3 }),
        msgty: new types_12.Character(1),
        msgv1: new types_12.Character(50),
        msgv2: new types_12.Character(50),
        msgv3: new types_12.Character(50),
        msgv4: new types_12.Character(50),
        subrc: new types_12.Integer(),
        sysid: new types_12.Character(3).set("ABC"),
        tabix: new types_12.Integer(),
        tfill: new types_12.Integer(),
        timlo: new types_12.Time(),
        tzone: new types_12.Integer(),
        // 0 = UTC
        uname: new types_12.Character(12).set("USERNAME"),
        uzeit: new types_12.Time(),
        dbsys: new types_12.Character(10),
        batch: new types_12.Character(1),
        saprl: new types_12.Character(4).set("OPEN"),
        cprog: new types_12.Character(40).set("OPEN_ABAP_TODO"),
        tcode: new types_12.Character(20).set("OPEN_ABAP_TODO")
      });
    }
  });

  // node_modules/@abaplint/runtime/build/src/builtin/tan.js
  var require_tan = __commonJS({
    "node_modules/@abaplint/runtime/build/src/builtin/tan.js"(exports2) {
      "use strict";
      Object.defineProperty(exports2, "__esModule", { value: true });
      exports2.tan = tan;
      var types_12 = require_types();
      function tan(input) {
        let num_in = void 0;
        if (typeof input.val === "number") {
          num_in = input.val;
        } else if (typeof input.val === "string") {
          num_in = parseFloat(input.val);
        } else if (input.val instanceof types_12.Float) {
          num_in = input.val.getRaw();
        } else {
          num_in = parseFloat(input.val.get().toString());
        }
        return Math.tan(num_in);
      }
    }
  });

  // node_modules/@abaplint/runtime/build/src/builtin/to_lower.js
  var require_to_lower = __commonJS({
    "node_modules/@abaplint/runtime/build/src/builtin/to_lower.js"(exports2) {
      "use strict";
      Object.defineProperty(exports2, "__esModule", { value: true });
      exports2.to_lower = to_lower;
      var types_12 = require_types();
      function to_lower(input) {
        const val = typeof input.val === "string" ? input.val : input.val.get();
        if (input.val instanceof types_12.Character) {
          return new types_12.Character(input.val.getLength()).set(val.toLowerCase());
        } else {
          return new types_12.String().set(val.toLowerCase());
        }
      }
    }
  });

  // node_modules/@abaplint/runtime/build/src/builtin/to_mixed.js
  var require_to_mixed = __commonJS({
    "node_modules/@abaplint/runtime/build/src/builtin/to_mixed.js"(exports2) {
      "use strict";
      Object.defineProperty(exports2, "__esModule", { value: true });
      exports2.to_mixed = to_mixed;
      var throw_error_1 = require_throw_error();
      var types_12 = require_types();
      function to_mixed(input) {
        let sep = input.sep;
        if (sep === void 0) {
          sep = "_";
        }
        if (typeof sep !== "string") {
          sep = sep.get();
        }
        if (sep.length === 0) {
          (0, throw_error_1.throwError)("CX_SY_STRG_PAR_VAL");
        }
        const min = 1;
        if (min < 0) {
          (0, throw_error_1.throwError)("CX_SY_STRG_PAR_VAL");
        }
        let val = input.val;
        if (typeof val !== "string") {
          val = val.get();
        }
        val = val.substring(0, min) + val.substring(min).toLowerCase();
        if (input.case) {
          if (typeof input.case === "string") {
            if (input.case === input.case.toLowerCase()) {
              val = val.substring(0, 1).toLowerCase() + val.substring(1);
            }
          } else {
            if (input.case.get() === input.case.get().toLowerCase()) {
              val = val.substring(0, 1).toLowerCase() + val.substring(1);
            }
          }
        }
        const length = sep.length;
        const regex = new RegExp(sep + "\\w");
        while (val.match(regex)) {
          val = val.replace(regex, (x) => {
            return x.substring(length).toUpperCase();
          });
        }
        return new types_12.String().set(val);
      }
    }
  });

  // node_modules/@abaplint/runtime/build/src/builtin/to_upper.js
  var require_to_upper = __commonJS({
    "node_modules/@abaplint/runtime/build/src/builtin/to_upper.js"(exports2) {
      "use strict";
      Object.defineProperty(exports2, "__esModule", { value: true });
      exports2.to_upper = to_upper;
      var types_12 = require_types();
      function to_upper(input) {
        const val = typeof input.val === "string" ? input.val : input.val.get();
        if (input.val instanceof types_12.Character) {
          return new types_12.Character(input.val.getLength()).set(val.toUpperCase());
        } else {
          return new types_12.String().set(val.toUpperCase());
        }
      }
    }
  });

  // node_modules/@abaplint/runtime/build/src/builtin/translate.js
  var require_translate2 = __commonJS({
    "node_modules/@abaplint/runtime/build/src/builtin/translate.js"(exports2) {
      "use strict";
      Object.defineProperty(exports2, "__esModule", { value: true });
      exports2.translate = translate;
      var types_12 = require_types();
      var string_1 = require_string();
      function translate(input) {
        let val = typeof input.val === "string" ? input.val : input.val.get();
        const from = typeof input.from === "string" ? input.from : input.from.get();
        let to = typeof input.to === "string" ? input.to : input.to.get();
        if (input.to instanceof types_12.Character) {
          to = input.to.getTrimEnd();
        }
        const fromSplit = from.split("");
        const toSplit = to.split("");
        const chars = {};
        for (let i2 = 0; i2 < fromSplit.length; i2++) {
          chars[fromSplit[i2]] = toSplit[i2] || "";
        }
        const reg = new RegExp("[" + from + "]", "g");
        val = val.replace(reg, (m) => chars[m] || "");
        return new string_1.String().set(val);
      }
    }
  });

  // node_modules/@abaplint/runtime/build/src/builtin/trunc.js
  var require_trunc = __commonJS({
    "node_modules/@abaplint/runtime/build/src/builtin/trunc.js"(exports2) {
      "use strict";
      Object.defineProperty(exports2, "__esModule", { value: true });
      exports2.trunc = trunc;
      var types_12 = require_types();
      function trunc(input) {
        let num_in = void 0;
        if (typeof input.val === "number") {
          num_in = input.val;
        } else if (typeof input.val === "string") {
          num_in = parseFloat(input.val);
        } else if (input.val instanceof types_12.Float) {
          num_in = input.val.getRaw();
        } else {
          num_in = parseFloat(input.val.get().toString());
        }
        return Math.trunc(num_in);
      }
    }
  });

  // node_modules/@abaplint/runtime/build/src/builtin/xsdbool.js
  var require_xsdbool = __commonJS({
    "node_modules/@abaplint/runtime/build/src/builtin/xsdbool.js"(exports2) {
      "use strict";
      Object.defineProperty(exports2, "__esModule", { value: true });
      exports2.xsdbool = xsdbool;
      var types_12 = require_types();
      function xsdbool(input) {
        if (input === true) {
          return abap.builtin.abap_true;
        } else if (input === false || input === void 0) {
          return abap.builtin.abap_false;
        } else if (input.val instanceof types_12.String && input.val.get().trim() === "") {
          return abap.builtin.abap_false;
        } else if (input.val instanceof types_12.Character && input.val.get().trim() === "") {
          return abap.builtin.abap_false;
        } else {
          return abap.builtin.abap_true;
        }
      }
    }
  });

  // node_modules/@abaplint/runtime/build/src/builtin/xstrlen.js
  var require_xstrlen = __commonJS({
    "node_modules/@abaplint/runtime/build/src/builtin/xstrlen.js"(exports2) {
      "use strict";
      Object.defineProperty(exports2, "__esModule", { value: true });
      exports2.xstrlen = xstrlen;
      var types_12 = require_types();
      function xstrlen(input) {
        if (typeof input.val === "string") {
          return new types_12.Integer().set(input.val.length / 2);
        } else {
          return new types_12.Integer().set(input.val.get().length / 2);
        }
      }
    }
  });

  // node_modules/@abaplint/runtime/build/src/builtin/index.js
  var require_builtin = __commonJS({
    "node_modules/@abaplint/runtime/build/src/builtin/index.js"(exports2) {
      "use strict";
      var __createBinding = exports2 && exports2.__createBinding || (Object.create ? (function(o, m, k, k2) {
        if (k2 === void 0) k2 = k;
        var desc = Object.getOwnPropertyDescriptor(m, k);
        if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
          desc = { enumerable: true, get: function() {
            return m[k];
          } };
        }
        Object.defineProperty(o, k2, desc);
      }) : (function(o, m, k, k2) {
        if (k2 === void 0) k2 = k;
        o[k2] = m[k];
      }));
      var __exportStar = exports2 && exports2.__exportStar || function(m, exports3) {
        for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports3, p)) __createBinding(exports3, m, p);
      };
      Object.defineProperty(exports2, "__esModule", { value: true });
      exports2.$_vertical_tab = exports2.$_newline = exports2.$_horizontal_tab = exports2.$_formfeed = exports2.$_cr_lf = exports2.$_backspace = exports2.space = exports2.abap_undefined = exports2.abap_false = exports2.abap_true = void 0;
      var types_12 = require_types();
      __exportStar(require_abs(), exports2);
      __exportStar(require_boolc(), exports2);
      __exportStar(require_ceil(), exports2);
      __exportStar(require_concat_lines_of(), exports2);
      __exportStar(require_condense2(), exports2);
      __exportStar(require_contains(), exports2);
      __exportStar(require_cos(), exports2);
      __exportStar(require_count_any_of(), exports2);
      __exportStar(require_count(), exports2);
      __exportStar(require_escape(), exports2);
      __exportStar(require_find2(), exports2);
      __exportStar(require_floor(), exports2);
      __exportStar(require_frac(), exports2);
      __exportStar(require_from_mixed(), exports2);
      __exportStar(require_insert(), exports2);
      __exportStar(require_ipow(), exports2);
      __exportStar(require_line_exists(), exports2);
      __exportStar(require_line_index(), exports2);
      __exportStar(require_lines(), exports2);
      __exportStar(require_match(), exports2);
      __exportStar(require_matches(), exports2);
      __exportStar(require_nmax(), exports2);
      __exportStar(require_nmin(), exports2);
      __exportStar(require_numofchar(), exports2);
      __exportStar(require_repeat(), exports2);
      __exportStar(require_replace2(), exports2);
      __exportStar(require_reverse(), exports2);
      __exportStar(require_round(), exports2);
      __exportStar(require_segment(), exports2);
      __exportStar(require_shift_left(), exports2);
      __exportStar(require_shift_right(), exports2);
      __exportStar(require_sign(), exports2);
      __exportStar(require_sin(), exports2);
      __exportStar(require_sqrt(), exports2);
      __exportStar(require_strlen(), exports2);
      __exportStar(require_substring_after(), exports2);
      __exportStar(require_substring_before(), exports2);
      __exportStar(require_substring(), exports2);
      __exportStar(require_sy(), exports2);
      __exportStar(require_tan(), exports2);
      __exportStar(require_to_lower(), exports2);
      __exportStar(require_to_mixed(), exports2);
      __exportStar(require_to_upper(), exports2);
      __exportStar(require_translate2(), exports2);
      __exportStar(require_trunc(), exports2);
      __exportStar(require_xsdbool(), exports2);
      __exportStar(require_xstrlen(), exports2);
      exports2.abap_true = new types_12.Character(1, { qualifiedName: "ABAP_BOOL", ddicName: "ABAP_BOOL" }).set("X").setConstant();
      exports2.abap_false = new types_12.Character(1, { qualifiedName: "ABAP_BOOL", ddicName: "ABAP_BOOL" }).set("").setConstant();
      exports2.abap_undefined = new types_12.Character(1, { qualifiedName: "ABAP_BOOL", ddicName: "ABAP_BOOL" }).set("-").setConstant();
      exports2.space = new types_12.Character(1, { qualifiedName: "ABAP_BOOL", ddicName: "ABAP_BOOL" }).set(" ").setConstant();
      exports2.$_backspace = new types_12.Character(1).set("\b").setConstant();
      exports2.$_cr_lf = new types_12.Character(2).set("\r\n").setConstant();
      exports2.$_formfeed = new types_12.Character(1).set("\f").setConstant();
      exports2.$_horizontal_tab = new types_12.Character(1).set("	").setConstant();
      exports2.$_newline = new types_12.Character(1).set("\n").setConstant();
      exports2.$_vertical_tab = new types_12.Character(1).set("\v").setConstant();
    }
  });

  // node_modules/@abaplint/runtime/build/src/db/db.js
  var require_db = __commonJS({
    "node_modules/@abaplint/runtime/build/src/db/db.js"(exports2) {
      "use strict";
      Object.defineProperty(exports2, "__esModule", { value: true });
    }
  });

  // node_modules/@abaplint/runtime/build/src/rfc.js
  var require_rfc = __commonJS({
    "node_modules/@abaplint/runtime/build/src/rfc.js"(exports2) {
      "use strict";
      Object.defineProperty(exports2, "__esModule", { value: true });
    }
  });

  // node_modules/@abaplint/runtime/build/src/expand_in.js
  var require_expand_in = __commonJS({
    "node_modules/@abaplint/runtime/build/src/expand_in.js"(exports2) {
      "use strict";
      Object.defineProperty(exports2, "__esModule", { value: true });
      exports2.expandIN = expandIN;
      function expandIN(fieldName, table) {
        let ret = "";
        if (table.array().length === 0) {
          ret = `true`;
        } else {
          ret = `(`;
          const values = [];
          fieldName = fieldName.replace("~", `"."`);
          for (const row of table.array()) {
            const val = `'` + row.get().low?.get().replace(/'/g, "''") + "'";
            if (row.get().sign?.get() === "I" && row.get().option?.get() === "EQ") {
              values.push(`"${fieldName}" = ` + val);
            } else if (row.get().sign?.get() === "I" && row.get().option?.get() === "NE") {
              values.push(`"${fieldName}" <> ` + val);
            } else if (row.get().sign?.get() === "I" && row.get().option?.get() === "GE") {
              values.push(`"${fieldName}" >= ` + val);
            } else if (row.get().sign?.get() === "I" && row.get().option?.get() === "LE") {
              values.push(`"${fieldName}" <= ` + val);
            } else if (row.get().sign?.get() === "I" && row.get().option?.get() === "CP") {
              values.push(`"${fieldName}" LIKE '` + row.get().low?.get().trimEnd().replace(/'/g, "''").replace(/\*/g, "%") + "'");
            } else {
              throw new Error(`IN, ${row.get().sign?.get()} ${row.get().option?.get()} not supported`);
            }
          }
          ret += values.join(" OR ") + ")";
        }
        return ret;
      }
    }
  });

  // node_modules/@abaplint/runtime/build/src/expand_dynamic.js
  var require_expand_dynamic = __commonJS({
    "node_modules/@abaplint/runtime/build/src/expand_dynamic.js"(exports2) {
      "use strict";
      Object.defineProperty(exports2, "__esModule", { value: true });
      exports2.expandDynamic = expandDynamic;
      var expand_in_1 = require_expand_in();
      var types_12 = require_types();
      function expandDynamic(code, evaluate2) {
        if (code === "") {
          return "1 = 1";
        } else {
          code = code.replace(/ EQ /g, " = ");
          let regex = /(\w+) IN @?<(\w+)>-(\w+)/;
          while (true) {
            const match = code.match(regex);
            if (match && match[1] && match[2] && match[3]) {
              let name = "fs_" + match[2] + "_";
              name = name.toLowerCase();
              let found = evaluate2(name);
              if (found instanceof types_12.FieldSymbol) {
                found = found.get()[match[3].toLowerCase()];
                if (found === void 0) {
                  throw new Error(`expandDynamic: Field symbol ${name} does not have field ${match[2]}`);
                }
                code = code.replace(regex, (0, expand_in_1.expandIN)(match[1].toLowerCase(), found));
              }
            } else {
              break;
            }
          }
          regex = / @?<(\w+)>-(\w+)/;
          while (true) {
            const match = code.match(regex);
            if (match && match[1] && match[2]) {
              let name = "fs_" + match[1] + "_";
              name = name.toLowerCase();
              let found = evaluate2(name);
              if (found instanceof types_12.FieldSymbol) {
                found = found.get()[match[2].toLowerCase()];
                if (found === void 0) {
                  throw new Error(`expandDynamic: Field symbol ${name} does not have field ${match[2]}`);
                }
                code = code.replace(regex, " '" + found.get() + "'");
              }
            } else {
              break;
            }
          }
          regex = / @?<(\w+)>/;
          while (true) {
            const match = code.match(regex);
            if (match && match[1]) {
              let name = "fs_" + match[1] + "_";
              name = name.toLowerCase();
              const found = evaluate2(name);
              if (found instanceof types_12.FieldSymbol) {
                code = code.replace(regex, " '" + found.get() + "'");
              }
            } else {
              break;
            }
          }
          return code;
        }
      }
    }
  });

  // node_modules/@abaplint/runtime/build/src/classic_error.js
  var require_classic_error = __commonJS({
    "node_modules/@abaplint/runtime/build/src/classic_error.js"(exports2) {
      "use strict";
      Object.defineProperty(exports2, "__esModule", { value: true });
      exports2.ClassicError = void 0;
      var ClassicError = class extends Error {
        classic;
        constructor(input) {
          super();
          this.classic = input.classic;
        }
      };
      exports2.ClassicError = ClassicError;
    }
  });

  // node_modules/@abaplint/runtime/build/src/console/standard_out_console.js
  var require_standard_out_console = __commonJS({
    "node_modules/@abaplint/runtime/build/src/console/standard_out_console.js"(exports2) {
      "use strict";
      Object.defineProperty(exports2, "__esModule", { value: true });
      exports2.StandardOutConsole = void 0;
      var StandardOutConsole = class {
        empty = true;
        clear() {
          throw new Error("transpiler runtime: not supported for stdio console");
        }
        add(data) {
          process.stdout.write(data);
          this.empty = false;
        }
        get() {
          return "";
        }
        isEmpty() {
          return this.empty;
        }
        getTrimmed() {
          throw new Error("transpiler runtime: not supported for stdio console");
        }
      };
      exports2.StandardOutConsole = StandardOutConsole;
    }
  });

  // node_modules/@abaplint/runtime/build/src/console/memory_console.js
  var require_memory_console = __commonJS({
    "node_modules/@abaplint/runtime/build/src/console/memory_console.js"(exports2) {
      "use strict";
      Object.defineProperty(exports2, "__esModule", { value: true });
      exports2.MemoryConsole = void 0;
      var MemoryConsole = class {
        data = "";
        clear() {
          this.data = "";
        }
        add(data) {
          this.data = this.data + data;
        }
        get() {
          return this.data;
        }
        isEmpty() {
          return this.data === "";
        }
        getTrimmed() {
          return this.data.split("\n").map((a) => a.trimEnd()).join("\n");
        }
      };
      exports2.MemoryConsole = MemoryConsole;
    }
  });

  // node_modules/@abaplint/runtime/build/src/dynamic_call_lookup.js
  var require_dynamic_call_lookup = __commonJS({
    "node_modules/@abaplint/runtime/build/src/dynamic_call_lookup.js"(exports2) {
      "use strict";
      Object.defineProperty(exports2, "__esModule", { value: true });
      exports2.dynamicCallLookup = dynamicCallLookup;
      var throw_error_1 = require_throw_error();
      function dynamicCallLookup(obj, methodName) {
        let name = typeof methodName === "string" ? methodName : methodName.get().toLowerCase().trimEnd();
        name = name.replaceAll("~", "$").replaceAll("/", "$");
        let ret = obj[name];
        if (ret !== void 0) {
          ret = ret.bind(obj);
        } else if (obj.FRIENDS_ACCESS_INSTANCE !== void 0) {
          ret = obj.FRIENDS_ACCESS_INSTANCE[name];
        }
        if (ret === void 0) {
          (0, throw_error_1.throwError)("CX_SY_DYN_CALL_ILLEGAL_METHOD");
        }
        return ret;
      }
    }
  });

  // node_modules/@abaplint/runtime/build/src/character_factory.js
  var require_character_factory = __commonJS({
    "node_modules/@abaplint/runtime/build/src/character_factory.js"(exports2) {
      "use strict";
      Object.defineProperty(exports2, "__esModule", { value: true });
      exports2.CharacterFactory = void 0;
      var types_12 = require_types();
      var CharacterFactory = class _CharacterFactory {
        static map = {};
        static get(length, value) {
          if (_CharacterFactory.map[value] === void 0) {
            _CharacterFactory.map[value] = new types_12.Character(length).set(value).setConstant();
          }
          return _CharacterFactory.map[value];
        }
      };
      exports2.CharacterFactory = CharacterFactory;
    }
  });

  // node_modules/@abaplint/runtime/build/src/abap_eventing.js
  var require_abap_eventing = __commonJS({
    "node_modules/@abaplint/runtime/build/src/abap_eventing.js"(exports2) {
      "use strict";
      Object.defineProperty(exports2, "__esModule", { value: true });
      exports2.ABAPEventing = void 0;
      var ABAPEventing = class {
        registrations = {};
        setHandler(event, methods, forObject, activation) {
          if (methods.length === 0) {
            throw new Error("ABAPEventing.setHandler: no methods provided");
          }
          if (!this.registrations[event.EVENT_CLASS]) {
            this.registrations[event.EVENT_CLASS] = {};
          }
          if (!this.registrations[event.EVENT_CLASS][event.EVENT_NAME]) {
            this.registrations[event.EVENT_CLASS][event.EVENT_NAME] = [];
          }
          const ref = forObject === "ALL" ? "ALL" : new WeakRef(forObject);
          const handlers = this.registrations[event.EVENT_CLASS][event.EVENT_NAME];
          if (activation === true) {
            handlers.push({
              handlers: methods,
              forObject: ref
            });
          } else {
            if (methods.length > 1) {
              throw new Error("ABAPEventing.setHandler: deactivation of multiple methods not supported, todo");
            }
            const index = handlers.findIndex((handler) => handler.forObject === ref && handler.handlers[0].toString() === methods[0].toString());
            if (index !== -1) {
              handlers.splice(index, 1);
            }
          }
        }
        // todo: cleanup of dead WeakRefs
        async raiseEvent(event, me, parameters) {
          const handlers = this.registrations[event.EVENT_CLASS]?.[event.EVENT_NAME];
          if (handlers === void 0) {
            return;
          }
          for (const handler of handlers) {
            if (handler.forObject === "ALL") {
              for (const method of handler.handlers) {
                await method(parameters);
              }
            } else if (handler.forObject.deref() === me) {
              for (const method of handler.handlers) {
                await method(parameters);
              }
            }
          }
        }
      };
      exports2.ABAPEventing = ABAPEventing;
    }
  });

  // node_modules/@abaplint/runtime/build/src/parameters_call.js
  var require_parameters_call = __commonJS({
    "node_modules/@abaplint/runtime/build/src/parameters_call.js"(exports2) {
      "use strict";
      Object.defineProperty(exports2, "__esModule", { value: true });
      exports2.parametersCall = parametersCall;
      async function parametersCall(method, parameters) {
        const input = {};
        let receiving = void 0;
        for (const v of parameters.array()) {
          const kind = v.get().kind.get();
          if (kind === "") {
            throw new Error("open-abap currently requires KIND to be set in PARAMETER-TABLE calls");
          } else if (kind === "R") {
            receiving = v.get().value;
            continue;
          }
          const name = v.get().name.get().toLowerCase().trimEnd();
          const value = v.get().value.dereference();
          input[name] = value;
        }
        const res = await method(input);
        if (res !== void 0) {
          receiving?.set(res);
        }
      }
    }
  });

  // node_modules/@abaplint/runtime/build/src/index.js
  var require_index = __commonJS({
    "node_modules/@abaplint/runtime/build/src/index.js"(exports2) {
      Object.defineProperty(exports2, "__esModule", { value: true });
      exports2.ABAP = exports2.MemoryConsole = exports2.DB = exports2.types = exports2.RFC = void 0;
      var context_1 = require_context();
      var offset_length_1 = require_offset_length();
      var statements_1 = require_statements();
      var template_formatting_1 = require_template_formatting();
      var builtin = require_builtin();
      var compare = require_compare();
      var DB = require_db();
      exports2.DB = DB;
      var operators = require_operators();
      var RFC = require_rfc();
      exports2.RFC = RFC;
      var types = require_types();
      exports2.types = types;
      var expand_in_1 = require_expand_in();
      var expand_dynamic_1 = require_expand_dynamic();
      var classic_error_1 = require_classic_error();
      var standard_out_console_1 = require_standard_out_console();
      var memory_console_1 = require_memory_console();
      Object.defineProperty(exports2, "MemoryConsole", { enumerable: true, get: function() {
        return memory_console_1.MemoryConsole;
      } });
      var prefix_1 = require_prefix();
      var integer_factory_1 = require_integer_factory();
      var dynamic_call_lookup_1 = require_dynamic_call_lookup();
      var character_factory_1 = require_character_factory();
      var abap_eventing_1 = require_abap_eventing();
      var is_line_not_found_1 = require_is_line_not_found();
      var parameters_call_1 = require_parameters_call();
      var alpha_1 = require_alpha();
      var ABAP = class {
        // global objects
        Classes = {};
        Forms = {};
        DDIC = {};
        FunctionModules = {};
        Interfaces = {};
        MSAG = {};
        OA2P = {};
        SMIM = {};
        TypePools = {};
        W3MI = {};
        internalIdCounter = 1;
        // stuff for runtime
        statements;
        types = types;
        builtin = builtin;
        operators = operators;
        compare = compare;
        console;
        OffsetLength = offset_length_1.OffsetLength;
        templateFormatting = template_formatting_1.templateFormatting;
        expandIN = expand_in_1.expandIN;
        expandDynamic = expand_dynamic_1.expandDynamic;
        isLineNotFound = is_line_not_found_1.isLineNotFound;
        buildDbTableName = prefix_1.buildDbTableName;
        ClassicError = classic_error_1.ClassicError;
        dynamicCallLookup = dynamic_call_lookup_1.dynamicCallLookup;
        parametersCall = parameters_call_1.parametersCall;
        eventing = new abap_eventing_1.ABAPEventing();
        alphaOut = alpha_1.alphaOut;
        alphaIn = alpha_1.alphaIn;
        IntegerFactory = integer_factory_1.IntegerFactory;
        CharacterFactory = character_factory_1.CharacterFactory;
        context;
        dbo;
        constructor(input) {
          this.context = new context_1.Context();
          this.console = input?.console ? input?.console : new standard_out_console_1.StandardOutConsole();
          this.context.console = this.console;
          this.dbo = input?.database || { schemaPrefix: "", tablePrefix: "" };
          if (this.dbo.schemaPrefix === void 0) {
            this.dbo.schemaPrefix = "";
          }
          if (this.dbo.tablePrefix === void 0) {
            this.dbo.tablePrefix = "";
          }
          this.statements = new statements_1.Statements(this.context);
          builtin.sy.get().subrc.set(0);
          builtin.sy.get().tabix.set(0);
          builtin.sy.get().index.set(0);
          this.statements.getTime({ sy: builtin.sy });
        }
      };
      exports2.ABAP = ABAP;
    }
  });
  return require_index();
})();
