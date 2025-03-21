"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
var fs = require("fs");
var path = require("path");
var LC3Module = /** @class */ (function () {
    function LC3Module(instance, frame_duration_us, sample_rate_hz) {
        this.memory_map = [];
        this.instance = instance;
        this.frame_duration_us = frame_duration_us;
        this.sample_rate_hz = sample_rate_hz;
        this.frame_samples = this.instance.exports.lc3_frame_samples(frame_duration_us, sample_rate_hz);
        var decoder_size = this.instance.exports.lc3_decoder_size(frame_duration_us, sample_rate_hz);
        this.allocation_size = decoder_size + (this.frame_samples * 4);
        this.allocation_size = Math.ceil(this.allocation_size / 4) * 4;
    }
    LC3Module.prototype.create = function () {
        var _this = this;
        var memory = this.instance.exports.memory;
        var base_ptr = memory.buffer.byteLength;
        var pages_needed = Math.ceil((base_ptr + this.allocation_size) / (64 * 1024));
        var current_pages = memory.buffer.byteLength / (64 * 1024);
        if (pages_needed > current_pages) {
            memory.grow(pages_needed - current_pages);
        }
        var decoder_ptr = base_ptr;
        var sample_ptr = decoder_ptr + this.allocation_size - (this.frame_samples * 4);
        this.instance.exports.lc3_setup_decoder(this.frame_duration_us, this.sample_rate_hz, this.sample_rate_hz, decoder_ptr);
        var instance = {
            samples: new Float32Array(memory.buffer, sample_ptr, this.frame_samples),
            frame: new Uint8Array(memory.buffer, decoder_ptr, 20),
            decode: function () {
                _this.instance.exports.lc3_decode(decoder_ptr, decoder_ptr, 20, 0, sample_ptr, 1);
            }
        };
        this.memory_map.push(instance);
        return instance;
    };
    return LC3Module;
}());
function decodeLC3(inputPath_1, outputPath_1) {
    return __awaiter(this, arguments, void 0, function (inputPath, outputPath, repetitions) {
        var wasmBuffer, wasmModule, lc3, decoder, inputData, numFrames, writeStream, startTime, rep, i, pcmBuffer, j, elapsedTime, seconds;
        if (repetitions === void 0) { repetitions = 10; }
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, fs.promises.readFile(path.resolve(__dirname, "../bin/liblc3.wasm"))];
                case 1:
                    wasmBuffer = _a.sent();
                    return [4 /*yield*/, WebAssembly.instantiate(wasmBuffer, {})];
                case 2:
                    wasmModule = _a.sent();
                    lc3 = new LC3Module(wasmModule.instance, 10000, 16000);
                    decoder = lc3.create();
                    return [4 /*yield*/, fs.promises.readFile(inputPath)];
                case 3:
                    inputData = _a.sent();
                    numFrames = Math.floor(inputData.length / 20);
                    writeStream = fs.createWriteStream(outputPath);
                    console.log("Processing ".concat(repetitions, " repetitions of ").concat(numFrames, " frames each..."));
                    startTime = process.hrtime();
                    for (rep = 0; rep < repetitions; rep++) {
                        for (i = 0; i < numFrames; i++) {
                            decoder.frame.set(inputData.subarray(i * 20, (i + 1) * 20));
                            decoder.decode();
                            pcmBuffer = Buffer.alloc(decoder.samples.length * 2);
                            for (j = 0; j < decoder.samples.length; j++) {
                                pcmBuffer.writeInt16LE(Math.max(-32768, Math.min(32767, Math.floor(decoder.samples[j] * 32768))), j * 2);
                            }
                            writeStream.write(pcmBuffer);
                        }
                        // Log progress
                        if ((rep + 1) % 2 === 0) {
                            elapsedTime = process.hrtime(startTime);
                            seconds = elapsedTime[0] + elapsedTime[1] / 1e9;
                            console.log("Completed ".concat(rep + 1, "/").concat(repetitions, " repetitions (").concat((seconds).toFixed(2), "s)"));
                        }
                    }
                    writeStream.end();
                    return [2 /*return*/];
            }
        });
    });
}
// Main execution
if (process.argv.length < 4) {
    console.error('Usage: node decode.js <input.lc3> <output.pcm> [repetitions]');
    process.exit(1);
}
var repetitions = process.argv.length >= 5 ? parseInt(process.argv[4]) : 10;
decodeLC3(process.argv[2], process.argv[3], repetitions)
    .then(function () {
    console.log('Decoding complete!');
})
    .catch(console.error);
