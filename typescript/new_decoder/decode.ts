import * as fs from "fs";
import * as path from "path";

interface LC3Instance {
  samples: Float32Array;
  frame: Uint8Array;
  decode(): void;
}

class LC3Module {
  private instance: WebAssembly.Instance;
  private frame_duration_us: number;
  private sample_rate_hz: number;
  private frame_samples: number;
  private decoder_size: number;
  private frame_bytes: number;
  private allocation_size: number;
  private memory_map: LC3Instance[] = [];

  constructor(instance: WebAssembly.Instance, frame_duration_us: number, sample_rate_hz: number) {
    this.instance = instance;
    this.frame_duration_us = frame_duration_us;
    this.sample_rate_hz = sample_rate_hz;

    // Calculate sizes
    this.frame_samples = (this.instance.exports.lc3_frame_samples as Function)(
      frame_duration_us,
      sample_rate_hz
    );

    this.decoder_size = (this.instance.exports.lc3_decoder_size as Function)(
      frame_duration_us,
      sample_rate_hz
    );

    this.frame_bytes = 20;  // Fixed for our case

    // Calculate total memory needed: decoder + samples + frame buffer
    this.allocation_size = this.decoder_size + 
                          (this.frame_samples * 4) + // Float32 samples
                          this.frame_bytes;          // frame buffer
    
    // Align to 4 bytes
    this.allocation_size = Math.ceil(this.allocation_size / 4) * 4;
  }

  create(): LC3Instance {
    const memory = this.instance.exports.memory as WebAssembly.Memory;
    const base_ptr = memory.buffer.byteLength;
    
    // Ensure we have enough memory
    const pages_needed = Math.ceil((base_ptr + this.allocation_size) / (64 * 1024));
    const current_pages = memory.buffer.byteLength / (64 * 1024);
    
    if (pages_needed > current_pages) {
      memory.grow(pages_needed - current_pages);
    }

    // Layout memory regions
    const decoder_ptr = base_ptr;
    const sample_ptr = decoder_ptr + this.decoder_size;
    const frame_ptr = sample_ptr + (this.frame_samples * 4);

    // Initialize decoder
    (this.instance.exports.lc3_setup_decoder as Function)(
      this.frame_duration_us,
      this.sample_rate_hz,
      this.sample_rate_hz,
      decoder_ptr
    );

    const instance: LC3Instance = {
      samples: new Float32Array(memory.buffer, sample_ptr, this.frame_samples),
      frame: new Uint8Array(memory.buffer, frame_ptr, this.frame_bytes),
      decode: () => {
        (this.instance.exports.lc3_decode as Function)(
          decoder_ptr,
          frame_ptr,
          this.frame_bytes,
          3,  // Changed to float format (3) to match web version
          sample_ptr,
          1
        );
      }
    };

    this.memory_map.push(instance);
    return instance;
  }

  // Get frame duration in seconds
  getFrameDurationSeconds(): number {
    return this.frame_duration_us / 1000000;
  }
}

async function decodeLC3(inputPath: string, outputPath: string, repetitions: number = 10): Promise<void> {
  // Load WASM module
  const wasmBuffer = await fs.promises.readFile(path.resolve(__dirname, "../liblc3.wasm"));
  const wasmModule = await WebAssembly.instantiate(wasmBuffer, {});

  const lc3 = new LC3Module(
    wasmModule.instance,
    10000,  // 10ms frames
    16000   // 16kHz
  );

  const decoder = lc3.create();
  const inputData = await fs.promises.readFile(inputPath);
  const numFrames = Math.floor(inputData.length / 20);
  
  // Calculate audio duration
  const frameDurationSec = lc3.getFrameDurationSeconds();
  const singlePassDurationSec = numFrames * frameDurationSec;
  const totalDurationSec = singlePassDurationSec * repetitions;
  
  console.log(`Input file: ${inputPath}`);
  console.log(`Number of frames: ${numFrames}`);
  console.log(`Frame duration: ${frameDurationSec.toFixed(3)}s (${lc3.getFrameDurationSeconds() * 1000}ms)`);
  console.log(`Audio duration per repetition: ${singlePassDurationSec.toFixed(2)}s (${(singlePassDurationSec / 60).toFixed(2)}min)`);
  console.log(`Total audio to be processed: ${totalDurationSec.toFixed(2)}s (${(totalDurationSec / 60).toFixed(2)}min)`);
  
  const writeStream = fs.createWriteStream(outputPath);

  console.log(`Processing ${repetitions} repetitions of ${numFrames} frames each...`);
  const startTime = process.hrtime();

  for (let rep = 0; rep < repetitions; rep++) {
    for (let i = 0; i < numFrames; i++) {
      // Copy frame data to proper location
      decoder.frame.set(inputData.subarray(i * 20, (i + 1) * 20));
      
      // Decode frame
      decoder.decode();

      // Convert Float32 samples to Int16 PCM
      const pcmBuffer = Buffer.alloc(decoder.samples.length * 2);
      for (let j = 0; j < decoder.samples.length; j++) {
        pcmBuffer.writeInt16LE(
          Math.max(-32768, Math.min(32767, Math.floor(decoder.samples[j] * 32768))),
          j * 2
        );
      }

      writeStream.write(pcmBuffer);
    }

    if ((rep + 1) % 2 === 0) {
      const elapsedTime = process.hrtime(startTime);
      const seconds = elapsedTime[0] + elapsedTime[1] / 1e9;
      const audioProcessed = (rep + 1) * singlePassDurationSec;
      console.log(`Completed ${rep + 1}/${repetitions} repetitions (${seconds.toFixed(2)}s elapsed, ${audioProcessed.toFixed(2)}s of audio processed)`);
    }
  }

  writeStream.end();
  
  const finalElapsedTime = process.hrtime(startTime);
  const finalSeconds = finalElapsedTime[0] + finalElapsedTime[1] / 1e9;
  console.log(`\nDecoding complete!`);
  console.log(`Total processing time: ${finalSeconds.toFixed(2)}s`);
  console.log(`Processing speed: ${(totalDurationSec / finalSeconds).toFixed(2)}x realtime`);
}

// Main execution
if (process.argv.length < 4) {
  console.error('Usage: node decode.js <input.lc3> <output.pcm> [repetitions]');
  process.exit(1);
}

const repetitions = process.argv.length >= 5 ? parseInt(process.argv[4]) : 1000;

decodeLC3(process.argv[2], process.argv[3], repetitions)
  .then(() => {
    console.log('Done!');
  })
  .catch(console.error);
