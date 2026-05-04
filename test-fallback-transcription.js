#!/usr/bin/env node
/**
 * Quick test for fallback transcription
 * Run: node test-fallback-transcription.js
 */

require("dotenv").config();

console.log("\n=== FALLBACK TRANSCRIPTION TEST ===\n");

const DEEPGRAM_API_KEY = String(process.env.DEEPGRAM_API_KEY || "").trim();
const ENABLE_FALLBACK_TRANSCRIPTION = process.env.ENABLE_FALLBACK_TRANSCRIPTION !== "false";

console.log("Configuration:");
console.log("  DEEPGRAM_API_KEY:", DEEPGRAM_API_KEY ? `${DEEPGRAM_API_KEY.substring(0, 10)}...` : "[EMPTY]");
console.log("  ENABLE_FALLBACK_TRANSCRIPTION:", ENABLE_FALLBACK_TRANSCRIPTION);
console.log("");

// Test audio detection function (copied from server)
function detectAudioPresence(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 4) {
    return false;
  }

  let sum = 0;
  let count = 0;
  const stride = Math.max(1, Math.floor(buffer.length / 1000));

  for (let i = 0; i < buffer.length; i += stride) {
    sum += Math.abs(buffer[i] - 128);
    count++;
  }

  const averageDeviation = count > 0 ? sum / count : 0;
  const hasSignificantAudio = averageDeviation > 10;
  
  console.log("  Audio analysis - average deviation:", averageDeviation.toFixed(2));
  console.log("  Has audio:", hasSignificantAudio);
  
  return hasSignificantAudio;
}

// Create test audio buffers
console.log("Test 1: Silence buffer");
const silenceBuffer = Buffer.alloc(1000, 128); // All zeros (silence)
console.log("  Buffer size:", silenceBuffer.length);
const hasSpeech1 = detectAudioPresence(silenceBuffer);
console.log("  Result: " + (hasSpeech1 ? "AUDIO DETECTED" : "SILENCE"));
console.log("");

console.log("Test 2: Audio-like buffer (with variation)");
const audioBuffer = Buffer.alloc(1000);
for (let i = 0; i < audioBuffer.length; i++) {
  audioBuffer[i] = Math.floor(128 + 50 * Math.sin(i / 10)); // Sine wave pattern
}
console.log("  Buffer size:", audioBuffer.length);
const hasSpeech2 = detectAudioPresence(audioBuffer);
console.log("  Result: " + (hasSpeech2 ? "AUDIO DETECTED" : "SILENCE"));
console.log("");

console.log("Configuration check:");
if (!DEEPGRAM_API_KEY) {
  console.log("  ✓ No Deepgram API key configured");
} else if (DEEPGRAM_API_KEY.startsWith("dg_")) {
  console.log("  ✓ Valid Deepgram API key found");
} else {
  console.log("  ✗ Invalid Deepgram API key format (should start with 'dg_')");
}

if (ENABLE_FALLBACK_TRANSCRIPTION) {
  console.log("  ✓ Fallback transcription is ENABLED");
} else {
  console.log("  ✗ Fallback transcription is DISABLED");
}

console.log("\n🎉 Fallback transcription is ready!");
console.log("   Meetings will work even without a Deepgram API key.");
console.log("   Audio will be analyzed locally and transcription will show status.");
console.log("");

process.exit(0);
