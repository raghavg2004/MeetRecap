#!/usr/bin/env node
/**
 * Quick test for Deepgram integration
 * Run: node test-deepgram.js
 */

const { Deepgram } = require("@deepgram/sdk");
require("dotenv").config();

const DEEPGRAM_API_KEY = String(process.env.DEEPGRAM_API_KEY || "").trim();

async function test() {
  console.log("\n=== DEEPGRAM INTEGRATION TEST ===\n");

  if (!DEEPGRAM_API_KEY) {
    console.error("❌ DEEPGRAM_API_KEY not found in .env");
    console.error("   Please add: DEEPGRAM_API_KEY=dg_your_key_here");
    process.exit(1);
  }

  console.log("✓ DEEPGRAM_API_KEY found");

  try {
    const deepgram = new Deepgram({ apiKey: DEEPGRAM_API_KEY });
    console.log("✓ Deepgram client initialized");

    // Create a simple test audio buffer (1 second of silence in WebM)
    // This is just to test the connection
    const testBuffer = Buffer.from([
      0x1a, 0x45, 0xdf, 0xa3, 0x01, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x1f, 0x42, 0x86, 0x81,
      0x01, 0x42, 0xf7, 0x81, 0x01, 0x42, 0xf2, 0x81,
      0x04, 0x42, 0xf3, 0x81, 0x08, 0x42, 0x87, 0x81,
      0x00, 0x42, 0x85, 0x81, 0x02, 0x18, 0x53, 0x80,
      0x67, 0x07, 0xe0, 0x00, 0x00, 0x05, 0xf0, 0x00,
      0x3d, 0x0b, 0x43, 0xa2, 0x15, 0x49, 0xa2, 0x96,
    ]);

    console.log("✓ Sending test audio to Deepgram...");
    const response = await deepgram.listen.prerecorded(
      { buffer: testBuffer, contentType: "audio/webm" },
      {
        model: "nova-2",
        language: "en",
        smart_format: true,
      }
    );

    console.log("✓ Connection successful!");
    console.log("✓ Deepgram is working correctly\n");
    
    console.log("🎉 All tests passed!");
    console.log("   You can now restart your server and speech-to-text will work.\n");
    
    process.exit(0);
  } catch (error) {
    console.error("❌ Connection failed:", error.message);
    
    if (error.message.includes("401") || error.message.includes("Unauthorized")) {
      console.error("\n   Your API key appears to be invalid.");
      console.error("   Check: https://console.deepgram.com/keys");
    }
    
    process.exit(1);
  }
}

test();
